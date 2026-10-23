"use client";

/**
 * Client orchestrator for the three-stage pipeline.
 *
 * The browser drives this, not a queue: close the tab and the run stops. Text
 * already written stays, the chapter stays `processing`, and `Run translation`
 * picks it up again. That is a documented limitation, not an oversight.
 *
 * Run shape (docs/core-functionality.md §5.4):
 *
 *   1. draft/ready/rejected → processing
 *   2. panels split into batches of ≤10, extracted one batch at a time
 *      (blocks are written per batch so text appears progressively)
 *   3. translate once for the whole chapter
 *   4. proofread once, write finalText, upsert new glossary terms
 *   5. chapter → ready only when every panel succeeded
 *
 * The workspace supplies a `PipelineContext` with the current server snapshot
 * and write functions. The pipeline never reads localStorage.
 */

import {
  EXTRACT_BATCH_MAX_BYTES,
  PANEL_BATCH_MAX,
  chunkWithinByteBudget,
  splitIntoBatches,
} from "./ai/batch";
import { readingDirectionFor } from "./ai/languages";
import {
  isPipelineError,
  pipelineErrorMessage,
  type ChapterContext,
  type ExtractedPanel,
  type GlossaryPromptTerm,
  type ProofreadResponse,
  type SourceLanguage,
  type TranslateResponse,
} from "./ai/types";
import {
  ChapterError,
  type Chapter,
  type ChapterStatus,
  type IncomingBlock,
  type Panel,
  type PanelPipelineState,
  type TextBlock,
} from "./chapters";

/* ------------------------------------------------------------------ */
/* Public types                                                        */
/* ------------------------------------------------------------------ */

export type RunStage = "extract" | "translate" | "proofread" | "done";

/** Alias of `PanelPipelineState["status"]` — one union, never duplicated. */
export type PanelRunState = PanelPipelineState["status"];

export type RunState = {
  running: boolean;
  stage: RunStage;
  totalPanels: number;
  /** Drives "Reading panels n / total". */
  extracted: number;
  /** 1-based, for the stage strip. */
  batchIndex: number;
  batchCount: number;
  panels: Record<string, PanelRunState>;
  error: { code: string; message: string } | null;
};

export type PipelineSeries = {
  title: string;
  description: string | null;
  language: SourceLanguage;
};

export type PipelineContext = {
  chapter: Chapter;
  panels: Panel[];
  blocks: TextBlock[];
  series: PipelineSeries;
  glossary: GlossaryPromptTerm[];
  readPanelImage: (panelId: string) => Promise<Blob | null>;
  setPanelBlocks: (
    panelId: string,
    blocks: IncomingBlock[]
  ) => Promise<TextBlock[]>;
  updateBlockPipelineText: (
    updates: Array<{
      blockId: string;
      baseTranslation?: string;
      finalText?: string;
    }>
  ) => Promise<void>;
  setChapterStatus: (
    next: ChapterStatus,
    note?: string | null
  ) => Promise<void>;
  upsertAutoTerms?: (
    terms: ProofreadResponse["terms"]
  ) => Promise<void>;
  /** Lets the workspace show extracted/translated text as it lands. */
  onBlocks?: (panelId: string, blocks: TextBlock[]) => void;
};

/* ------------------------------------------------------------------ */
/* Store                                                               */
/* ------------------------------------------------------------------ */

function emptyRun(): RunState {
  return {
    running: false,
    stage: "extract",
    totalPanels: 0,
    extracted: 0,
    batchIndex: 1,
    batchCount: 1,
    panels: {},
    error: null,
  };
}

let runState: RunState = emptyRun();
let activeChapterId: string | null = null;
let cancelRequested = false;
/**
 * Aborts the in-flight provider request when the user cancels.
 *
 * `cancelRequested` alone only stops the *next* stage: the request already on
 * the wire keeps running (and keeps spending quota) until Gemini answers. The
 * signal is forwarded by the route to the provider fetch, so a cancel closes
 * the connection immediately.
 */
