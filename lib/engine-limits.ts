/**
 * One source of truth for the chapter page budget.
 *
 * 20 full-resolution PNG pages is the product limit. It is enforced in four
 * places: the upload budget filter, `registerPanelsAction` (server-side
 * cumulative count), the database trigger, and the engine job route. Keeping
 * the numbers here stops those checks from drifting apart.
 *
 * The byte caps mirror the Engine Bridge Worker
 * (`MAX_IMAGE_BYTES = 10 MiB`, `MAX_TOTAL_IMAGE_BYTES = 80 MiB`) and sit under
 * Cloudflare's 100 MB request-body ceiling with room for multipart overhead.
 * The per-page cap also matches the Supabase `pages` bucket.
 * This module is deliberately free of `server-only` imports so client
 * components can use it too.
 */

/** Hard product cap: nobody can add page 21 to a chapter. */
export const MAX_CHAPTER_PAGES = 20;

/** Hard product cap on one original image, in bytes (10 MiB).
 *  Matches the Supabase `pages` bucket `file_size_limit` and the Worker cap. */
export const MAX_PAGE_BYTES = 10 * 1024 * 1024;

/** Hard product cap on the whole chapter, in bytes (80 MiB). */
export const MAX_CHAPTER_BYTES = 80 * 1024 * 1024;

/** Browser canvas guard — beyond this, decoding is unreliable. */
export const MAX_PAGE_PIXELS = 100_000_000;

/** Stored originals are always PNG now. */
export const PAGE_MIME_TYPE = "image/png";

export function formatMB(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** How many more pages the chapter may accept. */
export function remainingPages(existing: number): number {
  return Math.max(0, MAX_CHAPTER_PAGES - existing);
}

/**
 * Validate a batch against the budget. Returns the files that fit and a
 * human-readable reason when some were dropped. Pure — safe to unit test.
 */
export function limitUploadBatch(
  files: Array<{ name: string; size: number }>,
  existing: { pages: number; bytes: number }
): { accepted: number; acceptedIndexes: number[]; reason: string | null } {
  const slots = remainingPages(existing.pages);
  const acceptedIndexes: number[] = [];
  let bytes = existing.bytes;
  let oversized = 0;
  let overBudget = false;

  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    if (acceptedIndexes.length >= slots) break;
    if (file.size > MAX_PAGE_BYTES) {
      oversized += 1;
      continue;
    }
    if (bytes + file.size > MAX_CHAPTER_BYTES) {
      overBudget = true;
      break;
    }
    bytes += file.size;
    acceptedIndexes.push(index);
  }

  const accepted = acceptedIndexes.length;
  const dropped = files.length - accepted;
  if (dropped === 0) return { accepted, acceptedIndexes, reason: null };

  const parts: string[] = [];
  if (slots === 0) {
    parts.push(`A chapter holds at most ${MAX_CHAPTER_PAGES} pages. Delete a page before adding another.`);
  } else if (files.length > slots) {
    parts.push(`Only ${slots} more page${slots === 1 ? "" : "s"} fit in this chapter (max ${MAX_CHAPTER_PAGES}).`);
  }
  if (oversized > 0) {
    parts.push(`${oversized} file${oversized === 1 ? " is" : "s are"} over ${formatMB(MAX_PAGE_BYTES)}.`);
  }
  if (overBudget) {
    parts.push(`The chapter would exceed the ${formatMB(MAX_CHAPTER_BYTES)} engine limit.`);
  }

  return {
    accepted,
    acceptedIndexes,
    reason: parts.join(" ") || "Some files were skipped.",
  };
}

/** Filename for a stored original. Always PNG — never WebP. */
export function pageObjectName(id: string): string {
  return `${id}.png`;
}
