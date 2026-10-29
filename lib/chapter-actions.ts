"use server";

/**
 * Chapter mutations.
 *
 * The RPCs own permissions and the status matrix; this module validates the
 * browser payload, maps SQLSTATEs to the UI's failure names, and removes
 * Storage objects when a panel or chapter goes away.
 *
 * Panel uploads are done by the browser (direct to Storage) and then registered
 * here, so a failed row insert leaves an orphan object the caller can remove.
 */

import type {
  Chapter,
  ChapterFailure,
  ChapterStatus,
  Panel,
} from "./chapters";
import {
  cleanChapterTitle,
  MAX_BLOCK_TEXT,
  MAX_CHAPTER_TITLE,
  validateChapterNumber,
} from "./chapters";
import { classifyDbError, messageForDbError } from "./errors";
import {
  MAX_CHAPTER_BYTES,
  MAX_CHAPTER_PAGES,
  MAX_PAGE_BYTES,
  formatMB,
} from "./engine-limits";
import { getViewer } from "./session";
import { mapChapterRow, type ChapterRow } from "./server/chapters";
import { createClient } from "./supabase/server";
import { createAdminClient } from "./supabase/admin";

/* ------------------------------------------------------------------ */
/* Result shape                                                        */
/* ------------------------------------------------------------------ */

export type ChapterActionFailure = ChapterFailure | "signed-out";

export type ChapterActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: ChapterActionFailure; message: string };

type DbError = { code?: string; message?: string } | null;

function failure(
  code: ChapterActionFailure,
  message: string
): ChapterActionResult<never> {
  return { ok: false, code, message };
}

function fromDbError(
  error: DbError,
  fallback = "Something went wrong. Try again."
): ChapterActionResult<never> {
  const code = classifyDbError(error);
  return failure(code, messageForDbError(code, error, fallback));
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
/* Chapters                                                            */
/* ------------------------------------------------------------------ */

export async function createChapterAction(
  seriesId: string
): Promise<ChapterActionResult<Chapter>> {
  const auth = await requireViewer();
  if (!auth.ok) return auth.result;

  if (!isUuid(seriesId)) {
    return failure("not-found", "That series no longer exists.");
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_chapter", {
    p_series_id: seriesId,
  });

  if (error || !data) {
    return fromDbError(error, "We couldn't create that chapter.");
  }

  return {
    ok: true,
    data: mapChapterRow(data as unknown as ChapterRow),
  };
}

export type UpdateChapterDetailsPayload = {
  chapterId: string;
  number?: number;
  title?: string | null;
};

