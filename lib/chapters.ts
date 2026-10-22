/**
 * Browser-local chapter store.
 *
 * Mirrors the future Supabase tables so the migration stays mechanical:
 *
 *   Chapter            -> public.chapters
 *   Panel              -> public.chapter_pages
 *   TextBlock          -> public.text_blocks
 *   ChapterStatusEvent -> public.chapter_status_events
 *
 * Panel *images* are not here. They live in IndexedDB behind
 * `lib/panel-store.ts`, because a single chapter of data URLs exhausts the
 * ~5 MB localStorage quota. This module keeps the metadata; the uploader keeps
 * the blobs, and `deleteChapter` hands back the panel ids to purge.
 *
 * Permission checks live here, not in components. A Staff account calling
 * `deleteChapter`, `setChapterStatus` out of order, or writing to a series it is
 * not assigned to throws even if a control is accidentally rendered.
 */

import { normalizeUsername } from "./auth";
import {
  canManageSeries,
  getSeries,
  isAssigned,
  type Series,
} from "./series";
import { getMemberByUsername, type GroupRole } from "./groups";
import { putPanelImage } from "./panel-store";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export type ChapterStatus =
  | "draft"
  | "processing"
  | "ready"
  | "submitted"
  | "approved"
  | "rejected";

export type Chapter = {
  id: string;
  seriesId: string;
  groupId: string;
  number: number;
  title: string | null;
  status: ChapterStatus;
  rateSnapshot: number | null;
  submittedBy: string | null;
  /** Display name from the profile embed; the list falls back to @username. */
  submittedByName?: string | null;
  submittedAt: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  rejectionNote: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type Panel = {
  id: string;
  chapterId: string;
  index: number;
  width: number;
  height: number;
  byteSize: number;
  storageState: "stored" | "purged";
  createdAt: string;
  /** Short-lived signed URL when the panel still has an object. */
  imageUrl?: string | null;
};

export type TextBlock = {
  id: string;
  panelId: string;
  chapterId: string;
  index: number;
  bbox: { x: number; y: number; w: number; h: number } | null;
  sourceText: string;
  baseTranslation: string;
  finalText: string;
  confidence: number | null;
  isEdited: boolean;
  editedBy: string | null;
  editedAt: string | null;
};

export type ChapterStatusEvent = {
  id: string;
  chapterId: string;
  fromStatus: ChapterStatus | null;
  toStatus: ChapterStatus;
  actorId: string;
  note: string | null;
  createdAt: string;
};

/**
 * Per-panel pipeline status. Stage-level state (which pass is running) lives on
 * `RunState` in `lib/pipeline.ts` — extraction moves in batches and the text
 * passes move as one, so a panel does not track its own step.
 */
export type PanelPipelineState = {
  panelId: string;
  status: "pending" | "extracting" | "extracted" | "done" | "failed";
  error: string | null;
};

export type ChapterState = {
  version: 1;
  chapters: Chapter[];
  panels: Panel[];
  blocks: TextBlock[];
  statusEvents: ChapterStatusEvent[];
};

export type ChapterFailure =
  | "not-found"
  | "forbidden"
  | "invalid-number"
  | "duplicate-number"
  | "invalid-title"
  | "no-content"
  | "bad-transition"
  | "storage"
  | "unknown";

export class ChapterError extends Error {
  code: ChapterFailure;

  constructor(code: ChapterFailure, message?: string) {
    super(message ?? code);
    this.name = "ChapterError";
    this.code = code;
  }
}

/* ------------------------------------------------------------------ */
/* Constants + guards                                                  */
/* ------------------------------------------------------------------ */

const CHAPTERS_KEY = "hwaflow.chapters.v1";
const CHAPTERS_EVENT = "hwaflow:chapters";

export const MAX_CHAPTER_NUMBER = 99999;
export const MAX_CHAPTER_TITLE = 80;
export const MAX_BLOCK_TEXT = 4000;

/** Status dot colours are a UI concern; the ordering is not. */
export const CHAPTER_STATUS_LABEL: Record<ChapterStatus, string> = {
  draft: "Draft",
  processing: "Processing",
  ready: "Ready",
  submitted: "Submitted",
  approved: "Approved",
  rejected: "Rejected",
};

/**
 * Decorate, don't fork: the same roles that manage a series manage its
 * chapters. Staff additionally need an assignment to that series, which
 * `canViewChapter` already proves — callers that hold a chapter should use it.
 */
export function canEditChapter(
  role: GroupRole | null | undefined,
  assignedToSeries = false
): boolean {
  if (!role) return false;
  if (role === "owner" || role === "manager") return true;
  return assignedToSeries;
}

/* ------------------------------------------------------------------ */
/* Storage                                                             */
/* ------------------------------------------------------------------ */

function canUseStorage(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const probe = "__hwaflow_chapters_probe__";
    window.localStorage.setItem(probe, "1");
    window.localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

function emptyState(): ChapterState {
  return {
    version: 1,
    chapters: [],
    panels: [],
    blocks: [],
    statusEvents: [],
  };
}

export function getChapterState(): ChapterState {
  if (!canUseStorage()) return emptyState();
  try {
    const raw = window.localStorage.getItem(CHAPTERS_KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw) as Partial<ChapterState> | null;
    if (!parsed || typeof parsed !== "object") return emptyState();
    return {
      version: 1,
      chapters: Array.isArray(parsed.chapters) ? parsed.chapters : [],
      panels: Array.isArray(parsed.panels) ? parsed.panels : [],
      blocks: Array.isArray(parsed.blocks) ? parsed.blocks : [],
      statusEvents: Array.isArray(parsed.statusEvents)
        ? parsed.statusEvents
        : [],
    };
  } catch {
    return emptyState();
  }
}

function writeState(state: ChapterState): void {
  if (!canUseStorage()) {
    throw new ChapterError(
      "storage",
      "This browser is blocking local storage. Turn off private mode and try again."
    );
  }
  try {
    window.localStorage.setItem(CHAPTERS_KEY, JSON.stringify(state));
  } catch {
    throw new ChapterError(
      "storage",
      "This browser is out of storage. Delete a chapter or clear old panels."
    );
  }
  notifyChaptersChange();
}

function notifyChaptersChange(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(CHAPTERS_EVENT));
}

export function subscribeChapters(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};

  const onStorage = (event: StorageEvent) => {
    if (!event.key || event.key === CHAPTERS_KEY) listener();
  };

  window.addEventListener(CHAPTERS_EVENT, listener);
  window.addEventListener("storage", onStorage);

  return () => {
    window.removeEventListener(CHAPTERS_EVENT, listener);
    window.removeEventListener("storage", onStorage);
  };
}

