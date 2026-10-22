/**
 * Gemini provider — server only.
 *
 * Never import this from a client component: it reads `GEMINI_API_KEY` and must
 * stay on the server. The browser talks to `app/api/pipeline/*`, which imports
 * this module; nothing else does.
 *
 * Model choice is one line on purpose. `gemini-3.5-flash-lite` is the free tier
 * we measured (500 requests/day, 15 RPM, 250K TPM). There is deliberately no
 * fallback: `gemini-3.8-flash` caps at 20 requests/day, so silently switching to
 * it mid-chapter would fail later instead of failing now. Never use
 * `gemini-2.5-*` (restricted to existing users) or `gemini-2.0-flash` (shut
 * down). A retired model id surfaces as `bad-response`.
 */

import {
  PipelineError,
  type ExtractedPanel,
  type ExtractResponse,
  type GlossaryPromptTerm,
  type ProofreadResponse,
  type ReadingDirection,
  type SourceLanguage,
  type TranslateResponse,
} from "./types";
import {
  buildExtractPrompt,
  buildProofreadPrompt,
  buildTranslatePrompt,
  EXTRACT_SCHEMA,
  PROOFREAD_SCHEMA,
  TRANSLATE_SCHEMA,
} from "./prompts";

export const GEMINI_MODEL = "gemini-3.5-flash-lite";
export const PANEL_BATCH_MAX = 10;
export const BATCH_MAX_BYTES = 3_000_000;

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";
/**
 * A ten-panel extract of dense art takes ~10 s in practice and can spike past
 * that on a heavy page. The timeout is generous on purpose: a retry costs a
 * request from a 500/day budget, while a premature timeout costs the whole
 * batch.
 */
const REQUEST_TIMEOUT_MS = 120_000;

export function isMockPipeline(): boolean {
  return (process.env.MOCK_PIPELINE ?? "").trim() === "1";
}

// A mock run looks like a real one in the UI — same shapes, same persistence.
// Warn once on the server so canned English is never mistaken for Gemini output.
if (isMockPipeline()) {
  console.warn(
    "[pipeline] MOCK_PIPELINE=1 — extract, translate and proofread are returning canned data. Set MOCK_PIPELINE=0 to use Gemini."
  );
}

export function hasGeminiKey(): boolean {
  return Boolean((process.env.GEMINI_API_KEY ?? "").trim());
}

