/**
 * Turns an engine `regions.json` payload into the block shape that
 * `set_panel_blocks` accepts.
 *
 * The engine is a separate, deployed service, so this adapter is deliberately
 * forgiving: it accepts the three spellings we know about (`sourceText` /
 * `textSource` / `text`, `textTarget` / `targetText` / `translation`), both box
 * conventions (`{x,y,w,h}`, `{x1,y1,x2,y2}`, `[x,y,w,h]`) and both coordinate
 * spaces (0..1 fractions or page pixels, detected per axis and scaled by the
 * page's real width/height).
 *
 * Normalised 0..1 boxes are what `text_blocks.bbox` stores; each box is
 * relative to the original page's own width and height.
 *
 * Nothing here writes to the database; the import route calls the RPC.
 */

export type PageSize = { width: number; height: number };

export type EngineRegionBlock = {
  index: number;
  sourceText: string;
  baseTranslation: string;
  finalText: string;
  bbox: { x: number; y: number; w: number; h: number } | null;
  confidence: number | null;
};

const SOURCE_KEYS = ["sourceText", "textSource", "text", "originalText", "source", "ocr"];
const TARGET_KEYS = ["textTarget", "targetText", "translation", "translatedText", "target", "translated"];
const INDEX_KEYS = ["index", "blockIndex", "id", "order"];
const CONFIDENCE_KEYS = ["confidence", "score", "probability", "prob"];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function pickString(region: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = region[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function pickNumber(region: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = region[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() !== "") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

/** Accepts `{x,y,w,h}`, `{x1,y1,x2,y2}`, `{left,top,width,height}` or `[x,y,w,h]`. */
function readBox(region: Record<string, unknown>): { x: number; y: number; w: number; h: number } | null {
  const raw = region.bbox ?? region.box ?? region.rect ?? region.bounds;

  if (Array.isArray(raw)) {
    if (raw.length < 4) return null;
    const [x, y, w, h] = raw.slice(0, 4).map(Number);
    if (![x, y, w, h].every((value) => Number.isFinite(value))) return null;
    return { x, y, w, h };
  }

  if (!isRecord(raw)) return null;

  const numberAt = (...keys: string[]): number | null => {
    for (const key of keys) {
      const value = raw[key];
      if (typeof value === "number" && Number.isFinite(value)) return value;
      if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
        return Number(value);
      }
    }
    return null;
  };

  const x = numberAt("x", "left", "x1", "xMin");
  const y = numberAt("y", "top", "y1", "yMin");
  if (x === null || y === null) return null;

  const w = numberAt("w", "width");
  const h = numberAt("h", "height");
  if (w !== null && h !== null) return { x, y, w, h };

  const right = numberAt("x2", "right", "xMax");
  const bottom = numberAt("y2", "bottom", "yMax");
  if (right !== null && bottom !== null) return { x, y, w: right - x, h: bottom - y };

  return null;
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const round = (value: number) => Math.round(value * 10_000) / 10_000;

/**
 * Values above 1 cannot be fractions of a page, so they are pixels. The check
 * is per axis because a crop can start at 0 with a pixel width while the other
 * axis is already fractional.
 */
function normaliseBox(
  box: { x: number; y: number; w: number; h: number },
  page: PageSize
): EngineRegionBlock["bbox"] {
  if (!(box.w > 0) || !(box.h > 0)) return null;

  const scaleX = box.x > 1 || box.w > 1 ? page.width : 1;
  const scaleY = box.y > 1 || box.h > 1 ? page.height : 1;
  if (!(scaleX > 0) || !(scaleY > 0)) return null;

  const x = clamp01(box.x / scaleX);
  const y = clamp01(box.y / scaleY);
  const w = clamp01(box.w / scaleX);
  const h = clamp01(box.h / scaleY);
  if (w <= 0 || h <= 0) return null;

  return { x: round(x), y: round(y), w: round(w), h: round(h) };
}

function readConfidence(region: Record<string, unknown>): number | null {
  const value = pickNumber(region, CONFIDENCE_KEYS);
  if (value === null) return null;
  // Some detectors report percentages; the column is a plain numeric.
  return value > 1 && value <= 100 ? round(value / 100) : value;
}

function regionArray(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (!isRecord(payload)) return [];

  for (const key of ["regions", "blocks", "items", "detections", "boxes"]) {
    const value = payload[key];
    if (Array.isArray(value)) return value;
  }

  // One page of a multi-page document: { pages: [ { regions: [...] } ] }.
  for (const key of ["pages", "results"]) {
    const value = payload[key];
    if (Array.isArray(value) && value.length > 0 && isRecord(value[0])) {
      const nested = value[0].regions;
      if (Array.isArray(nested)) return nested;
    }
  }

  return [];
}

/**
 * `page` is only used to convert pixel boxes; fractional input is passed
 * through untouched, so a missing/unknown page size cannot corrupt a payload
 * that was already normalised.
 */
export function normaliseEngineRegions(payload: unknown, page: PageSize): EngineRegionBlock[] {
  const blocks: EngineRegionBlock[] = [];
  const usedIndexes = new Set<number>();

  for (const [position, entry] of regionArray(payload).entries()) {
    // Some detectors emit an Nx4 array of quads instead of objects.
    const region = Array.isArray(entry) ? ({ bbox: entry } as Record<string, unknown>) : entry;
    if (!isRecord(region)) continue;

    const sourceText = pickString(region, SOURCE_KEYS);
    const targetText = pickString(region, TARGET_KEYS);
    const box = readBox(region);
    const bbox = box ? normaliseBox(box, page) : null;

    // A region with neither text nor a usable box carries nothing to import.
    if (!sourceText && !targetText && !bbox) continue;

    const declared = pickNumber(region, INDEX_KEYS);
    let index =
      declared !== null && Number.isInteger(declared) && declared >= 0 ? declared : position;
    // `on conflict (page_id, block_index)` cannot touch the same row twice in
    // one statement, so a duplicate index has to move.
    while (usedIndexes.has(index)) index += 1;
    usedIndexes.add(index);

    blocks.push({
      index,
      sourceText,
      baseTranslation: targetText,
      finalText: targetText,
      bbox,
      confidence: readConfidence(region),
    });
  }

  return blocks;
}