let runController: AbortController | null = null;
let workingBlocks: TextBlock[] = [];

const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function patch(next: Partial<RunState>): void {
  runState = { ...runState, ...next };
  emit();
}

export function subscribeRun(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Returns a fresh snapshot so React sees a new reference on every read. */
export function getRunState(): RunState {
  return { ...runState, panels: { ...runState.panels } };
}

/**
 * Which chapter the module-level run state belongs to. The workspace uses this
 * to avoid showing another chapter's progress after switching via the rail.
 */
export function activeRunChapterId(): string | null {
  return activeChapterId;
}

function setPanelStates(
  panelIds: string[],
  state: PanelRunState,
  next: Partial<RunState> = {}
): void {
  const panels = { ...runState.panels };
  for (const panelId of panelIds) panels[panelId] = state;
  patch({ ...next, panels });
}

export function cancelRun(): void {
  cancelRequested = true;
  runController?.abort();
}

/* ------------------------------------------------------------------ */
/* HTTP helpers                                                        */
/* ------------------------------------------------------------------ */

type Failure = { code: string; message: string };

async function readFailure(response: Response): Promise<Failure> {
  try {
    const body = (await response.json()) as {
      error?: string;
      message?: string;
    };
    return {
      code: body.error ?? "unknown",
      message: body.message ?? pipelineErrorMessage(body.error),
    };
  } catch {
    return { code: "unknown", message: pipelineErrorMessage(null) };
  }
}

function toFailure(error: unknown): Failure {
  if (error instanceof ChapterError) {
    return { code: error.code, message: error.message };
  }
  if (isPipelineError(error)) {
    return { code: error.code, message: error.message };
  }
  return { code: "unknown", message: pipelineErrorMessage(null) };
}

/* ------------------------------------------------------------------ */
/* Block cache                                                         */
/* ------------------------------------------------------------------ */

function blocksForPanel(panelId: string): TextBlock[] {
  return workingBlocks
    .filter((block) => block.panelId === panelId)
    .sort((a, b) => a.index - b.index);
}

function replacePanelBlocks(panelId: string, blocks: TextBlock[]): void {
  workingBlocks = [
    ...workingBlocks.filter((block) => block.panelId !== panelId),
    ...blocks,
  ];
}

function blockIndex(): Map<string, string> {
  const map = new Map<string, string>();
  for (const block of workingBlocks) {
    map.set(`${block.panelId}:${block.index}`, block.id);
  }
  return map;
}

/* ------------------------------------------------------------------ */
/* Stage helpers                                                       */
/* ------------------------------------------------------------------ */

function seriesContext(ctx: PipelineContext): ChapterContext {
  return {
    seriesTitle: ctx.series.title || "Untitled series",
    synopsis: ctx.series.description,
    chapterNumber: ctx.chapter.number,
  };
}

/**
 * Extract one batch. Returns the panel ids that succeeded so the caller can
 * count them and never has to re-read the store mid-loop.
 */
async function extractBatch(
  ctx: PipelineContext,
  panels: Panel[],
  language: SourceLanguage
): Promise<{ extractedPanelIds: string[]; failure: Failure | null }> {
  // Read the images first. A panel whose image is gone cannot be sent, and the
  // manifest must describe exactly the parts that are attached.
  const usable: Array<{ panel: Panel; blob: Blob }> = [];
  for (const panel of panels) {
    const blob = await ctx.readPanelImage(panel.id);
    if (!blob) continue;
    usable.push({ panel, blob });
  }

  if (usable.length === 0) {
    return {
      extractedPanelIds: [],
      failure: {
        code: "unknown",
        message: "This panel image isn't available. Re-upload it to continue.",
      },
    };
  }

  const form = new FormData();
  form.append(
    "meta",
    JSON.stringify({
      panels: usable.map((entry, position) => ({
        panelId: entry.panel.id,
        index: position,
      })),
      language,
      readingDirection: readingDirectionFor(language),
    })
  );

  usable.forEach((entry, position) => {
    form.append(`panel-${position}`, entry.blob, `${entry.panel.id}.webp`);
  });

  let response: Response;
  try {
    response = await fetch("/api/pipeline/extract", {
      method: "POST",
      body: form,
      signal: runController?.signal,
    });
  } catch {
    // A cancelled run aborts the request; that is not a network failure.
    if (runController?.signal.aborted) {
      return { extractedPanelIds: [], failure: null };
    }
    return {
      extractedPanelIds: [],
      failure: { code: "network", message: pipelineErrorMessage("network") },
    };
  }

  if (!response.ok) {
    return { extractedPanelIds: [], failure: await readFailure(response) };
  }

  const payload = (await response.json()) as { panels?: ExtractedPanel[] };
  const returned = payload.panels ?? [];
  const written: string[] = [];

  for (const panel of returned) {
    if (!usable.some((entry) => entry.panel.id === panel.panelId)) continue;

    try {
      const blocks = await ctx.setPanelBlocks(
        panel.panelId,
        panel.blocks.map((block) => ({
          index: block.index,
          sourceText: block.sourceText,
          bbox: block.bbox,
          confidence: block.confidence,
        }))
      );
      replacePanelBlocks(panel.panelId, blocks);
      ctx.onBlocks?.(panel.panelId, blocks);
      written.push(panel.panelId);
    } catch {
      // Leave this panel failed; the loop continues with the next one.
    }
  }

  return { extractedPanelIds: written, failure: null };
}

/**
 * Runs extract over an explicit panel list in `PANEL_BATCH_MAX` batches.
 * Mutates run state as it goes and never throws — a failed batch is data.
 */
async function runExtract(
  ctx: PipelineContext,
  panels: Panel[]
): Promise<number> {
  const batches = splitIntoBatches(panels, PANEL_BATCH_MAX).flatMap((batch) =>
    chunkWithinByteBudget(
      batch,
      (panel) => panel.byteSize,
      EXTRACT_BATCH_MAX_BYTES
    )
  );
  patch({
    stage: "extract",
    batchCount: batches.length,
    batchIndex: batches.length > 0 ? 1 : 0,
  });

  let extracted = runState.extracted;

  for (let index = 0; index < batches.length; index += 1) {
    if (cancelRequested) break;

    const batch = batches[index];
    const batchIds = batch.map((panel) => panel.id);
    setPanelStates(batchIds, "extracting", {
      batchIndex: index + 1,
      stage: "extract",
    });

    const { extractedPanelIds, failure } = await extractBatch(
      ctx,
      batch,
      ctx.series.language
    );

    if (failure) {
      setPanelStates(batchIds, "failed", { error: failure });
      continue;
    }

    const missing = batchIds.filter((id) => !extractedPanelIds.includes(id));
    if (missing.length > 0) setPanelStates(missing, "failed");
    setPanelStates(extractedPanelIds, "extracted");

    extracted += extractedPanelIds.length;
    patch({ extracted });
  }

  return extracted;
}

/**
 * Translate + proofread over every usable panel. Returns true only when both
 * passes succeeded; a failure leaves the chapter editable and retryable.
 */
async function runTextStages(ctx: PipelineContext): Promise<boolean> {
  const panels = ctx.panels.filter((panel) => {
    const state = runState.panels[panel.id];
    return state === "extracted" || state === "done";
  });

  if (panels.length === 0) return false;

  const context = seriesContext(ctx);
  const language = ctx.series.language;
  const usableIds = panels.map((panel) => panel.id);

  const glossary: GlossaryPromptTerm[] = ctx.glossary;

  const sourcePayload = panels.map((panel) => ({
    panelId: panel.id,
    blocks: blocksForPanel(panel.id)
      .filter((block) => block.sourceText.trim().length > 0)
      .map((block) => ({
        index: block.index,
        sourceText: block.sourceText,
      })),
  }));

  if (cancelRequested) return false;

  /* ---- translate ------------------------------------------------- */

  patch({ stage: "translate", error: null });

  let translations: TranslateResponse["translations"];
  try {
    const response = await fetch("/api/pipeline/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        panels: sourcePayload,
        language,
        glossary,
        context,
      }),
      signal: runController?.signal,
    });
    if (!response.ok) {
      patch({ error: await readFailure(response) });
      return false;
    }
    translations = ((await response.json()) as TranslateResponse).translations;
  } catch {
    if (runController?.signal.aborted) return false;
    patch({
      error: { code: "network", message: pipelineErrorMessage("network") },
    });
    return false;
  }

  const translationIds = blockIndex();
  const translationUpdates = translations
    .map((entry) => {
      const blockId = translationIds.get(`${entry.panelId}:${entry.index}`);
      if (!blockId) return null;
      return { blockId, baseTranslation: entry.baseTranslation };
    })
    .filter(
      (entry): entry is { blockId: string; baseTranslation: string } =>
        entry !== null
    );

  if (translationUpdates.length > 0) {
    try {
      await ctx.updateBlockPipelineText(translationUpdates);
      const byId = new Map(
        translationUpdates.map((update) => [update.blockId, update])
      );
      workingBlocks = workingBlocks.map((block) => {
        const update = byId.get(block.id);
        return update
          ? { ...block, baseTranslation: update.baseTranslation }
          : block;
      });
    } catch (error) {
      patch({ running: false, error: toFailure(error) });
      return false;
    }
  }

  if (cancelRequested) return false;

  /* ---- proofread -------------------------------------------------- */

  patch({ stage: "proofread" });

  const proofPayload = panels.map((panel) => ({
    panelId: panel.id,
    blocks: blocksForPanel(panel.id)
      .filter((block) => block.sourceText.trim().length > 0)
      .map((block) => ({
        index: block.index,
        sourceText: block.sourceText,
        baseTranslation: block.baseTranslation,
      })),
  }));

  let proof: ProofreadResponse;
  try {
    const response = await fetch("/api/pipeline/proofread", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        panels: proofPayload,
        language,
        glossary,
        context,
      }),
      signal: runController?.signal,
    });
    if (!response.ok) {
      patch({ error: await readFailure(response) });
      return false;
    }
    proof = (await response.json()) as ProofreadResponse;
  } catch {
    if (runController?.signal.aborted) return false;
    patch({
      error: { code: "network", message: pipelineErrorMessage("network") },
    });
    return false;
  }

  const finalIds = blockIndex();
  const finalUpdates = proof.results
    .map((entry) => {
      const blockId = finalIds.get(`${entry.panelId}:${entry.index}`);
      if (!blockId) return null;
      return { blockId, finalText: entry.finalText };
    })
    .filter(
      (entry): entry is { blockId: string; finalText: string } =>
        entry !== null
    );

  if (finalUpdates.length > 0) {
    try {
      await ctx.updateBlockPipelineText(finalUpdates);
      const byId = new Map(finalUpdates.map((update) => [update.blockId, update]));
      workingBlocks = workingBlocks.map((block) => {
        const update = byId.get(block.id);
        return update ? { ...block, finalText: update.finalText } : block;
      });
    } catch (error) {
      patch({ running: false, error: toFailure(error) });
      return false;
    }
  }

  if (ctx.upsertAutoTerms && proof.terms.length > 0) {
    try {
      await ctx.upsertAutoTerms(proof.terms);
    } catch {
      // Glossary suggestions are a bonus; a failure must not fail the run.
    }
  }

  setPanelStates(usableIds, "done", { stage: "done" });
  return true;
}