function apiKey(): string {
  const key = (process.env.GEMINI_API_KEY ?? "").trim();
  if (!key) {
    throw new PipelineError(
      "missing-key",
      "The translation service isn't configured. Add GEMINI_API_KEY to .env.local."
    );
  }
  return key;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type GeminiPart =
  | { text: string }
  | { inline_data: { mime_type: string; data: string } };

type GenerateResponse = {
  candidates?: Array<{
    finishReason?: string;
    content?: { parts?: Array<{ text?: string }> };
  }>;
  error?: { message?: string; code?: number };
};

/** One HTTP round trip with the retry ladder described in the spec. */
async function generateJson(input: {
  model: string;
  parts: GeminiPart[];
  schema: Record<string, unknown>;
  temperature: number;
}): Promise<unknown> {
  const body = JSON.stringify({
    contents: [{ role: "user", parts: input.parts }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: input.schema,
      temperature: input.temperature,
    },
  });

  for (let attempt = 0; attempt < 3; attempt += 1) {
    let response: Response;
    try {
      response = await fetch(
        `${ENDPOINT}/${input.model}:generateContent?key=${apiKey()}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        }
      );
    } catch {
      if (attempt < 1) {
        await sleep(1000);
        continue;
      }
      throw new PipelineError("network");
    }

    if (response.status === 429) {
      if (attempt < 2) {
        await sleep(1000 * 2 ** attempt);
        continue;
      }
      throw new PipelineError("quota");
    }

    if (response.status === 404) {
      // Model renamed or retired. There is no fallback by design: the only other
      // free model allows 20 requests/day, which cannot finish a chapter.
      throw new PipelineError("bad-response");
    }

    if (!response.ok) {
      if (response.status >= 500 && attempt < 1) {
        await sleep(1000);
        continue;
      }
      if (response.status === 413) throw new PipelineError("too-large");
      throw new PipelineError("network");
    }

    const payload = (await response.json()) as GenerateResponse;
    const candidate = payload.candidates?.[0];
    if (candidate?.finishReason === "MAX_TOKENS") {
      throw new PipelineError("bad-response");
    }
    const text = (candidate?.content?.parts ?? [])
      .map((part) => part.text ?? "")
      .join("")
      .trim();
    if (!text) throw new PipelineError("bad-response");

    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new PipelineError("bad-response");
    }
  }

  throw new PipelineError("network");
}

/* ------------------------------------------------------------------ */
/* Normalisation                                                       */
/* ------------------------------------------------------------------ */

function clamp01(value: unknown): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.min(1, Math.max(0, numeric));
}

function normaliseBlocks(raw: unknown): ExtractedPanel["blocks"] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry, position) => {
      const block = entry as {
        index?: unknown;
        sourceText?: unknown;
        bbox?: unknown;
        confidence?: unknown;
      };
      const sourceText =
        typeof block.sourceText === "string" ? block.sourceText.trim() : "";
      if (!sourceText) return null;

      const box = block.bbox as
        | { x?: unknown; y?: unknown; w?: unknown; h?: unknown }
        | null
        | undefined;
      const bbox =
        box && typeof box === "object"
          ? {
              x: clamp01(box.x),
              y: clamp01(box.y),
              w: clamp01(box.w),
              h: clamp01(box.h),
            }
          : null;

      return {
        index:
          typeof block.index === "number" && Number.isFinite(block.index)
            ? block.index
            : position,
        sourceText,
        bbox: bbox && bbox.w > 0 && bbox.h > 0 ? bbox : null,
        confidence:
          typeof block.confidence === "number" ? block.confidence : null,
      };
    })
    .filter((entry): entry is ExtractedPanel["blocks"][number] => entry !== null)
    .sort((a, b) => a.index - b.index);
}

/* ------------------------------------------------------------------ */
/* Passes                                                              */
/* ------------------------------------------------------------------ */

export type ImageInput = {
  panelId: string;
  mimeType: string;
  base64: string;
};

export async function extractPanels(input: {
  images: ImageInput[];
  language: SourceLanguage;
  readingDirection: ReadingDirection;
}): Promise<ExtractResponse> {
  const parts: GeminiPart[] = [];
  for (const image of input.images) {
    parts.push({
      inline_data: { mime_type: image.mimeType, data: image.base64 },
    });
    parts.push({ text: `panelId: ${image.panelId}` });
  }
  parts.push({
    text: buildExtractPrompt({
      panelIds: input.images.map((image) => image.panelId),
      language: input.language,
      readingDirection: input.readingDirection,
    }),
  });

  const payload = (await generateJson({
    model: GEMINI_MODEL,
    parts,
    schema: EXTRACT_SCHEMA,
    temperature: 0,
  })) as { panels?: unknown };

  const returned = Array.isArray(payload.panels) ? payload.panels : [];
  const byPanel = new Map<string, ExtractedPanel["blocks"]>();
  for (const entry of returned) {
    const panel = entry as { panelId?: unknown; blocks?: unknown };
    if (typeof panel.panelId !== "string") continue;
    byPanel.set(panel.panelId, normaliseBlocks(panel.blocks));
  }

  // Every requested panel gets an entry, even an empty one, so the orchestrator
  // never has to guess which panels a batch actually covered.
  return {
    panels: input.images.map((image) => ({
      panelId: image.panelId,
      blocks: byPanel.get(image.panelId) ?? [],
    })),
  };
}

export async function translatePanels(input: {
  panels: Array<{
    panelId: string;
    blocks: Array<{ index: number; sourceText: string }>;
  }>;
  language: SourceLanguage;
  glossary: GlossaryPromptTerm[];
  context: { seriesTitle: string; synopsis: string | null; chapterNumber: number };
}): Promise<TranslateResponse> {
  const prompt = [
    buildTranslatePrompt({
      language: input.language,
      seriesTitle: input.context.seriesTitle,
      synopsis: input.context.synopsis,
      chapterNumber: input.context.chapterNumber,
      glossary: input.glossary,
    }),
    "",
    "Blocks to translate (JSON):",
    JSON.stringify(input.panels),
  ].join("\n");

  const payload = (await generateJson({
    model: GEMINI_MODEL,
    parts: [{ text: prompt }],
    schema: TRANSLATE_SCHEMA,
    temperature: 0.2,
  })) as { translations?: unknown };

  const translations: TranslateResponse["translations"] = [];
  for (const entry of Array.isArray(payload.translations)
    ? payload.translations
    : []) {
    const item = entry as {
      panelId?: unknown;
      index?: unknown;
      baseTranslation?: unknown;
    };
    if (typeof item.panelId !== "string") continue;
    if (typeof item.index !== "number" || !Number.isFinite(item.index)) continue;
    if (typeof item.baseTranslation !== "string") continue;
    translations.push({
      panelId: item.panelId,
      index: item.index,
      baseTranslation: item.baseTranslation.trim(),
    });
  }

  return { translations };
}

export async function proofreadPanels(input: {
  panels: Array<{
    panelId: string;
    blocks: Array<{
      index: number;
      sourceText: string;
      baseTranslation: string;
    }>;
  }>;
  language: SourceLanguage;
  glossary: Array<{ sourceTerm: string; targetTerm: string; category: string }>;
  context: { seriesTitle: string; synopsis: string | null; chapterNumber: number };
}): Promise<ProofreadResponse> {
  const prompt = [
    buildProofreadPrompt({
      language: input.language,
      glossary: input.glossary,
      seriesTitle: input.context.seriesTitle,
      synopsis: input.context.synopsis,
      chapterNumber: input.context.chapterNumber,
    }),
    "",
    "Chapter blocks (JSON):",
    JSON.stringify(input.panels),
  ].join("\n");

  const payload = (await generateJson({
    model: GEMINI_MODEL,
    parts: [{ text: prompt }],
    schema: PROOFREAD_SCHEMA,
    temperature: 0.2,
  })) as { results?: unknown; terms?: unknown };

  const results: ProofreadResponse["results"] = [];
  for (const entry of Array.isArray(payload.results) ? payload.results : []) {
    const item = entry as {
      panelId?: unknown;
      index?: unknown;
      finalText?: unknown;
    };
    if (typeof item.panelId !== "string") continue;
    if (typeof item.index !== "number" || !Number.isFinite(item.index)) continue;
    if (typeof item.finalText !== "string") continue;
    results.push({
      panelId: item.panelId,
      index: item.index,
      finalText: item.finalText.trim(),
    });
  }

  const terms: ProofreadResponse["terms"] = [];
  for (const entry of Array.isArray(payload.terms) ? payload.terms : []) {
    const item = entry as {
      sourceTerm?: unknown;
      targetTerm?: unknown;
      category?: unknown;
    };
    if (typeof item.sourceTerm !== "string") continue;
    if (typeof item.targetTerm !== "string") continue;
    const sourceTerm = item.sourceTerm.trim();
    const targetTerm = item.targetTerm.trim();
    if (!sourceTerm || !targetTerm) continue;
    terms.push({
      sourceTerm,
      targetTerm,
      category: typeof item.category === "string" ? item.category : "term",
    });
  }

  return { results, terms };
}

/* ------------------------------------------------------------------ */
/* Mock mode                                                           */
/* ------------------------------------------------------------------ */

/**
 * `MOCK_PIPELINE=1` returns deterministic data with no network call. This is a
 * hard requirement, not a nicety: at 500 requests/day, building the workspace UI
 * against the real API would burn the day's quota before a real chapter is ever
 * attempted.
 *
 * Content is deliberately fake-looking so it can never be mistaken for a real
 * translation during review.
 */

const MOCK_SOURCE = [
  "문이 열린 지 삼 년이 지났어.",
  "그래도 아직 늦지 않았어.",
  "이번엔 내가 먼저 갈게.",
];

const MOCK_ENGLISH = [
  "It's been three years since the gate opened.",
  "Even so, it isn't too late.",
  "This time I'll go first.",
];

export function mockExtract(panelIds: string[]): ExtractResponse {
  return {
    panels: panelIds.map((panelId, panelIndex) => ({
      panelId,
      blocks: [0, 1].map((offset) => {
        const seed = (panelIndex * 2 + offset) % MOCK_SOURCE.length;
        return {
          index: offset,
          sourceText: MOCK_SOURCE[seed],
          bbox: {
            x: 0.12,
            y: offset === 0 ? 0.14 : 0.56,
            w: 0.62,
            h: 0.18,
          },
          confidence: 0.94,
        };
      }),
    })),
  };
}

export function mockTranslate(
  panels: Array<{
    panelId: string;
    blocks: Array<{ index: number; sourceText: string }>;
  }>
): TranslateResponse {
  return {
    translations: panels.flatMap((panel) =>
      panel.blocks.map((block) => ({
        panelId: panel.panelId,
        index: block.index,
        baseTranslation:
          MOCK_ENGLISH[(block.index + panel.blocks.length) % MOCK_ENGLISH.length],
      }))
    ),
  };
}

export function mockProofread(
  panels: Array<{
    panelId: string;
    blocks: Array<{ index: number; sourceText: string; baseTranslation: string }>;
  }>
): ProofreadResponse {
  return {
    results: panels.flatMap((panel) =>
      panel.blocks.map((block) => ({
        panelId: panel.panelId,
        index: block.index,
        finalText: block.baseTranslation || MOCK_ENGLISH[block.index % 3],
      }))
    ),
    terms:
      panels.length > 0
        ? [
            { sourceTerm: "지훈", targetTerm: "Jihun", category: "character" },
            { sourceTerm: "서울", targetTerm: "Seoul", category: "place" },
            { sourceTerm: "-님", targetTerm: "-nim", category: "honorific" },
          ]
        : [],
  };
}