export async function updateChapterDetailsAction(
  input: UpdateChapterDetailsPayload
): Promise<ChapterActionResult<{ number: number; title: string | null }>> {
  const auth = await requireViewer();
  if (!auth.ok) return auth.result;

  if (!isUuid(input.chapterId)) {
    return failure("not-found", "That chapter no longer exists.");
  }

  if (input.number !== undefined) {
    const numberError = validateChapterNumber(input.number);
    if (numberError) return failure("invalid-number", numberError);
  }

  const title =
    input.title === undefined
      ? undefined
      : input.title === null
        ? null
        : cleanChapterTitle(input.title);

  if (title !== undefined && title !== null && title.length > MAX_CHAPTER_TITLE) {
    return failure(
      "invalid-title",
      `Keep the title to ${MAX_CHAPTER_TITLE} characters or fewer.`
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("update_chapter_details", {
    p_chapter_id: input.chapterId,
    p_number: input.number ?? null,
    p_title: title === undefined ? null : title,
  });

  if (error || !data) {
    return fromDbError(error, "We couldn't save that chapter.");
  }

  const row = data as unknown as ChapterRow;
  return { ok: true, data: { number: Number(row.number), title: row.title } };
}

export async function setChapterStatusAction(input: {
  chapterId: string;
  next: ChapterStatus;
  note?: string | null;
}): Promise<ChapterActionResult<{ status: ChapterStatus }>> {
  const auth = await requireViewer();
  if (!auth.ok) return auth.result;

  if (!isUuid(input.chapterId)) {
    return failure("not-found", "That chapter no longer exists.");
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("set_chapter_status", {
    p_chapter_id: input.chapterId,
    p_next: input.next,
    p_note: input.note ?? null,
  });

  if (error || !data) {
    return fromDbError(error, "We couldn't change that status.");
  }

  return {
    ok: true,
    data: { status: (data as unknown as ChapterRow).status },
  };
}

export async function deleteChapterAction(input: {
  chapterId: string;
}): Promise<ChapterActionResult<{ removedObjects: number }>> {
  const auth = await requireViewer();
  if (!auth.ok) return auth.result;

  if (!isUuid(input.chapterId)) {
    return failure("not-found", "That chapter no longer exists.");
  }

  const supabase = await createClient();

  const { data: pageData, error: pageError } = await supabase
    .from("chapter_pages")
    .select("original_path, clean_path")
    .eq("chapter_id", input.chapterId);

  if (pageError) {
    return fromDbError(pageError, "We couldn't delete that chapter.");
  }

  const pageRows = (pageData ?? []) as Array<{
    original_path: string;
    clean_path: string | null;
  }>;
  const paths = pageRows.map((page) => page.original_path);
  const renderPaths = pageRows.flatMap((page) => (page.clean_path ? [page.clean_path] : []));

  const { error } = await supabase.rpc("delete_chapter", {
    p_chapter_id: input.chapterId,
  });

  if (error) {
    return fromDbError(error, "We couldn't delete that chapter.");
  }

  // The `pages` delete policy resolves the chapter from the object path, so it
  // stops matching the instant `delete_chapter` removes the row. A normal
  // client remove after this point no-ops and every panel image is orphaned.
  // The cleanup is maintenance, not a user action, so it goes through the
  // privileged client; there is no row left for RLS to authorize against.
  let removedObjects = 0;

  if (paths.length > 0) {
    try {
      const { data: removed, error: removeError } = await createAdminClient()
        .storage.from("pages")
        .remove(paths);

      if (removeError) {
        console.warn(
          `[chapters] chapter ${input.chapterId} deleted with orphaned images: ${removeError.message}`
        );
      } else {
        removedObjects = removed?.length ?? 0;
      }
    } catch (cause) {
      // A missing secret key must not turn a completed deletion into an error.
      console.warn(
        `[chapters] storage cleanup skipped for ${input.chapterId}: ${
          cause instanceof Error ? cause.message : "unknown error"
        }`
      );
    }
  }

  // Engine renders live in their own bucket, so they are not covered by the
  // `pages` cleanup above. Same reasoning: the row is gone, so the privileged
  // client does the maintenance, and a failure must not fail the delete.
  if (renderPaths.length > 0) {
    try {
      const { error: renderError } = await createAdminClient()
        .storage.from("renders")
        .remove(renderPaths);

      if (renderError) {
        console.warn(
          `[chapters] chapter ${input.chapterId} deleted with orphaned renders: ${renderError.message}`
        );
      }
    } catch (cause) {
      console.warn(
        `[chapters] render cleanup skipped for ${input.chapterId}: ${
          cause instanceof Error ? cause.message : "unknown error"
        }`
      );
    }
  }

  return { ok: true, data: { removedObjects } };
}

/* ------------------------------------------------------------------ */
/* Blocks                                                              */
/* ------------------------------------------------------------------ */

export async function updateBlockTextAction(input: {
  blockId: string;
  finalText: string;
}): Promise<ChapterActionResult<{ blockId: string; finalText: string }>> {
  const auth = await requireViewer();
  if (!auth.ok) return auth.result;

  if (!isUuid(input.blockId)) {
    return failure("not-found", "That bubble no longer exists.");
  }

  const finalText = input.finalText.trim();
  if (finalText.length > MAX_BLOCK_TEXT) {
    return failure(
      "unknown",
      `Keep a bubble under ${MAX_BLOCK_TEXT} characters.`
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_block_text", {
    p_block_id: input.blockId,
    p_final_text: finalText,
  });

  if (error) return fromDbError(error, "We couldn't save that line.");

  return { ok: true, data: { blockId: input.blockId, finalText } };
}

/* ------------------------------------------------------------------ */
/* Panels                                                              */
/* ------------------------------------------------------------------ */

export type RegisterPanelInput = {
  id: string;
  index: number;
  path: string;
  width: number;
  height: number;
  byteSize: number;
};

export async function registerPanelsAction(input: {
  chapterId: string;
  panels: RegisterPanelInput[];
}): Promise<ChapterActionResult<{ registered: number }>> {
  const auth = await requireViewer();
  if (!auth.ok) return auth.result;

  if (!isUuid(input.chapterId)) {
    return failure("not-found", "That chapter no longer exists.");
  }

  for (const panel of input.panels) {
    if (
      !isUuid(panel.id) ||
      !Number.isInteger(panel.index) ||
      panel.index < 0 ||
      typeof panel.path !== "string" ||
      panel.path.length === 0 ||
      !Number.isInteger(panel.width) ||
      panel.width <= 0 ||
      !Number.isInteger(panel.height) ||
      panel.height <= 0 ||
      !Number.isInteger(panel.byteSize) ||
      panel.byteSize <= 0
    ) {
      return failure("unknown", "One of those panels could not be registered.");
    }
    if (panel.byteSize > MAX_PAGE_BYTES) {
      return failure(
        "unknown",
        `One page is over ${formatMB(MAX_PAGE_BYTES)}. The engine cannot accept it.`
      );
    }
    // Stored originals are PNG now, whatever the upload started as. Catch a
    // client that skipped (or broke) the browser-side conversion here, so the
    // bucket never receives a WebP object with a `.png` name.
    if (typeof panel.path === "string" && !panel.path.toLowerCase().endsWith(".png")) {
      return failure(
        "unknown",
        "Pages must be stored as PNG at full resolution. Reload the page and try that upload again."
      );
    }
  }

  const supabase = await createClient();

  // Client-side caps are friendly, not authoritative: a second tab can upload
  // at the same time, and register_panels can be called directly. Count what
  // the DATABASE already has. The SQL migration adds a trigger as a backstop,
  // but this check works even on a deployment that has not run it yet.
  const { count: existingCount, error: countError } = await supabase
    .from("chapter_pages")
    .select("id", { count: "exact", head: true })
    .eq("chapter_id", input.chapterId);
  if (countError) return fromDbError(countError, "Couldn't check the page count.");

  const { data: sizeRows, error: sizeError } = await supabase
    .from("chapter_pages")
    .select("byte_size")
    .eq("chapter_id", input.chapterId);
  if (sizeError) return fromDbError(sizeError, "Couldn't check the chapter size.");

  const existing = existingCount ?? 0;
  // Re-registering a batch after a partial failure is safe: those IDs already
  // exist and must not count twice.
  const incomingIds = input.panels.map((panel) => panel.id);
  const { data: duplicateRows, error: duplicateError } = await supabase
    .from("chapter_pages")
    .select("id")
    .in("id", incomingIds);
  if (duplicateError) {
    return fromDbError(duplicateError, "Couldn't verify whether those pages were already registered.");
  }
  const known = new Set((duplicateRows || []).map((row) => row.id));
  const genuinelyNew = input.panels.filter((panel) => !known.has(panel.id));

  if (existing + genuinelyNew.length > MAX_CHAPTER_PAGES) {
    return failure(
      "unknown",
      `A chapter holds at most ${MAX_CHAPTER_PAGES} pages. Delete a page before adding another.`
    );
  }
  const existingBytes = (sizeRows || []).reduce(
    (sum, row) => sum + (Number(row.byte_size) || 0),
    0
  );
  const newBytes = genuinelyNew.reduce((sum, panel) => sum + panel.byteSize, 0);
  if (existingBytes + newBytes > MAX_CHAPTER_BYTES) {
    return failure(
      "unknown",
      `The chapter would exceed the ${formatMB(MAX_CHAPTER_BYTES)} engine limit. Split it into two chapters.`
    );
  }

  const { data, error } = await supabase.rpc("register_panels", {
    p_chapter_id: input.chapterId,
    p_panels: input.panels,
  });

  if (error) return fromDbError(error, "Couldn't register those panels.");

  // `on conflict (id) do nothing` means a retry re-sends rows that already
  // exist. Report what the database wrote, not what we asked it to write.
  const registered =
    typeof data === "number" ? data : input.panels.length;

  return { ok: true, data: { registered } };
}

export async function removePanelAction(input: {
  chapterId: string;
  panelId: string;
}): Promise<ChapterActionResult<null>> {
  const auth = await requireViewer();
  if (!auth.ok) return auth.result;

  if (!isUuid(input.chapterId) || !isUuid(input.panelId)) {
    return failure("not-found", "That panel no longer exists.");
  }

  const supabase = await createClient();

  // The object path is read here, never accepted from the browser: a client
  // that could name the path could ask the delete policy to remove any object
  // it likes. Scoping the read to this chapter also proves the panel is ours.
  const { data: panelRow, error: panelError } = await supabase
    .from("chapter_pages")
    .select("original_path, clean_path")
    .eq("id", input.panelId)
    .eq("chapter_id", input.chapterId)
    .maybeSingle();

  if (panelError) return fromDbError(panelError, "Couldn't remove that panel.");

  const { error } = await supabase.rpc("remove_panel", {
    p_chapter_id: input.chapterId,
    p_page_id: input.panelId,
  });

  if (error) return fromDbError(error, "Couldn't remove that panel.");

  const row = panelRow as unknown as {
    original_path: string;
    clean_path: string | null;
  } | null;

  if (row?.original_path) {
    await supabase.storage.from("pages").remove([row.original_path]);
  }

  // The render lives in a different bucket and is not covered by the `pages`
  // delete policy once the row is gone, so it goes through the admin client —
  // same reasoning as deleteChapterAction.
  if (row?.clean_path) {
    try {
      await createAdminClient().storage.from("renders").remove([row.clean_path]);
    } catch (cause) {
      console.warn(
        `[chapters] panel ${input.panelId} removed with an orphaned render: ${
          cause instanceof Error ? cause.message : "unknown error"
        }`
      );
    }
  }

  return { ok: true, data: null };
}

/** Unused helper kept close to the action types. */
export type ChapterActionPanel = Panel;
