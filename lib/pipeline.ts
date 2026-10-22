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
 * A failed batch marks only its own panels failed and the loop continues; a
 * failure in batch 2 never blocks batch 3.
 */

import {
  PANEL_BATCH_MAX,
  splitIntoBatches,
} from "./ai/batch";
import {
  isPipelineError,
  pipelineErrorMessage,
  type ChapterContext,
  type ExtractedPanel,
  type GlossaryPromptTerm,
  type ProofreadResponse,
  type ReadingDirection,
  type SourceLanguage,
  type TranslateResponse,
} from "./ai/types";
import {
  ChapterError,
  blocksForChapter,
  getChapter,
  listBlocks,
  listPanels,
  setChapterStatus,
  setPanelBlocks,
  updateBlockPipelineText,
  type Chapter,
  type Panel,
  type PanelPipelineState,
} from "./chapters";
import { activeGlossaryTerms, upsertAutoTerms } from "./glossary";
import { getPanelImage } from "./panel-store";
import { getSeries } from "./series";

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

/**
 * Source language default. HwaFlow is a Korean manhwa tool; there is no
 * per-series language field yet (deliberately deferred), so this pair is the
 * single place to change when one arrives.
 */
const SOURCE_LANGUAGE: SourceLanguage = "ko";
const READING_DIRECTION: ReadingDirection = "ttb";

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
/* Stage helpers                                                       */
/* ------------------------------------------------------------------ */

function seriesContext(chapter: Chapter): ChapterContext {
  const series = getSeries(chapter.seriesId);
  return {
    seriesTitle: series?.title ?? "Untitled series",
    synopsis: series?.description ?? null,
    chapterNumber: chapter.number,
  };
}

/** Upload order is panel order — extraction must not reorder the chapter. */
function chapterPanels(chapterId: string): Panel[] {
  return listPanels(chapterId);
}

/**
 * Extract one batch. Returns the panel ids that succeeded so the caller can
 * count them and never has to re-read the store mid-loop.
 */
async function extractBatch(
  panels: Panel[],
  actor: string,
  chapterId: string
): Promise<{ extractedPanelIds: string[]; failure: Failure | null }> {
  // Read the images first. A panel whose blob is gone cannot be sent, and the
  // manifest must describe exactly the parts that are attached — one entry per
  // `panel-{n}` part, in the same order.
  const usable: Array<{ panel: Panel; blob: Blob }> = [];
  for (const panel of panels) {
    const blob = await getPanelImage(panel.id);
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
      language: SOURCE_LANGUAGE,
      readingDirection: READING_DIRECTION,
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
    });
  } catch {
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
    setPanelBlocks({
      chapterId,
      panelId: panel.panelId,
      actor,
      blocks: panel.blocks.map((block) => ({
        index: block.index,
        sourceText: block.sourceText,
        bbox: block.bbox,
        confidence: block.confidence,
      })),
    });
    written.push(panel.panelId);
  }

  return { extractedPanelIds: written, failure: null };
}

/**
 * Runs extract over an explicit panel list in `PANEL_BATCH_MAX` batches.
 * Mutates run state as it goes and never throws — a failed batch is data.
 */
async function runExtract(
  chapterId: string,
  panels: Panel[],
  actor: string
): Promise<number> {
  const batches = splitIntoBatches(panels, PANEL_BATCH_MAX);
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
      batch,
      actor,
      chapterId
    );

    if (failure) {
      setPanelStates(batchIds, "failed", {
        error: failure,
      });
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

function blockIndex(chapterId: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const block of blocksForChapter(chapterId)) {
    map.set(`${block.panelId}:${block.index}`, block.id);
  }
  return map;
}

/**
 * Translate + proofread over every usable panel. Returns true only when both
 * passes succeeded; a failure leaves the chapter editable and retryable.
 */
