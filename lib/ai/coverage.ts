/**
 * Coverage checks for a model response.
 *
 * The provider is asked for one entry per bubble and usually complies. When it
 * does not, nothing in the response says so: the array is just shorter. The
 * pipeline used to map whatever came back, apply it, and then mark the chapter
 * `ready` — so a chapter could ship with silent holes where a translation
 * should be, and the only way to find them was to read every bubble.
 *
 * Comparing what we asked for against what came back turns that into a normal,
 * retryable stage failure.
 */

export type RequestedBlock = {
  panelId: string;
  blocks: Array<{ index: number }>;
};

export type ReturnedBlock = {
  panelId: string;
  index: number;
};

/** Keys (`panelId:index`) that were requested but never returned. */
export function missingTranslationKeys(
  requested: readonly RequestedBlock[],
  returned: readonly ReturnedBlock[]
): string[] {
  const seen = new Set(
    returned.map((entry) => `${entry.panelId}:${entry.index}`)
  );

  const missing: string[] = [];
  for (const panel of requested) {
    for (const block of panel.blocks) {
      const key = `${panel.panelId}:${block.index}`;
      if (!seen.has(key)) missing.push(key);
    }
  }

  return missing;
}
