/**
 * Browser-local glossary store.
 *
 * Scope is per series and shared across every chapter of that series, which is
 * what keeps "Jihun" from becoming "Jihoon" in chapter 4. Mirrors the future
 * `glossary_terms` table.
 *
 *      GlossaryTerm -> public.glossary_terms
 *
 * Provenance is part of the contract: a human-added term is `manual` and the
 * pipeline may never overwrite it. Auto-detected terms are `auto`, dismissible,
 * and excluded from prompts once dismissed.
 */

import { canManageSeries, getSeries, isAssigned } from "./series";
import { getMemberByUsername } from "./groups";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export type GlossaryOrigin = "auto" | "manual";
export type GlossaryCategory =
  | "character"
  | "place"
  | "honorific"
  | "item"
  | "term";
export type GlossaryStatus = "active" | "dismissed";

export const GLOSSARY_CATEGORIES: GlossaryCategory[] = [
  "character",
  "place",
  "honorific",
  "item",
  "term",
];

export const GLOSSARY_CATEGORY_LABEL: Record<GlossaryCategory, string> = {
  character: "Character",
  place: "Place",
  honorific: "Honorific",
  item: "Item",
  term: "Term",
};

export type GlossaryTerm = {
  id: string;
  seriesId: string;
  sourceTerm: string;
  targetTerm: string;
  category: GlossaryCategory;
  origin: GlossaryOrigin;
  status: GlossaryStatus;
  chapterId: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type GlossaryState = {
  version: 1;
  terms: GlossaryTerm[];
};

export type GlossaryFailure =
  | "not-found"
  | "forbidden"
  | "invalid-term"
  | "duplicate-term"
  | "storage"
  | "unknown";

export class GlossaryError extends Error {
  code: GlossaryFailure;

  constructor(code: GlossaryFailure, message?: string) {
    super(message ?? code);
    this.name = "GlossaryError";
    this.code = code;
  }
}

/* ------------------------------------------------------------------ */
/* Constants + storage                                                 */
/* ------------------------------------------------------------------ */

const GLOSSARY_KEY = "hwaflow.glossary.v1";
const GLOSSARY_EVENT = "hwaflow:glossary";

export const MAX_TERM_LENGTH = 60;

function canUseStorage(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const probe = "__hwaflow_glossary_probe__";
    window.localStorage.setItem(probe, "1");
    window.localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

function emptyState(): GlossaryState {
  return { version: 1, terms: [] };
}

export function getGlossaryState(): GlossaryState {
  if (!canUseStorage()) return emptyState();
  try {
    const raw = window.localStorage.getItem(GLOSSARY_KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw) as Partial<GlossaryState> | null;
    if (!parsed || typeof parsed !== "object") return emptyState();
    return {
      version: 1,
      terms: Array.isArray(parsed.terms) ? parsed.terms : [],
    };
  } catch {
    return emptyState();
  }
}

function writeState(state: GlossaryState): void {
  if (!canUseStorage()) {
    throw new GlossaryError(
      "storage",
      "This browser is blocking local storage. Turn off private mode and try again."
    );
  }
  try {
    window.localStorage.setItem(GLOSSARY_KEY, JSON.stringify(state));
  } catch {
    throw new GlossaryError(
      "storage",
      "We couldn't save that term in this browser. Storage may be full."
    );
  }
  notifyGlossaryChange();
}

function notifyGlossaryChange(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(GLOSSARY_EVENT));
}

export function subscribeGlossary(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};

  const onStorage = (event: StorageEvent) => {
    if (!event.key || event.key === GLOSSARY_KEY) listener();
  };

  window.addEventListener(GLOSSARY_EVENT, listener);
  window.addEventListener("storage", onStorage);

  return () => {
    window.removeEventListener(GLOSSARY_EVENT, listener);
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
/* Validation + permissions                                            */
/* ------------------------------------------------------------------ */

export function cleanTerm(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

/** Dedupe key: case-insensitive, whitespace-collapsed, trimmed. */
export function termKey(value: string): string {
  return cleanTerm(value).toLocaleLowerCase();
}

function validateTermField(value: string, label: string): string {
  const cleaned = cleanTerm(value);
  if (!cleaned) throw new GlossaryError("invalid-term", `Add a ${label}.`);
  if (cleaned.length > MAX_TERM_LENGTH) {
    throw new GlossaryError(
      "invalid-term",
      `Keep the ${label} to ${MAX_TERM_LENGTH} characters or fewer.`
    );
  }
  return cleaned;
}

function requireEditRights(seriesId: string, actor: string) {
  const series = getSeries(seriesId);
  if (!series || series.archived) {
    throw new GlossaryError("not-found", "That series no longer exists.");
  }
  const member = getMemberByUsername(series.groupId, actor);
  if (!member) {
    throw new GlossaryError("forbidden", "You're not a member of this group.");
  }
  const assigned = isAssigned(seriesId, member.username);
  if (!canManageSeries(member.role) && !assigned) {
    throw new GlossaryError(
      "forbidden",
      "You don't have access to this series."
    );
  }
  return { series, member };
}

/* ------------------------------------------------------------------ */
/* Reads                                                               */
/* ------------------------------------------------------------------ */

export function listGlossaryTerms(
  seriesId: string,
  options?: { includeDismissed?: boolean }
): GlossaryTerm[] {
  const includeDismissed = options?.includeDismissed ?? false;
  return getGlossaryState()
    .terms.filter(
      (term) =>
        term.seriesId === seriesId &&
        (includeDismissed || term.status === "active")
    )
    .sort((a, b) => a.sourceTerm.localeCompare(b.sourceTerm));
}

export function activeGlossaryTerms(seriesId: string): GlossaryTerm[] {
  return listGlossaryTerms(seriesId).filter(
    (term) => term.status === "active"
  );
}

export function countActiveTerms(seriesId: string): number {
  return activeGlossaryTerms(seriesId).length;
}

/* ------------------------------------------------------------------ */
/* Writes                                                              */
/* ------------------------------------------------------------------ */

export type AddManualTermInput = {
  seriesId: string;
  sourceTerm: string;
  targetTerm: string;
  category: GlossaryCategory;
  actor: string;
};

export function addManualTerm(input: AddManualTermInput): GlossaryTerm {
  const { member } = requireEditRights(input.seriesId, input.actor);
  const sourceTerm = validateTermField(input.sourceTerm, "term");
  const targetTerm = validateTermField(input.targetTerm, "translation");
  const category = GLOSSARY_CATEGORIES.includes(input.category)
    ? input.category
    : "term";

  const state = getGlossaryState();
  const key = termKey(sourceTerm);
  const existing = state.terms.find(
    (term) => term.seriesId === input.seriesId && termKey(term.sourceTerm) === key
  );

  const now = new Date().toISOString();

  if (existing) {
    // Promoting an auto term is the documented path; a second manual definition
    // of the same source is an edit, not a new row.
    if (existing.origin === "manual" && existing.status === "active") {
      throw new GlossaryError(
        "duplicate-term",
        "That term is already in the glossary — edit it instead."
      );
    }
    const promoted: GlossaryTerm = {
      ...existing,
      targetTerm,
      category,
      origin: "manual",
      status: "active",
      createdBy: member.username,
      updatedAt: now,
    };
    writeState({
      ...state,
      terms: state.terms.map((term) =>
        term.id === existing.id ? promoted : term
      ),
    });
    return promoted;
  }

  const term: GlossaryTerm = {
    id: createId("gl"),
    seriesId: input.seriesId,
    sourceTerm,
    targetTerm,
    category,
    origin: "manual",
    status: "active",
    chapterId: null,
    createdBy: member.username,
    createdAt: now,
    updatedAt: now,
  };

  writeState({ ...state, terms: [...state.terms, term] });
  return term;
}

export type UpsertAutoTermsInput = {
  seriesId: string;
  chapterId: string | null;
  terms: Array<{
    sourceTerm: string;
    targetTerm: string;
    category: string;
  }>;
};

/**
 * Called once per chapter run with the proofread pass's `terms` array.
 *
 * - never overwrites a `manual` term
 * - never revives a `dismissed` term
 * - collapses duplicates inside the same payload
 */
export function upsertAutoTerms(input: UpsertAutoTermsInput): number {
  if (input.terms.length === 0) return 0;

  const state = getGlossaryState();
  const now = new Date().toISOString();
  const byKey = new Map(
    state.terms
      .filter((term) => term.seriesId === input.seriesId)
      .map((term) => [termKey(term.sourceTerm), term])
  );

  const additions: GlossaryTerm[] = [];
  const updates = new Map<string, GlossaryTerm>();
  const seen = new Set<string>();

  for (const candidate of input.terms) {
    const sourceTerm = cleanTerm(candidate.sourceTerm ?? "");
    const targetTerm = cleanTerm(candidate.targetTerm ?? "");
    if (!sourceTerm || !targetTerm) continue;
    if (
      sourceTerm.length > MAX_TERM_LENGTH ||
      targetTerm.length > MAX_TERM_LENGTH
    ) {
      continue;
    }

    const key = termKey(sourceTerm);
    if (seen.has(key)) continue;
    seen.add(key);

    const existing = byKey.get(key);
    if (existing) {
      if (existing.origin === "manual" || existing.status === "dismissed") {
        continue;
      }
      updates.set(existing.id, {
        ...existing,
        targetTerm,
        category: GLOSSARY_CATEGORIES.includes(
          candidate.category as GlossaryCategory
        )
          ? (candidate.category as GlossaryCategory)
          : existing.category,
        updatedAt: now,
      });
      continue;
    }

    additions.push({
      id: createId("gl"),
      seriesId: input.seriesId,
      sourceTerm,
      targetTerm,
      category: GLOSSARY_CATEGORIES.includes(
        candidate.category as GlossaryCategory
      )
        ? (candidate.category as GlossaryCategory)
        : "term",
      origin: "auto",
      status: "active",
      chapterId: input.chapterId,
      createdBy: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  if (additions.length === 0 && updates.size === 0) return 0;

  writeState({
    ...state,
    terms: [
      ...state.terms.map((term) => updates.get(term.id) ?? term),
      ...additions,
    ],
  });

  return additions.length + updates.size;
}

export type UpdateTermInput = {
  termId: string;
  targetTerm?: string;
  category?: GlossaryCategory;
  actor: string;
};

export function updateTerm(input: UpdateTermInput): void {
  const state = getGlossaryState();
  const term = state.terms.find((entry) => entry.id === input.termId);
  if (!term) {
    throw new GlossaryError("not-found", "That term no longer exists.");
  }
  requireEditRights(term.seriesId, input.actor);

  const targetTerm =
    input.targetTerm === undefined
      ? term.targetTerm
      : validateTermField(input.targetTerm, "translation");
  const category =
    input.category && GLOSSARY_CATEGORIES.includes(input.category)
      ? input.category
      : term.category;

  if (targetTerm === term.targetTerm && category === term.category) return;

  writeState({
    ...state,
    terms: state.terms.map((entry) =>
      entry.id === term.id
        ? {
            ...entry,
            targetTerm,
            category,
            // A human editing an auto term makes it manual: the next run must
            // not overwrite the wording they just chose.
            origin: "manual",
            updatedAt: new Date().toISOString(),
          }
        : entry
    ),
  });
}

export function dismissTerm(termId: string, actor: string): void {
  const state = getGlossaryState();
  const term = state.terms.find((entry) => entry.id === termId);
  if (!term) {
    throw new GlossaryError("not-found", "That term no longer exists.");
  }
  requireEditRights(term.seriesId, actor);
  if (term.status === "dismissed") return;

  writeState({
    ...state,
    terms: state.terms.map((entry) =>
      entry.id === term.id
        ? { ...entry, status: "dismissed", updatedAt: new Date().toISOString() }
        : entry
    ),
  });
}

export function restoreTerm(termId: string, actor: string): void {
  const state = getGlossaryState();
  const term = state.terms.find((entry) => entry.id === termId);
  if (!term) {
    throw new GlossaryError("not-found", "That term no longer exists.");
  }
  requireEditRights(term.seriesId, actor);
  if (term.status === "active") return;

  writeState({
    ...state,
    terms: state.terms.map((entry) =>
      entry.id === term.id
        ? { ...entry, status: "active", updatedAt: new Date().toISOString() }
        : entry
    ),
  });
}

/** Prompt payload: active terms only, trimmed to what the model needs. */
export function glossaryPromptTerms(seriesId: string) {
  return activeGlossaryTerms(seriesId).map((term) => ({
    sourceTerm: term.sourceTerm,
    targetTerm: term.targetTerm,
    category: term.category,
  }));
}

export function glossaryViewerIsEditor(
  seriesId: string,
  username: string
): boolean {
  const series = getSeries(seriesId);
  if (!series) return false;
  const member = getMemberByUsername(series.groupId, username);
  if (!member) return false;
  return (
    canManageSeries(member.role) || isAssigned(seriesId, member.username)
  );
}
