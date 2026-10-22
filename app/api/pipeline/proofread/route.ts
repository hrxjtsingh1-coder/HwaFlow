/**
 * POST /api/pipeline/proofread — chapter-wide polish plus new glossary terms.
 *
 * JSON in, JSON out. The `terms` array comes back here rather than from every
 * panel individually: deduplicating across a chapter is the whole reason this
 * pass sees the whole chapter.
 *
 * Same truncation valve as translate — halve once above 20 panels.
 */

import {
  hasGeminiKey,
  isMockPipeline,
  mockProofread,
  proofreadPanels,
} from "@/lib/ai/gemini";
import {
  PipelineError,
  isPipelineError,
  toPipelineFailure,
  type ChapterContext,
  type GlossaryPromptTerm,
  type ProofreadResponse,
  type SourceLanguage,
} from "@/lib/ai/types";
import { requirePipelineViewer } from "@/lib/pipeline-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type BlockInput = {
  index: number;
  sourceText: string;
  baseTranslation: string;
};
type PanelInput = { panelId: string; blocks: BlockInput[] };

const LANGUAGES: SourceLanguage[] = ["ko", "ja", "zh"];

function parseBody(raw: unknown): {
  panels: PanelInput[];
  language: SourceLanguage;
  glossary: GlossaryPromptTerm[];
  context: ChapterContext;
} {
  const body = raw as {
    panels?: unknown;
    language?: unknown;
    glossary?: unknown;
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
      const block = blockEntry as {
        index?: unknown;
        sourceText?: unknown;
        baseTranslation?: unknown;
      };
      if (
        typeof block.index !== "number" ||
        !Number.isFinite(block.index) ||
        typeof block.sourceText !== "string" ||
        typeof block.baseTranslation !== "string"
      ) {
        throw new PipelineError("invalid-request", "A block is malformed.");
      }
      return {
        index: block.index,
        sourceText: block.sourceText,
        baseTranslation: block.baseTranslation,
      };
    });
    return { panelId: panel.panelId, blocks };
  });

  const glossary: GlossaryPromptTerm[] = Array.isArray(body.glossary)
    ? (body.glossary as GlossaryPromptTerm[]).filter(
        (term) =>
          term &&
          typeof term.sourceTerm === "string" &&
          typeof term.targetTerm === "string"
      )
    : [];

  return {
    panels,
    language: body.language as SourceLanguage,
    glossary,
    context: {
      seriesTitle: context.seriesTitle,
      synopsis: context.synopsis ?? null,
      chapterNumber: context.chapterNumber,
    },
  };
}

async function proofreadWithValve(input: {
  panels: PanelInput[];
  language: SourceLanguage;
  glossary: GlossaryPromptTerm[];
  context: ChapterContext;
}): Promise<ProofreadResponse> {
  try {
    return await proofreadPanels(input);
  } catch (error) {
    if (!isPipelineError(error, "bad-response") || input.panels.length <= 20) {
      throw error;
    }

    const midpoint = Math.ceil(input.panels.length / 2);
    const head = await proofreadPanels({
      ...input,
      panels: input.panels.slice(0, midpoint),
    });
    const tail = await proofreadPanels({
      ...input,
      panels: input.panels.slice(midpoint),
    });

    return {
      results: [...head.results, ...tail.results],
      // Terms are chapter-scoped; merging both halves and letting the store
      // dedupe keeps one row per source term.
      terms: [...head.terms, ...tail.terms],
    };
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requirePipelineViewer();
    if (!auth.ok) return auth.response;

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
      return Response.json(mockProofread(input.panels));
    }

    return Response.json(await proofreadWithValve(input));
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
        "This endpoint only accepts POST. Run translation from the chapter workspace.",
    },
    { status: 405, headers: { Allow: "POST" } }
  );
}
