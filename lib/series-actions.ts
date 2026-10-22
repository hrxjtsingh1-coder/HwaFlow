"use server";

/**
 * Series mutations.
 *
 * The RPCs own the role checks and validation; this module validates the shape
 * the browser sent, maps SQLSTATEs to the UI's failure names, and handles the
 * cover upload. Cover uploads happen after the row exists because the object
 * path contains the series id.
 *
 * A failed cover upload never undoes a saved series: the row is valid, it just
 * keeps the generated pastel cover until someone uploads again.
 */

import type { SourceLanguage } from "./ai/types";
import type { Series, SeriesAssignment } from "./series";
import {
  cleanSeriesTitle,
  normalizeRateAmount,
  normalizeReleaseDays,
  normalizeSourceLanguage,
  validateSeriesTitle,
  type SeriesFailure,
} from "./series";
import { MAX_SERIES_COVER_BYTES } from "./series-cover";
import { getViewer } from "./session";
import type { SeriesRow } from "./server/series";
import { signedUrlFor } from "./server/storage";
import { createClient } from "./supabase/server";

/* ------------------------------------------------------------------ */
/* Result shape                                                        */
/* ------------------------------------------------------------------ */

export type SeriesActionFailure = SeriesFailure | "signed-out";

export type SeriesActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: SeriesActionFailure; message: string };

type DbError = { code?: string; message?: string } | null;

const SQLSTATE: Record<string, SeriesFailure> = {
  HF001: "forbidden",
  HF002: "not-found",
  HF012: "not-member",
  HF013: "invalid-title",
  HF014: "invalid-day",
  HF015: "invalid-rate",
  HF016: "invalid-language",
  HF017: "invalid-genre",
  HF018: "invalid-description",
  HF019: "invalid-cover",
  "23503": "not-member",
  "23514": "invalid-title",
};

function failure(
  code: SeriesActionFailure,
  message: string
): SeriesActionResult<never> {
  return { ok: false, code, message };
}

function fromDbError(
  error: DbError,
  fallback = "Something went wrong. Try again."
): SeriesActionResult<never> {
  if (!error) return failure("unknown", fallback);

  const mapped =
    (error.code ? SQLSTATE[error.code] : undefined) ??
    (error.code === "42501" ? "forbidden" : undefined);

  return failure(mapped ?? "unknown", error.message || fallback);
}

async function requireViewer() {
  const viewer = await getViewer();
  if (!viewer) {
    return {
      ok: false as const,
      result: failure(
        "signed-out",
        "Your session expired. Sign in again to continue."
      ),
    };
  }
  return { ok: true as const, viewer };
}

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID.test(value);
}

/* ------------------------------------------------------------------ */
/* Cover decoding                                                      */
/* ------------------------------------------------------------------ */

function decodeCover(
  dataUrl: string
): { bytes: Uint8Array; contentType: string } | null {
  const match = /^data:(image\/(?:webp|png|jpeg));base64,([A-Za-z0-9+/=]+)$/.exec(
    dataUrl
  );
  if (!match) return null;

  let bytes: Uint8Array;
  try {
    bytes = Uint8Array.from(Buffer.from(match[2], "base64"));
  } catch {
    return null;
  }

  if (bytes.byteLength === 0 || bytes.byteLength > MAX_SERIES_COVER_BYTES) {
    return null;
  }

  return { bytes, contentType: match[1] };
}

function actionSeries(
  row: SeriesRow,
  releaseDays: Series["releaseDays"],
  coverUrl: string | null
): Series {
  return {
    id: row.id,
    groupId: row.group_id,
    title: row.title,
    genre: row.genre,
    description: row.description,
    coverDataUrl: coverUrl,
    releaseDays,
    language: row.source_language as SourceLanguage,
    rateAmount: Number(row.rate_amount),
    createdBy: "",
    createdAt: row.created_at,
    archived: row.archived,
  };
}

/* ------------------------------------------------------------------ */
/* Create                                                              */
/* ------------------------------------------------------------------ */

export type CreateSeriesActionInput = {
  groupId: string;
  title: string;
  genre: string;
  description: string;
  coverDataUrl: string | null;
  releaseDays: number[];
  language: SourceLanguage;
  rateAmount: number;
  /** Group member ids selected in the assignee picker. */
  assigneeIds: string[];
};

