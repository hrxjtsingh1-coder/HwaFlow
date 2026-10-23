/**
 * Panel batching.
 *
 * Extraction sends up to `PANEL_BATCH_MAX` panels per request, and the split is
 * deliberately even rather than "ten until the tail runs out". Ten panels plus a
 * trailing stub of one is worse than two requests of six and five: the stub costs
 * a whole request from a 500/day budget and its output is more likely to drift.
 *
 *   splitIntoBatches(items, 10)
 *     7  -> [7]
 *     11 -> [6, 5]
 *     25 -> [9, 8, 8]
 *     40 -> [10, 10, 10, 10]
 *     41 -> [9, 8, 8, 8, 8]
 *
 * Sizes differ by at most one, upload order is preserved, and no batch is ever
 * larger than the cap. Pure and dependency-free, so it can be checked without a
 * browser or an API key.
 */

import { PipelineError } from "./types";

export const PANEL_BATCH_MAX = 10;

/**
 * Ceiling for the text stages (translate/proofread). The body is JSON, so the
 * only thing that can grow without bound is the block text itself. These are
 * deliberately generous — a 200-panel chapter is already unusual — but they
 * stop a malformed client (or a runaway retry loop) from building a prompt that
 * costs a whole day's quota in one request.
 */
export const MAX_PANELS_PER_TEXT_REQUEST = 200;
export const MAX_BLOCK_CHARS = 4000;
export const MAX_TEXT_BODY_CHARS = 400_000;

export function assertTextPayloadSize(
  panels: Array<{ blocks: Array<{ text: string }> }>
): void {
  if (panels.length > MAX_PANELS_PER_TEXT_REQUEST) {
    throw new PipelineError(
      "too-large",
      `That chapter is too large: more than ${MAX_PANELS_PER_TEXT_REQUEST} panels. Run it in smaller parts.`
    );
  }

  let total = 0;
  for (const panel of panels) {
    for (const block of panel.blocks) {
      if (block.text.length > MAX_BLOCK_CHARS) {
        throw new PipelineError(
          "too-large",
          `One bubble is longer than ${MAX_BLOCK_CHARS} characters; that is too large to translate.`
        );
      }
      total += block.text.length;
    }
  }

  if (total > MAX_TEXT_BODY_CHARS) {
    throw new PipelineError(
      "too-large",
      "This chapter's text is too large for one request."
    );
  }
}

/**
 * Hard cap for one `/api/pipeline/extract` multipart body. Vercel rejects
 * function requests over 4.5 MB, so keep a margin for multipart overhead.
 * Panels are compressed to at most 400 KB, but never assume that held.
 */
export const EXTRACT_BATCH_MAX_BYTES = 3_000_000;

export function splitIntoBatches<T>(items: T[], max = PANEL_BATCH_MAX): T[][] {
  if (items.length === 0) return [];
  const limit = Math.max(1, Math.floor(max));
  if (items.length <= limit) return [items.slice()];

  const batchCount = Math.ceil(items.length / limit);
  const base = Math.floor(items.length / batchCount);
  const remainder = items.length % batchCount;

  const batches: T[][] = [];
  let cursor = 0;
  for (let index = 0; index < batchCount; index += 1) {
    const size = base + (index < remainder ? 1 : 0);
    batches.push(items.slice(cursor, cursor + size));
    cursor += size;
  }
  return batches;
}

/**
 * Greedy packer for the request-size valve. Keeps adding items while the
 * running encoded size stays inside `budget`, then starts a new chunk.
 *
 * A single item heavier than the budget still gets a chunk of its own — the
 * caller decides whether that is acceptable, because dropping a panel silently
 * would be worse than a request that fails loudly.
 */
export function chunkWithinByteBudget<T>(
  items: T[],
  sizeOf: (item: T) => number,
  budget: number
): T[][] {
  if (items.length === 0) return [];
  const chunks: T[][] = [];
  let current: T[] = [];
  let currentSize = 0;

  for (const item of items) {
    const size = sizeOf(item);
    if (current.length > 0 && currentSize + size > budget) {
      chunks.push(current);
      current = [];
      currentSize = 0;
    }
    current.push(item);
    currentSize += size;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}
