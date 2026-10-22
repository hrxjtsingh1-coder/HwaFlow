/**
 * POST /api/pipeline/translate — the whole chapter, one call.
 *
 * JSON in, JSON out: no images ride along, so the body stays small even at 40
 * panels. One call for the whole chapter is the point — pronouns, forms of
 * address and callbacks stay consistent because the model can see every panel.
 *
 * Truncation valve: if the provider returns an unreadable body and the chapter
 * has more than 20 panels, the list is halved once and each half retried before
 * `bad-response` is reported.
 */

import {
  hasGeminiKey,
  isMockPipeline,
  mockTranslate,
  translatePanels,
} from "@/lib/ai/gemini";
import {
  PipelineError,
  isPipelineError,
  toPipelineFailure,
  type ChapterContext,
  type SourceLanguage,
  type TranslateResponse,
} from "@/lib/ai/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type BlockInput = { index: number; sourceText: string };
type PanelInput = { panelId: string; blocks: BlockInput[] };

const LANGUAGES: SourceLanguage[] = ["ko", "ja", "zh"];

function parseBody(raw: unknown): {
  panels: PanelInput[];
  language: SourceLanguage;
  context: ChapterContext;
} {
  const body = raw as {
    panels?: unknown;
    language?: unknown;
    context?: unknown;
  };

  if (!Array.isArray(body.panels) || body.panels.length === 0) {
    throw new PipelineError("invalid-request", "No panels were sent.");
  }
  if (!LANGUAGES.includes(body.language as SourceLanguage)) {
    throw new PipelineError("invalid-request", "Unsupported source language.");
  }

  const context = body.context as Partial<ChapterContext> | null | undefined;
  if (
    !context ||
    typeof context.seriesTitle !== "string" ||
    typeof context.chapterNumber !== "number"
  ) {
    throw new PipelineError("invalid-request", "Missing chapter context.");
  }

  const panels: PanelInput[] = body.panels.map((entry) => {
    const panel = entry as { panelId?: unknown; blocks?: unknown };
    if (typeof panel.panelId !== "string" || !panel.panelId) {
      throw new PipelineError("invalid-request", "A panel is missing its id.");
    }
    if (!Array.isArray(panel.blocks)) {
      throw new PipelineError("invalid-request", "A panel has no blocks.");
    }
    const blocks: BlockInput[] = panel.blocks.map((blockEntry) => {
      const block = blockEntry as { index?: unknown; sourceText?: unknown };
      if (
        typeof block.index !== "number" ||
        !Number.isFinite(block.index) ||
        typeof block.sourceText !== "string"
      ) {
        throw new PipelineError("invalid-request", "A block is malformed.");
      }
      return { index: block.index, sourceText: block.sourceText };
    });
    return { panelId: panel.panelId, blocks };
  });

  return {
    panels,
    language: body.language as SourceLanguage,
    context: {
      seriesTitle: context.seriesTitle,
      synopsis: context.synopsis ?? null,
      chapterNumber: context.chapterNumber,
    },
  };
}

async function translateWithValve(input: {
  panels: PanelInput[];
  language: SourceLanguage;
  context: ChapterContext;
}): Promise<TranslateResponse> {
  try {
    return await translatePanels(input);
  } catch (error) {
    if (
      !isPipelineError(error, "bad-response") ||
      input.panels.length <= 20
    ) {
      throw error;
    }

    // Split exactly once. The halves carry the same context, so the only loss
    // is cross-half polish, which beats losing the chapter.
    const midpoint = Math.ceil(input.panels.length / 2);
    const head = await translatePanels({
      ...input,
      panels: input.panels.slice(0, midpoint),
    });
    const tail = await translatePanels({
      ...input,
      panels: input.panels.slice(midpoint),
    });

    return { translations: [...head.translations, ...tail.translations] };
  }
}

export async function POST(request: Request) {
  try {
    if (!isMockPipeline() && !hasGeminiKey()) {
      throw new PipelineError("missing-key");
    }

    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      throw new PipelineError("invalid-request", "Expected a JSON body.");
    }

    const input = parseBody(raw);

    if (isMockPipeline()) {
      return Response.json(mockTranslate(input.panels));
    }

    return Response.json(await translateWithValve(input));
  } catch (error) {
    const { status, body } = toPipelineFailure(error);
    return Response.json(body, { status });
  }
}