function failureCount(): number {
  return Object.values(runState.panels).filter((state) => state === "failed")
    .length;
}

async function finish(ctx: PipelineContext, ready: boolean): Promise<void> {
  if (ready && !cancelRequested && failureCount() === 0) {
    try {
      await ctx.setChapterStatus("ready");
      patch({ stage: "done", running: false, error: null });
      return;
    } catch (error) {
      patch({ running: false, error: toFailure(error) });
      runController = null;
      return;
    }
  }

  patch({ running: false });
  runController = null;
}

function beginRun(chapterId: string, panels: Panel[]): void {
  activeChapterId = chapterId;
  cancelRequested = false;
  runController = new AbortController();
  runState = {
    ...emptyRun(),
    running: true,
    stage: "extract",
    totalPanels: panels.length,
    panels: Object.fromEntries(
      panels.map((panel) => [panel.id, "pending" as PanelRunState])
    ),
  };
  emit();
}

/* ------------------------------------------------------------------ */
/* Public actions                                                      */
/* ------------------------------------------------------------------ */

export async function startRun(ctx: PipelineContext): Promise<void> {
  const chapter = ctx.chapter;

  if (runState.running) {
    throw new ChapterError(
      "bad-transition",
      activeChapterId === chapter.id
        ? "A run is already in progress."
        : "Another chapter is still running. Wait for it to finish."
    );
  }

  if (chapter.status === "submitted" || chapter.status === "approved") {
    throw new ChapterError(
      "bad-transition",
      chapter.status === "approved"
        ? "Reopen this chapter before running the pipeline again."
        : "This chapter is awaiting review. Wait for a decision first."
    );
  }

  if (ctx.panels.length === 0) {
    throw new ChapterError("no-content", "Upload a panel first.");
  }

  workingBlocks = [...ctx.blocks];
  beginRun(chapter.id, ctx.panels);

  try {
    // ready → processing is a legal transition; rejected reopens first.
    if (chapter.status === "rejected") {
      await ctx.setChapterStatus("draft");
    }
    if (
      chapter.status === "draft" ||
      chapter.status === "ready" ||
      chapter.status === "rejected"
    ) {
      await ctx.setChapterStatus("processing");
    }
  } catch (error) {
    patch({ running: false, error: toFailure(error) });
    return;
  }

  const extracted = await runExtract(ctx, ctx.panels);

  if (extracted === 0) {
    patch({
      running: false,
      error: runState.error ?? {
        code: "unknown",
        message: "No panel could be read. Check the images and retry.",
      },
    });
    return;
  }

  const textOk = await runTextStages(ctx);
  await finish(ctx, textOk);
}

export async function retryFailed(ctx: PipelineContext): Promise<void> {
  const chapter = ctx.chapter;

  if (runState.running) {
    throw new ChapterError("bad-transition", "A run is already in progress.");
  }

  const panels = ctx.panels;
  const failed = panels.filter(
    (panel) => runState.panels[panel.id] === "failed"
  );

  // A run with nothing marked failed means the failure was in a text stage:
  // keep every panel's extracted text and re-run both passes over the chapter.
  const retryExtract = failed.length > 0;

  workingBlocks = [...ctx.blocks];
  beginRun(chapter.id, panels);

  if (retryExtract) {
    for (const panel of panels) {
      if (!failed.some((entry) => entry.id === panel.id)) {
        const hasText = blocksForPanel(panel.id).length > 0;
        runState.panels[panel.id] = hasText ? "extracted" : "pending";
      }
    }
    runState.extracted = Object.values(runState.panels).filter(
      (state) => state === "extracted"
    ).length;
    emit();

    await runExtract(ctx, failed);
  } else {
    for (const panel of panels) runState.panels[panel.id] = "extracted";
    runState.extracted = panels.length;
    emit();
  }

  const textOk = await runTextStages(ctx);
  await finish(ctx, textOk);
}