function createId(prefix: string): string {
  if (typeof window !== "undefined" && "randomUUID" in window.crypto) {
    return window.crypto.randomUUID();
  }
  const bytes = new Uint8Array(12);
  if (typeof window !== "undefined") {
    window.crypto.getRandomValues(bytes);
  }
  const hex = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
  return `${prefix}_${hex}`;
}

/* ------------------------------------------------------------------ */
/* Pure helpers                                                        */
/* ------------------------------------------------------------------ */

export function cleanChapterTitle(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function roundChapterNumber(value: number): number {
  return Math.round(value * 100) / 100;
}

export function validateChapterNumber(value: number): string | null {
  if (!Number.isFinite(value)) return "Enter a chapter number.";
  if (value <= 0) return "Chapter numbers start at 1.";
  if (value > MAX_CHAPTER_NUMBER) {
    return `Keep the chapter number under ${MAX_CHAPTER_NUMBER}.`;
  }
  if (Math.abs(Math.round(value * 100) - value * 100) > 1e-6) {
    return "Use at most two decimal places.";
  }
  return null;
}

export function chapterLabel(chapter: Pick<Chapter, "number">): string {
  return `Chapter ${chapter.number}`;
}

function sortByNumber(a: Chapter, b: Chapter): number {
  return a.number - b.number;
}

/* ------------------------------------------------------------------ */
/* Permission helpers                                                  */
/* ------------------------------------------------------------------ */

function requireActorMember(groupId: string, actor: string) {
  const member = getMemberByUsername(groupId, actor);
  if (!member) {
    throw new ChapterError(
      "forbidden",
      "You're not a member of this group."
    );
  }
  return member;
}

function requireChapter(chapterId: string): Chapter {
  const chapter = getChapterState().chapters.find(
    (entry) => entry.id === chapterId
  );
  if (!chapter) {
    throw new ChapterError("not-found", "That chapter no longer exists.");
  }
  return chapter;
}

function requireSeriesForChapter(chapter: Chapter): Series {
  const series = getSeries(chapter.seriesId);
  if (!series || series.archived) {
    throw new ChapterError("not-found", "That series no longer exists.");
  }
  return series;
}

/** Owner/Manager always; Staff only when assigned to the chapter's series. */
function requireEditRights(chapter: Chapter, actor: string) {
  const member = requireActorMember(chapter.groupId, actor);
  const assigned = isAssigned(chapter.seriesId, member.username);
  if (!canEditChapter(member.role, assigned)) {
    throw new ChapterError(
      "forbidden",
      "You don't have access to this chapter. Ask a Manager or Owner to assign you."
    );
  }
  return member;
}

function requireManageRights(chapter: Chapter, actor: string) {
  const member = requireActorMember(chapter.groupId, actor);
  if (!canManageSeries(member.role)) {
    throw new ChapterError(
      "forbidden",
      "Only an Owner or Manager can do that."
    );
  }
  return member;
}

/* ------------------------------------------------------------------ */
/* Reads                                                               */
/* ------------------------------------------------------------------ */

export function listChaptersForSeries(seriesId: string): Chapter[] {
  return getChapterState()
    .chapters.filter((entry) => entry.seriesId === seriesId)
    .sort(sortByNumber);
}

export function getChapter(chapterId: string): Chapter | null {
  return (
    getChapterState().chapters.find((entry) => entry.id === chapterId) ?? null
  );
}

export function listPanels(chapterId: string): Panel[] {
  return getChapterState()
    .panels.filter((entry) => entry.chapterId === chapterId)
    .sort((a, b) => a.index - b.index);
}

export function getPanel(panelId: string): Panel | null {
  return (
    getChapterState().panels.find((entry) => entry.id === panelId) ?? null
  );
}

export function listBlocks(panelId: string): TextBlock[] {
  return getChapterState()
    .blocks.filter((entry) => entry.panelId === panelId)
    .sort((a, b) => a.index - b.index);
}

export function blocksForChapter(chapterId: string): TextBlock[] {
  return getChapterState()
    .blocks.filter((entry) => entry.chapterId === chapterId)
    .sort((a, b) => a.index - b.index);
}

export function getBlock(blockId: string): TextBlock | null {
  return (
    getChapterState().blocks.find((entry) => entry.id === blockId) ?? null
  );
}

/**
 * max(existing) + 1, minimum 1. A chapter numbered 12.5 suggests 13.5, which is
 * what a team counting half-chapters expects.
 */
export function nextChapterNumber(seriesId: string): number {
  const numbers = getChapterState().chapters
    .filter((entry) => entry.seriesId === seriesId)
    .map((entry) => entry.number);
  if (numbers.length === 0) return 1;
  return roundChapterNumber(Math.max(...numbers) + 1);
}

export function countChaptersForSeries(seriesId: string): number {
  return getChapterState().chapters.filter(
    (entry) => entry.seriesId === seriesId
  ).length;
}

export function countApprovedChaptersForMember(
  groupId: string,
  username: string
): number {
  const normalized = normalizeUsername(username);
  if (!normalized) return 0;
  return getChapterState().chapters.filter(
    (entry) =>
      entry.groupId === groupId &&
      entry.status === "approved" &&
      entry.submittedBy === normalized
  ).length;
}

export function canViewChapter(
  chapterId: string,
  username: string
): boolean {
  const chapter = getChapter(chapterId);
  if (!chapter) return false;
  const series = getSeries(chapter.seriesId);
  if (!series || series.archived) return false;
  const member = getMemberByUsername(chapter.groupId, username);
  if (!member) return false;
  if (canManageSeries(member.role)) return true;
  return isAssigned(chapter.seriesId, member.username);
}

/* ------------------------------------------------------------------ */
/* Writes                                                              */
/* ------------------------------------------------------------------ */

export type CreateChapterInput = {
  seriesId: string;
  actor: string;
};

export function createChapter(input: CreateChapterInput): Chapter {
  const series = getSeries(input.seriesId);
  if (!series || series.archived) {
    throw new ChapterError("not-found", "That series no longer exists.");
  }

  const member = requireActorMember(series.groupId, input.actor);
  const assigned = isAssigned(series.id, member.username);
  if (!canEditChapter(member.role, assigned)) {
    throw new ChapterError(
      "forbidden",
      "You need to be assigned to this series to create chapters."
    );
  }

  const state = getChapterState();
  const now = new Date().toISOString();
  const number = nextChapterNumber(series.id);

  const chapter: Chapter = {
    id: createId("ch"),
    seriesId: series.id,
    groupId: series.groupId,
    number,
    title: null,
    status: "draft",
    rateSnapshot: null,
    submittedBy: null,
    submittedAt: null,
    approvedBy: null,
    approvedAt: null,
    rejectionNote: null,
    createdBy: normalizeUsername(input.actor),
    createdAt: now,
    updatedAt: now,
  };

  const event: ChapterStatusEvent = {
    id: createId("cse"),
    chapterId: chapter.id,
    fromStatus: null,
    toStatus: "draft",
    actorId: normalizeUsername(input.actor),
    note: null,
    createdAt: now,
  };

  writeState({
    ...state,
    chapters: [...state.chapters, chapter],
    statusEvents: [...state.statusEvents, event],
  });

  return chapter;
}

export type UpdateChapterDetailsInput = {
  chapterId: string;
  number?: number;
  title?: string | null;
  actor: string;
};

export function updateChapterDetails(input: UpdateChapterDetailsInput): void {
  const state = getChapterState();
  const chapter = requireChapter(input.chapterId);
  requireEditRights(chapter, input.actor);

  let nextNumber = chapter.number;
  if (input.number !== undefined) {
    const numberError = validateChapterNumber(input.number);
    if (numberError) throw new ChapterError("invalid-number", numberError);
    nextNumber = roundChapterNumber(input.number);
    const duplicate = state.chapters.some(
      (entry) =>
        entry.seriesId === chapter.seriesId &&
        entry.id !== chapter.id &&
        entry.number === nextNumber
    );
    if (duplicate) {
      throw new ChapterError(
        "duplicate-number",
        "That chapter number is already taken."
      );
    }
  }

  let nextTitle = chapter.title;
  if (input.title !== undefined) {
    const cleaned = input.title === null ? "" : cleanChapterTitle(input.title);
    if (cleaned.length > MAX_CHAPTER_TITLE) {
      throw new ChapterError(
        "invalid-title",
        `Keep the title to ${MAX_CHAPTER_TITLE} characters or fewer.`
      );
    }
    nextTitle = cleaned || null;
  }

  if (nextNumber === chapter.number && nextTitle === chapter.title) return;

  writeState({
    ...state,
    chapters: state.chapters.map((entry) =>
      entry.id === chapter.id
        ? {
            ...entry,
            number: nextNumber,
            title: nextTitle,
            updatedAt: new Date().toISOString(),
          }
        : entry
    ),
  });
}

export type AddPanelsInput = {
  chapterId: string;
  actor: string;
  panels: Array<{ blob: Blob; width: number; height: number; byteSize: number }>;
};

/**
 * Writes metadata synchronously and the images to IndexedDB. If any image write
 * fails the metadata rollback runs, so a half-uploaded batch never leaves rows
 * that point at missing blobs.
 */
export async function addPanels(input: AddPanelsInput): Promise<Panel[]> {
  const state = getChapterState();
  const chapter = requireChapter(input.chapterId);
  requireEditRights(chapter, input.actor);

  const existing = listPanels(chapter.id);
  const now = new Date().toISOString();
  const startIndex = existing.length;

  const created: Panel[] = input.panels.map((panel, offset) => ({
    id: createId("pn"),
    chapterId: chapter.id,
    index: startIndex + offset,
    width: panel.width,
    height: panel.height,
    byteSize: panel.byteSize,
    storageState: "stored",
    createdAt: now,
  }));

  writeState({
    ...state,
    panels: [...state.panels, ...created],
    chapters: state.chapters.map((entry) =>
      entry.id === chapter.id ? { ...entry, updatedAt: now } : entry
    ),
  });

  try {
    for (let index = 0; index < created.length; index += 1) {
      await putPanelImage(created[index].id, input.panels[index].blob);
    }
  } catch (caught) {
    const ids = new Set(created.map((panel) => panel.id));
    const rolledBack = getChapterState();
    writeState({
      ...rolledBack,
      panels: rolledBack.panels.filter((panel) => !ids.has(panel.id)),
    });
    throw caught;
  }

  return created;
}

export type RemovePanelInput = {
  chapterId: string;
  panelId: string;
  actor: string;
};

export function removePanel(input: RemovePanelInput): void {
  const state = getChapterState();
  const chapter = requireChapter(input.chapterId);
  requireEditRights(chapter, input.actor);

  const panel = state.panels.find(
    (entry) => entry.id === input.panelId && entry.chapterId === chapter.id
  );
  if (!panel) {
    throw new ChapterError("not-found", "That panel no longer exists.");
  }

  const remaining = state.panels
    .filter(
      (entry) => entry.chapterId === chapter.id && entry.id !== panel.id
    )
    .sort((a, b) => a.index - b.index)
    .map((entry, index) => ({ ...entry, index }));

  const others = state.panels.filter(
    (entry) => entry.chapterId !== chapter.id
  );

  writeState({
    ...state,
    panels: [...others, ...remaining],
    blocks: state.blocks.filter((block) => block.panelId !== panel.id),
    chapters: state.chapters.map((entry) =>
      entry.id === chapter.id
        ? { ...entry, updatedAt: new Date().toISOString() }
        : entry
    ),
  });
}

export type IncomingBlock = {
  index: number;
  sourceText: string;
  baseTranslation?: string;
  finalText?: string;
  bbox?: { x: number; y: number; w: number; h: number } | null;
  confidence?: number | null;
};

export type SetPanelBlocksInput = {
  chapterId: string;
  panelId: string;
  blocks: IncomingBlock[];
  actor: string;
};

/**
 * Replaces the whole block set for one panel. Extraction writes all blocks for a
 * panel at once, and the text stages then update `baseTranslation` /
 * `finalText` through `updateBlockPipelineText`.
 */
export function setPanelBlocks(input: SetPanelBlocksInput): TextBlock[] {
  const state = getChapterState();
  const chapter = requireChapter(input.chapterId);
  requireEditRights(chapter, input.actor);

  const panel = state.panels.find(
    (entry) => entry.id === input.panelId && entry.chapterId === chapter.id
  );
  if (!panel) {
    throw new ChapterError("not-found", "That panel no longer exists.");
  }

  const previous = state.blocks.filter(
    (block) => block.panelId === panel.id
  );
  const previousEdited = new Map(
    previous.map((block) => [block.index, block])
  );

  const now = new Date().toISOString();
  const created: TextBlock[] = input.blocks.map((block) => {
    const existing = previousEdited.get(block.index);
    const sourceText = block.sourceText.trim();
    return {
      id: existing?.id ?? createId("tb"),
      panelId: panel.id,
      chapterId: chapter.id,
      index: block.index,
      bbox: block.bbox ?? null,
      sourceText,
      baseTranslation: block.baseTranslation ?? existing?.baseTranslation ?? "",
      finalText: block.finalText ?? existing?.finalText ?? "",
      confidence: block.confidence ?? null,
      isEdited: existing?.isEdited ?? false,
      editedBy: existing?.editedBy ?? null,
      editedAt: existing?.editedAt ?? null,
    };
  });

  writeState({
    ...state,
    blocks: [
      ...state.blocks.filter((block) => block.panelId !== panel.id),
      ...created,
    ],
    chapters: state.chapters.map((entry) =>
      entry.id === chapter.id ? { ...entry, updatedAt: now } : entry
    ),
  });

  return created;
}

/**
 * Pipeline-only write for the two text stages. Does not mark a block as human
 * edited, so the `Edited` chip keeps meaning "a person changed this".
 */
export function updateBlockPipelineText(input: {
  chapterId: string;
  updates: Array<{ blockId: string; baseTranslation?: string; finalText?: string }>;
}): void {
  const state = getChapterState();
  const chapter = requireChapter(input.chapterId);
  const byId = new Map(input.updates.map((entry) => [entry.blockId, entry]));
  if (byId.size === 0) return;

  writeState({
    ...state,
    blocks: state.blocks.map((block) => {
      const update = byId.get(block.id);
      if (!update) return block;
      return {
        ...block,
        baseTranslation: update.baseTranslation ?? block.baseTranslation,
        finalText: update.finalText ?? block.finalText,
      };
    }),
  });
}

export type UpdateBlockTextInput = {
  blockId: string;
  finalText: string;
  actor: string;
};

export function updateBlockText(input: UpdateBlockTextInput): void {
  const state = getChapterState();
  const block = state.blocks.find((entry) => entry.id === input.blockId);
  if (!block) {
    throw new ChapterError("not-found", "That bubble no longer exists.");
  }
  const chapter = requireChapter(block.chapterId);
  requireEditRights(chapter, input.actor);

  const finalText = input.finalText.trim();
  if (finalText.length > MAX_BLOCK_TEXT) {
    throw new ChapterError(
      "unknown",
      `Keep a bubble under ${MAX_BLOCK_TEXT} characters.`
    );
  }
  if (finalText === block.finalText) return;

  const now = new Date().toISOString();
  writeState({
    ...state,
    blocks: state.blocks.map((entry) =>
      entry.id === block.id
        ? {
            ...entry,
            finalText,
            isEdited: true,
            editedBy: normalizeUsername(input.actor),
            editedAt: now,
          }
        : entry
    ),
    chapters: state.chapters.map((entry) =>
      entry.id === block.chapterId ? { ...entry, updatedAt: now } : entry
    ),
  });
}

export type SetChapterStatusInput = {
  chapterId: string;
  next: ChapterStatus;
  note?: string | null;
  actor: string;
};

function canTransition(
  chapter: Chapter,
  next: ChapterStatus
): "edit" | "manage" | null {
  switch (chapter.status) {
    case "draft":
      return next === "processing" ? "edit" : null;
    case "processing":
      if (next === "ready" || next === "draft") return "edit";
      return null;
    case "ready":
      if (next === "submitted") return "edit";
      if (next === "processing") return "edit";
      return null;
    case "submitted":
      if (next === "approved" || next === "rejected") return "manage";
      return null;
    case "approved":
      return next === "submitted" ? "manage" : null;
    case "rejected":
      if (next === "draft") return "edit";
      if (next === "submitted") return "edit";
      return null;
    default:
      return null;
  }
}

export function setChapterStatus(input: SetChapterStatusInput): void {
  const state = getChapterState();
  const chapter = requireChapter(input.chapterId);
  const member = requireActorMember(chapter.groupId, input.actor);

  const requirement = canTransition(chapter, input.next);
  if (!requirement) {
    throw new ChapterError(
      "bad-transition",
      `A ${CHAPTER_STATUS_LABEL[chapter.status].toLowerCase()} chapter can't move to ${CHAPTER_STATUS_LABEL[
        input.next
      ].toLowerCase()}.`
    );
  }

  const assigned = isAssigned(chapter.seriesId, member.username);
  if (requirement === "manage") {
    if (!canManageSeries(member.role)) {
      throw new ChapterError(
        "forbidden",
        "Only an Owner or Manager can approve, reject or reopen a chapter."
      );
    }
  } else if (!canEditChapter(member.role, assigned)) {
    throw new ChapterError(
      "forbidden",
      "You don't have access to this chapter."
    );
  }

  if (input.next === "submitted") {
    const panels = listPanels(chapter.id);
    const hasText = state.blocks.some(
      (block) =>
        block.chapterId === chapter.id && block.finalText.trim().length > 0
    );
    if (panels.length === 0 || !hasText) {
      throw new ChapterError(
        "no-content",
        "Translate at least one panel before submitting."
      );
    }
  }

  const series = requireSeriesForChapter(chapter);
  const now = new Date().toISOString();
  const actorId = normalizeUsername(input.actor);

  const nextChapter: Chapter = { ...chapter, status: input.next, updatedAt: now };

  if (input.next === "submitted") {
    // Reopen keeps the original snapshotted rate; a fresh submit re-reads it.
    nextChapter.rateSnapshot =
      chapter.status === "approved" && chapter.rateSnapshot !== null
        ? chapter.rateSnapshot
        : Math.round((series.rateAmount ?? 0) * 100) / 100;
    nextChapter.submittedBy =
      chapter.status === "approved" && chapter.submittedBy
        ? chapter.submittedBy
        : actorId;
    nextChapter.submittedAt =
      chapter.status === "approved" && chapter.submittedAt
        ? chapter.submittedAt
        : now;
    nextChapter.rejectionNote = null;
  }

  if (input.next === "approved") {
    nextChapter.approvedBy = actorId;
    nextChapter.approvedAt = now;
  }

  if (input.next === "rejected") {
    nextChapter.approvedBy = null;
    nextChapter.approvedAt = null;
    nextChapter.rejectionNote = input.note?.trim() || null;
  }

  if (chapter.status === "approved" && input.next !== "approved") {
    nextChapter.approvedBy = null;
    nextChapter.approvedAt = null;
  }

  const event: ChapterStatusEvent = {
    id: createId("cse"),
    chapterId: chapter.id,
    fromStatus: chapter.status,
    toStatus: input.next,
    actorId,
    note: input.note?.trim() || null,
    createdAt: now,
  };

  writeState({
    ...state,
    chapters: state.chapters.map((entry) =>
      entry.id === chapter.id ? nextChapter : entry
    ),
    statusEvents: [...state.statusEvents, event],
  });
}

export type DeleteChapterInput = {
  chapterId: string;
  actor: string;
};

/**
 * Removes the chapter, its panels, blocks and audit trail. Returns the panel ids
 * so the caller can purge their images from IndexedDB — `deleteChapterImages`
 * in `lib/panel-store.ts`. Metadata is sync, image deletion is async, and mixing
 * the two here would make the store's contract depend on IndexedDB.
 */
export function deleteChapter(input: DeleteChapterInput): string[] {
  const state = getChapterState();
  const chapter = requireChapter(input.chapterId);
  requireManageRights(chapter, input.actor);

  const panelIds = state.panels
    .filter((entry) => entry.chapterId === chapter.id)
    .map((entry) => entry.id);

  writeState({
    ...state,
    chapters: state.chapters.filter((entry) => entry.id !== chapter.id),
    panels: state.panels.filter((entry) => entry.chapterId !== chapter.id),
    blocks: state.blocks.filter((entry) => entry.chapterId !== chapter.id),
    statusEvents: state.statusEvents.filter(
      (entry) => entry.chapterId !== chapter.id
    ),
  });

  // Image purge is the caller's awaited step — see the doc comment above.
  return panelIds;
}
