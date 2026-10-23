/**
 * Postgres error classification for the chapter actions.
 *
 * Two different unique constraints can raise `23505` here: a chapter number
 * clash (`chapters_series_id_number_key`) and a page-position clash
 * (`chapter_pages_chapter_id_page_index_key`). Mapping the SQLSTATE alone told
 * the user "that chapter number is already taken" when the real problem was a
 * second upload racing them to page 4 — advice that cannot fix anything.
 *
 * Constraint names are stable and appear in the message, so classify on the
 * message for 23505 and on the SQLSTATE for everything else.
 */

import type { ChapterFailure } from "./chapters";

type DbError = { code?: string; message?: string } | null;

const SQLSTATE: Record<string, ChapterFailure> = {
  HF001: "forbidden",
  HF002: "not-found",
  HF020: "invalid-number",
  HF021: "duplicate-number",
  HF022: "invalid-title",
  HF023: "no-content",
  HF024: "bad-transition",
  HF025: "unknown",
  HF026: "unknown",
  "23505": "duplicate-number",
  "23503": "not-found",
  "23514": "invalid-number",
  "42501": "forbidden",
};

/** Friendly copy for codes whose database message must never reach the user. */
const MESSAGES: Partial<Record<ChapterFailure, string>> = {
  "duplicate-panel":
    "Someone else added a page at the same position. Refresh and try again.",
};

export function classifyDbError(error: DbError): ChapterFailure {
  if (!error) return "unknown";

  if (error.code === "23505") {
    return /page_index/i.test(error.message ?? "")
      ? "duplicate-panel"
      : "duplicate-number";
  }

  return (error.code ? SQLSTATE[error.code] : undefined) ?? "unknown";
}

export function messageForDbError(
  code: ChapterFailure,
  error: DbError,
  fallback = "Something went wrong. Try again."
): string {
  return MESSAGES[code] ?? error?.message ?? fallback;
}
