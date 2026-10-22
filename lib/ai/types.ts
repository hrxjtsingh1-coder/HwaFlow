/**
 * Pipeline protocol shapes.
 *
 * These are the contract between the browser orchestrator (`lib/pipeline.ts`),
 * the route handlers (`app/api/pipeline/*`) and the provider implementation
 * (`lib/ai/gemini.ts`). Gemini is the first implementation, not the
 * architecture: OCR.space, Paddle or a paid model can be added by implementing
 * `OCRProvider` + `Translator` without touching a component.
 */

export type SourceLanguage = "ko" | "ja" | "zh";

/** Top-to-bottom column order; `rtl` flips the within-row order for Japanese. */
export type ReadingDirection = "ttb" | "rtl" | "ltr";

export type BoundingBox = {
  /** 0..1, relative to its own panel — never the page. */
  x: number;
  y: number;
  w: number;
  h: number;
};

export type ExtractedBlock = {
  index: number;
  sourceText: string;
  bbox: BoundingBox | null;
  confidence: number | null;
};

export type ExtractedPanel = {
  panelId: string;
  blocks: ExtractedBlock[];
};

export type ExtractRequest = {
  panels: Array<{ panelId: string; index: number; image: Blob }>;
  language: SourceLanguage;
  readingDirection: ReadingDirection;
};

export type ExtractResponse = {
  panels: ExtractedPanel[];
};

export type ChapterContext = {
  seriesTitle: string;
  synopsis: string | null;
  chapterNumber: number;
};

export type TranslateRequest = {
  panels: Array<{
    panelId: string;
    blocks: Array<{ index: number; sourceText: string }>;
  }>;
  language: SourceLanguage;
  context: ChapterContext;
};

export type Translation = {
  panelId: string;
  index: number;
  baseTranslation: string;
};

export type TranslateResponse = {
  translations: Translation[];
};

export type GlossaryPromptTerm = {
  sourceTerm: string;
  targetTerm: string;
  category: string;
};

export type ProofreadRequest = {
  panels: Array<{
    panelId: string;
    blocks: Array<{ index: number; sourceText: string; baseTranslation: string }>;
  }>;
  glossary: GlossaryPromptTerm[];
  context: ChapterContext;
};

export type ProofreadResult = {
  panelId: string;
  index: number;
  finalText: string;
};

export type ProofreadResponse = {
  results: ProofreadResult[];
  terms: GlossaryPromptTerm[];
};

/* ------------------------------------------------------------------ */
/* Errors                                                              */
/* ------------------------------------------------------------------ */

export type PipelineFailure =
  | "missing-key"
  | "quota"
  | "network"
  | "bad-response"
  | "too-large"
  | "invalid-request"
  | "unknown";

export class PipelineError extends Error {
  code: PipelineFailure;

  constructor(code: PipelineFailure, message?: string) {
    // Default to the user-facing copy: an error without a message would
    // otherwise surface a raw code like "missing-key" in the workspace.
    super(message ?? PIPELINE_ERROR_COPY[code]);
    this.name = "PipelineError";
    this.code = code;
  }
}

/** Copy shown in the workspace for every failure a user can actually hit. */
export const PIPELINE_ERROR_COPY: Record<PipelineFailure, string> = {
  "missing-key":
    "The translation service isn't configured. Add GEMINI_API_KEY to .env.local.",
  quota: "The translation service's free limit was reached. Wait a minute and retry.",
  network: "Couldn't reach the translation service.",
  "bad-response": "The translation service returned something we couldn't read. Retry.",
  "too-large": "That panel is too large. Re-upload a smaller image.",
  "invalid-request": "Something in that request was malformed. Retry the panel.",
  unknown: "Something went wrong while translating this panel.",
};

export function pipelineErrorMessage(code: string | null | undefined): string {
  if (!code) return PIPELINE_ERROR_COPY.unknown;
  if (code in PIPELINE_ERROR_COPY) {
    return PIPELINE_ERROR_COPY[code as PipelineFailure];
  }
  return PIPELINE_ERROR_COPY.unknown;
}

/* ------------------------------------------------------------------ */
/* HTTP mapping                                                        */
/* ------------------------------------------------------------------ */

const FAILURE_STATUS: Record<PipelineFailure, number> = {
  "missing-key": 503,
  quota: 429,
  network: 502,
  "bad-response": 502,
  "too-large": 413,
  "invalid-request": 400,
  unknown: 500,
};

export type PipelineFailureBody = {
  error: PipelineFailure;
  message: string;
};

/**
 * Turns anything thrown inside a route into a status + code + readable copy.
 * Route handlers stay three lines instead of repeating the same try/catch.
 */
export function toPipelineFailure(error: unknown): {
  status: number;
  body: PipelineFailureBody;
} {
  if (error instanceof PipelineError) {
    return {
      status: FAILURE_STATUS[error.code],
      body: {
        error: error.code,
        message: error.message || PIPELINE_ERROR_COPY[error.code],
      },
    };
  }
  return {
    status: 500,
    body: {
      error: "unknown",
      message: PIPELINE_ERROR_COPY.unknown,
    },
  };
}

export function isPipelineError(
  error: unknown,
  code?: PipelineFailure
): error is PipelineError {
  if (!(error instanceof PipelineError)) return false;
  return code ? error.code === code : true;
}

/* ------------------------------------------------------------------ */
/* Provider interfaces                                                 */
/* ------------------------------------------------------------------ */

export interface OCRProvider {
  extract(request: ExtractRequest): Promise<ExtractResponse>;
}

export interface Translator {
  translate(request: TranslateRequest): Promise<TranslateResponse>;
  proofread(request: ProofreadRequest): Promise<ProofreadResponse>;
}
