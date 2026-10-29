"use server";

/**
 * Glossary mutations.
 *
 * The RPCs own permissions and manual glossary rules; this module validates the
 * browser payload and maps SQLSTATEs to the UI's failure names.
 */

import {
  cleanTerm,
  MAX_TERM_LENGTH,
  type GlossaryCategory,
  type GlossaryFailure,
  type GlossaryStatus,
  type GlossaryTerm,
} from "./glossary";
import { getViewer } from "./session";
import { mapGlossaryRow } from "./server/glossary";
import { createClient } from "./supabase/server";

export type GlossaryActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: GlossaryFailure | "signed-out"; message: string };

type DbError = { code?: string; message?: string } | null;

const SQLSTATE: Record<string, GlossaryFailure> = {
  HF001: "forbidden",
  HF002: "not-found",
  HF030: "invalid-term",
  HF031: "duplicate-term",
  "23505": "duplicate-term",
  "23503": "not-found",
  "23514": "invalid-term",
  "42501": "forbidden",
};

function failure(
  code: GlossaryFailure | "signed-out",
  message: string
): GlossaryActionResult<never> {
  return { ok: false, code, message };
}

function fromDbError(
  error: DbError,
  fallback = "Something went wrong. Try again."
): GlossaryActionResult<never> {
  if (!error) return failure("unknown", fallback);
  return failure(
    (error.code ? SQLSTATE[error.code] : undefined) ?? "unknown",
    error.message || fallback
  );
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

function isValidCategory(value: string): value is GlossaryCategory {
  return ["character", "place", "honorific", "item", "term"].includes(value);
}

/* ------------------------------------------------------------------ */
/* Manual                                                              */
/* ------------------------------------------------------------------ */

export async function addGlossaryTermAction(input: {
  seriesId: string;
  sourceTerm: string;
  targetTerm: string;
  category: GlossaryCategory;
}): Promise<GlossaryActionResult<GlossaryTerm>> {
  const auth = await requireViewer();
  if (!auth.ok) return auth.result;

  const source = cleanTerm(input.sourceTerm);
  const target = cleanTerm(input.targetTerm);

  if (!source || source.length > MAX_TERM_LENGTH) {
    return failure(
      "invalid-term",
      `Add a term of ${MAX_TERM_LENGTH} characters or fewer.`
    );
  }
  if (!target || target.length > MAX_TERM_LENGTH) {
    return failure(
      "invalid-term",
      `Add a translation of ${MAX_TERM_LENGTH} characters or fewer.`
    );
  }
  if (!isValidCategory(input.category)) {
    return failure("invalid-term", "Choose a category for that term.");
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("add_glossary_term", {
    p_series_id: input.seriesId,
    p_source_term: source,
    p_target_term: target,
    p_category: input.category,
  });

  if (error || !data) {
    return fromDbError(error, "We couldn't add that term.");
  }

  return { ok: true, data: mapGlossaryRow(data as never) };
}

export async function updateGlossaryTermAction(input: {
  termId: string;
  targetTerm: string;
  category: GlossaryCategory;
}): Promise<GlossaryActionResult<GlossaryTerm>> {
  const auth = await requireViewer();
  if (!auth.ok) return auth.result;

  const target = cleanTerm(input.targetTerm);
  if (!target || target.length > MAX_TERM_LENGTH) {
    return failure(
      "invalid-term",
      `Add a translation of ${MAX_TERM_LENGTH} characters or fewer.`
    );
  }
  if (!isValidCategory(input.category)) {
    return failure("invalid-term", "Choose a category for that term.");
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("update_glossary_term", {
    p_term_id: input.termId,
    p_target_term: target,
    p_category: input.category,
  });

  if (error || !data) {
    return fromDbError(error, "We couldn't save that term.");
  }

  return { ok: true, data: mapGlossaryRow(data as never) };
}

export async function setGlossaryStatusAction(input: {
  termId: string;
  status: GlossaryStatus;
}): Promise<GlossaryActionResult<GlossaryTerm>> {
  const auth = await requireViewer();
  if (!auth.ok) return auth.result;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("set_glossary_status", {
    p_term_id: input.termId,
    p_status: input.status,
  });

  if (error || !data) {
    return fromDbError(error, "We couldn't change that term.");
  }

  return { ok: true, data: mapGlossaryRow(data as never) };
}
