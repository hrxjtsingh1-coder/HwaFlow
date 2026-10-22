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

export const PANEL_BATCH_MAX = 10;

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