export async function createSeriesAction(
  input: CreateSeriesActionInput
): Promise<SeriesActionResult<Series>> {
  const auth = await requireViewer();
  if (!auth.ok) return auth.result;

  if (!isUuid(input.groupId)) {
    return failure("not-found", "That group no longer exists.");
  }

  const titleError = validateSeriesTitle(input.title);
  if (titleError) return failure("invalid-title", titleError);

  let releaseDays: Series["releaseDays"];
  let rateAmount: number;
  let language: SourceLanguage;
  try {
    releaseDays = normalizeReleaseDays(input.releaseDays);
    rateAmount = normalizeRateAmount(input.rateAmount);
    language = normalizeSourceLanguage(input.language);
  } catch (error) {
    const code =
      error instanceof Error && "code" in error
        ? (error as { code: SeriesFailure }).code
        : "unknown";
    return failure(
      code,
      error instanceof Error ? error.message : "Check the series details."
    );
  }

  if (!input.assigneeIds.every(isUuid)) {
    return failure(
      "not-member",
      "Everyone assigned must be a member of this group."
    );
  }

  const decodedCover = input.coverDataUrl ? decodeCover(input.coverDataUrl) : null;
  if (input.coverDataUrl && !decodedCover) {
    return failure(
      "invalid-cover",
      "That cover could not be read. Try a smaller image."
    );
  }

  const supabase = await createClient();

  const { data, error } = await supabase.rpc("create_series", {
    p_group_id: input.groupId,
    p_title: cleanSeriesTitle(input.title),
    p_genre: input.genre || null,
    p_description: input.description || null,
    p_source_language: language,
    p_rate_amount: rateAmount,
    p_release_days: releaseDays,
    p_assignee_ids: input.assigneeIds,
  });

  if (error || !data) {
    return fromDbError(error, "We couldn't create that series.");
  }

  const row = data as unknown as SeriesRow;
  let coverUrl: string | null = null;

  if (decodedCover) {
    const path = `${row.group_id}/${row.id}/cover.webp`;
    const { error: uploadError } = await supabase.storage
      .from("covers")
      .upload(path, decodedCover.bytes, {
        contentType: decodedCover.contentType,
        upsert: true,
      });

    if (!uploadError) {
      const { error: coverError } = await supabase.rpc("set_series_cover", {
        p_series_id: row.id,
        p_path: path,
      });

      if (coverError) {
        await supabase.storage.from("covers").remove([path]);
      } else {
        coverUrl = await signedUrlFor(supabase, "covers", path);
      }
    }
  }

  return { ok: true, data: actionSeries(row, releaseDays, coverUrl) };
}

/* ------------------------------------------------------------------ */
/* Update                                                              */
/* ------------------------------------------------------------------ */

export type UpdateSeriesActionInput = {
  seriesId: string;
  title: string;
  genre: string;
  description: string;
  /**
   * `data:` means a newly compressed image to upload. A signed URL means the
   * existing cover is unchanged. `null` removes the cover.
   */
  coverDataUrl: string | null;
  releaseDays: number[];
  language: SourceLanguage;
  rateAmount: number;
};

export async function updateSeriesAction(
  input: UpdateSeriesActionInput
): Promise<SeriesActionResult<Series>> {
  const auth = await requireViewer();
  if (!auth.ok) return auth.result;

  if (!isUuid(input.seriesId)) {
    return failure("not-found", "That series no longer exists.");
  }

  const titleError = validateSeriesTitle(input.title);
  if (titleError) return failure("invalid-title", titleError);

  let releaseDays: Series["releaseDays"];
  let rateAmount: number;
  let language: SourceLanguage;
  try {
    releaseDays = normalizeReleaseDays(input.releaseDays);
    rateAmount = normalizeRateAmount(input.rateAmount);
    language = normalizeSourceLanguage(input.language);
  } catch (error) {
    const code =
      error instanceof Error && "code" in error
        ? (error as { code: SeriesFailure }).code
        : "unknown";
    return failure(
      code,
      error instanceof Error ? error.message : "Check the series details."
    );
  }

  const isNewCover =
    typeof input.coverDataUrl === "string" &&
    input.coverDataUrl.startsWith("data:");
  const decodedCover = isNewCover ? decodeCover(input.coverDataUrl!) : null;
  if (isNewCover && !decodedCover) {
    return failure(
      "invalid-cover",
      "That cover could not be read. Try a smaller image."
    );
  }

  const supabase = await createClient();

  const { data, error } = await supabase.rpc("update_series", {
    p_series_id: input.seriesId,
    p_title: cleanSeriesTitle(input.title),
    p_genre: input.genre || null,
    p_description: input.description || null,
    p_source_language: language,
    p_rate_amount: rateAmount,
    p_release_days: releaseDays,
  });

  if (error || !data) {
    return fromDbError(error, "We couldn't save that series.");
  }

  const row = data as unknown as SeriesRow;
  let coverUrl: string | null = input.coverDataUrl;

  if (decodedCover) {
    const path = `${row.group_id}/${row.id}/cover.webp`;
    const { error: uploadError } = await supabase.storage
      .from("covers")
      .upload(path, decodedCover.bytes, {
        contentType: decodedCover.contentType,
        upsert: true,
      });

    if (!uploadError) {
      const { error: coverError } = await supabase.rpc("set_series_cover", {
        p_series_id: row.id,
        p_path: path,
      });

      if (coverError) {
        await supabase.storage.from("covers").remove([path]);
        coverUrl = null;
      } else {
        coverUrl = await signedUrlFor(supabase, "covers", path);
      }
    }
  } else if (input.coverDataUrl === null) {
    await supabase.rpc("set_series_cover", {
      p_series_id: row.id,
      p_path: null,
    });
    coverUrl = null;
  }

  return { ok: true, data: actionSeries(row, releaseDays, coverUrl) };
}

/* ------------------------------------------------------------------ */
/* Assignments                                                         */
/* ------------------------------------------------------------------ */

export async function setSeriesAssignmentsAction(input: {
  seriesId: string;
  userIds: string[];
}): Promise<SeriesActionResult<SeriesAssignment[]>> {
  const auth = await requireViewer();
  if (!auth.ok) return auth.result;

  if (!isUuid(input.seriesId)) {
    return failure("not-found", "That series no longer exists.");
  }
  if (!input.userIds.every(isUuid)) {
    return failure(
      "not-member",
      "Everyone assigned must be a member of this group."
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_series_assignments", {
    p_series_id: input.seriesId,
    p_user_ids: input.userIds,
  });

  if (error) return fromDbError(error, "We couldn't save assignments.");

  // The caller refreshes; an empty array keeps the result type honest.
  return { ok: true, data: [] };
}