async function runTextStages(
  chapter: Chapter,
  actor: string
): Promise<boolean> {
  const panels = chapterPanels(chapter.id).filter((panel) => {
    const state = runState.panels[panel.id];
    return state === "extracted" || state === "done";
  });

  if (panels.length === 0) return false;

  const context = seriesContext(chapter);
  const usableIds = panels.map((panel) => panel.id);

  const sourcePayload = panels.map((panel) => ({
    panelId: panel.id,
    blocks: listBlocks(panel.id)
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
        language: SOURCE_LANGUAGE,
        context,
      }),
    });
    if (!response.ok) {
      patch({ error: await readFailure(response) });
      return false;
    }
    translations = ((await response.json()) as TranslateResponse).translations;
  } catch {
    patch({ error: { code: "network", message: pipelineErrorMessage("network") } });
    return false;
  }

  const translationIds = blockIndex(chapter.id);
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
    updateBlockPipelineText({
      chapterId: chapter.id,
      updates: translationUpdates,
    });
  }

  if (cancelRequested) return false;

  /* ---- proofread -------------------------------------------------- */

  patch({ stage: "proofread" });

  const glossary: GlossaryPromptTerm[] = activeGlossaryTerms(
    chapter.seriesId
  ).map((term) => ({
    sourceTerm: term.sourceTerm,
    targetTerm: term.targetTerm,
    category: term.category,
  }));

  const proofPayload = panels.map((panel) => ({
    panelId: panel.id,
    blocks: listBlocks(panel.id)
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
        glossary,
        context,
      }),
    });
    if (!response.ok) {
      patch({ error: await readFailure(response) });
      return false;
    }
    proof = (await response.json()) as ProofreadResponse;
  } catch {
    patch({ error: { code: "network", message: pipelineErrorMessage("network") } });
    return false;
  }

  const finalIds = blockIndex(chapter.id);
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
    updateBlockPipelineText({ chapterId: chapter.id, updates: finalUpdates });
  }

  // One write for the whole chapter: the pass is chapter-wide precisely so this
  // array is deduplicated once instead of forty overlapping times.
  upsertAutoTerms({
    seriesId: chapter.seriesId,
    chapterId: chapter.id,
    terms: proof.terms,
  });

  setPanelStates(usableIds, "done", { stage: "done" });
  void actor;
  return true;
}

function failureCount(): number {
  return Object.values(runState.panels).filter((state) => state === "failed")
    .length;
}

function finish(chapterId: string, actor: string, ready: boolean): void {
  if (ready && !cancelRequested && failureCount() === 0) {
    try {
      setChapterStatus({ chapterId, next: "ready", actor });
      patch({ stage: "done", running: false, error: null });
      return;
    } catch (error) {
      patch({ running: false, error: toFailure(error) });
      return;
    }
  }

  patch({ running: false });
}

function beginRun(chapterId: string, panels: Panel[]): void {
  activeChapterId = chapterId;
  cancelRequested = false;
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

export async function startRun(
  chapterId: string,
  actor: string
): Promise<void> {
  if (runState.running) {
    // The run state is module-level and holds one chapter at a time. Starting
    // a second run would wipe the first one's progress.
    throw new ChapterError(
      "bad-transition",
      activeChapterId === chapterId
        ? "A run is already in progress."
        : "Another chapter is still running. Wait for it to finish."
    );
  }

  const chapter = getChapter(chapterId);
  if (!chapter) {
    throw new ChapterError("not-found", "That chapter no longer exists.");
  }
  if (chapter.status === "submitted" || chapter.status === "approved") {
    throw new ChapterError(
      "bad-transition",
      chapter.status === "approved"
        ? "Reopen this chapter before running the pipeline again."
        : "This chapter is awaiting review. Wait for a decision first."
    );
  }

  const panels = chapterPanels(chapterId);
  if (panels.length === 0) {
    throw new ChapterError("no-content", "Upload a panel first.");
  }

  beginRun(chapterId, panels);

  try {
    // ready → processing is a legal transition; rejected has to reopen first.
    if (chapter.status === "rejected") {
      setChapterStatus({ chapterId, next: "draft", actor });
    }
    if (chapter.status === "draft" || chapter.status === "ready" || chapter.status === "rejected") {
      setChapterStatus({ chapterId, next: "processing", actor });
    }
  } catch (error) {
    patch({ running: false, error: toFailure(error) });
    return;
  }

  const extracted = await runExtract(chapterId, panels, actor);

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

  const textOk = await runTextStages(chapter, actor);
  finish(chapterId, actor, textOk);
}

export async function retryFailed(
  chapterId: string,
  actor: string
): Promise<void> {
  const chapter = getChapter(chapterId);
  if (!chapter) {
    throw new ChapterError("not-found", "That chapter no longer exists.");
  }
  if (runState.running) {
    throw new ChapterError("bad-transition", "A run is already in progress.");
  }

  const panels = chapterPanels(chapterId);
  const failed = panels.filter(
    (panel) => runState.panels[panel.id] === "failed"
  );

  // A run with nothing marked failed means the failure was in a text stage:
  // keep every panel's extracted text and re-run both passes over the chapter.
  const retryExtract = failed.length > 0;

  beginRun(chapterId, panels);

  if (retryExtract) {
    for (const panel of panels) {
      if (!failed.some((entry) => entry.id === panel.id)) {
        // A missing block set means the panel never extracted; redo those too.
        const hasText = listBlocks(panel.id).length > 0;
        runState.panels[panel.id] = hasText ? "extracted" : "pending";
      }
    }
    runState.extracted = Object.values(runState.panels).filter(
      (state) => state === "extracted"
    ).length;
    emit();

    await runExtract(chapterId, failed, actor);
  } else {
    for (const panel of panels) runState.panels[panel.id] = "extracted";
    runState.extracted = panels.length;
    emit();
  }

  const textOk = await runTextStages(chapter, actor);
  finish(chapterId, actor, textOk);
}
