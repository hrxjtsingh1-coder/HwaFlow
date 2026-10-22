/**
 * POST /api/pipeline/extract — read the text out of 1–10 panels.
 *
 * multipart/form-data in, JSON out. Images stay binary on the wire: base64 in a
 * JSON body would inflate a 4 MB batch past the function body limit before
 * `BATCH_MAX_BYTES` ever got a chance to halve it.
 *
 *   part "meta"      JSON { panels: [{ panelId, index }], language, readingDirection }
 *   part "panel-0"   image/webp blob
 *   part "panel-1"   …
 *
 * The key is read from `process.env` here, never at module scope. This route is
 * the only place the browser can reach the provider.
 */

import {
  BATCH_MAX_BYTES,
  extractPanels,
  hasGeminiKey,
  isMockPipeline,
  mockExtract,
  type ImageInput,
} from "@/lib/ai/gemini";
import {
  PipelineError,
  toPipelineFailure,
  type ExtractedPanel,
  type ReadingDirection,
  type SourceLanguage,
} from "@/lib/ai/types";
import { requirePipelineViewer } from "@/lib/pipeline-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type MetaPanel = { panelId: string; index: number };

const LANGUAGES: SourceLanguage[] = ["ko", "ja", "zh"];
const DIRECTIONS: ReadingDirection[] = ["ttb", "rtl", "ltr"];

/**
 * The manifest may arrive as a plain text field (what the browser sends) or as
 * a file part (what `curl -F meta=@file` sends). Both are valid.
 */
async function readManifest(
  raw: FormDataEntryValue | null
): Promise<string> {
  if (typeof raw === "string") return raw;
  if (raw && typeof (raw as Blob).text === "function") {
    return await (raw as Blob).text();
  }
  throw new PipelineError("invalid-request", "Missing the panel manifest.");
}

async function parseMeta(raw: FormDataEntryValue | null): Promise<{
  panels: MetaPanel[];
  language: SourceLanguage;
  readingDirection: ReadingDirection;
}> {
  const manifest = await readManifest(raw);

  let parsed: unknown;
  try {
    parsed = JSON.parse(manifest);
  } catch {
    throw new PipelineError("invalid-request", "The panel manifest wasn't JSON.");
  }

  const record = parsed as {
    panels?: unknown;
    language?: unknown;
    readingDirection?: unknown;
  };

  if (!Array.isArray(record.panels) || record.panels.length === 0) {
    throw new PipelineError("invalid-request", "No panels were listed.");
  }
  if (!LANGUAGES.includes(record.language as SourceLanguage)) {
    throw new PipelineError("invalid-request", "Unsupported source language.");
  }
  if (!DIRECTIONS.includes(record.readingDirection as ReadingDirection)) {
    throw new PipelineError("invalid-request", "Unsupported reading direction.");
  }

  const panels: MetaPanel[] = record.panels.map((entry, position) => {
    const panel = entry as { panelId?: unknown; index?: unknown };
    if (typeof panel.panelId !== "string" || !panel.panelId) {
      throw new PipelineError("invalid-request", "A panel is missing its id.");
    }
    return {
      panelId: panel.panelId,
      index:
        typeof panel.index === "number" && Number.isFinite(panel.index)
          ? panel.index
          : position,
    };
  });

  return {
    panels,
    language: record.language as SourceLanguage,
    readingDirection: record.readingDirection as ReadingDirection,
  };
}

/**
 * Size valve: a batch whose encoded images exceed `BATCH_MAX_BYTES` is split in
 * half and sent twice, recursively. Denser scans then complete with one extra
 * request instead of failing on a body limit. Split is sequential so a single
 * run cannot burst past the per-minute cap.
 */
async function extractChunk(
  images: ImageInput[],
  language: SourceLanguage,
  readingDirection: ReadingDirection
): Promise<ExtractedPanel[]> {
  if (images.length === 0) return [];

  const encoded = images.reduce((total, image) => total + image.base64.length, 0);
  if (encoded > BATCH_MAX_BYTES && images.length > 1) {
    const midpoint = Math.ceil(images.length / 2);
    const head = await extractChunk(
      images.slice(0, midpoint),
      language,
      readingDirection
    );
    const tail = await extractChunk(
      images.slice(midpoint),
      language,
      readingDirection
    );
    return [...head, ...tail];
  }

  const response = await extractPanels({ images, language, readingDirection });
  return response.panels;
}

export async function POST(request: Request) {
  try {
    const auth = await requirePipelineViewer();
    if (!auth.ok) return auth.response;

    if (!isMockPipeline() && !hasGeminiKey()) {
      throw new PipelineError("missing-key");
    }

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      throw new PipelineError(
        "invalid-request",
        "Expected multipart/form-data."
      );
    }

    const meta = await parseMeta(form.get("meta"));

    if (meta.panels.length > 10) {
      throw new PipelineError(
        "invalid-request",
        "Send at most 10 panels per extract request."
      );
    }

    if (isMockPipeline()) {
      return Response.json(
        mockExtract(meta.panels.map((panel) => panel.panelId))
      );
    }

    const images: ImageInput[] = [];
    for (let position = 0; position < meta.panels.length; position += 1) {
      const file = form.get(`panel-${position}`);
      if (!(file instanceof Blob)) {
        throw new PipelineError(
          "invalid-request",
          `Panel ${position + 1} is missing from the request.`
        );
      }
      if (!file.type.startsWith("image/")) {
        throw new PipelineError("invalid-request", "Panels must be images.");
      }
      const bytes = Buffer.from(await file.arrayBuffer());
      images.push({
        panelId: meta.panels[position].panelId,
        mimeType: file.type || "image/webp",
        base64: bytes.toString("base64"),
      });
    }

    const panels = await extractChunk(
      images,
      meta.language,
      meta.readingDirection
    );

    return Response.json({ panels });
  } catch (error) {
    const { status, body } = toPipelineFailure(error);
    return Response.json(body, { status });
  }
}

/**
 * The workspace posts here. A GET is almost always someone opening the URL in
 * a browser, so say that instead of returning an empty 405.
 */
export function GET() {
  return Response.json(
    {
      error: "method-not-allowed",
      message:
        "This endpoint only accepts POST. Start the run from the chapter workspace.",
    },
    { status: 405, headers: { Allow: "POST" } }
  );
}
