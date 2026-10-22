/**
 * Browser-local series store.
 *
 * Two shapes live in one localStorage key so a series and its initial
 * assignments are written atomically. They mirror the future Supabase tables:
 *
 *   Series           -> public.series
 *   SeriesAssignment -> public.series_assignments
 *
 * Permission checks live here, not in components. A Staff account calling
 * `createSeries` or `setSeriesAssignments` throws even if a control is
 * accidentally rendered.
 *
 * This module may import `lib/groups.ts`. `lib/groups.ts` must never import
 * this module (that would create a cycle); the member-removal flow calls
 * `removeMemberAssignments` from the component layer instead.
 */

import { normalizeUsername } from "./auth";
import {
  displayNameFor,
  getGroup,
  getMemberByUsername,
  getMembers,
  type GroupMember,
  type GroupRole,
} from "./groups";
import {
  MAX_SERIES_COVER_BYTES,
  seriesCoverByteSize,
} from "./series-cover";
import { isSourceLanguage, type SourceLanguage } from "./ai/types";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

/** 0 = Monday … 6 = Sunday, matching the Monday-first workspace UI. */
export type ReleaseDay = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export const RELEASE_DAY_LABELS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

export const RELEASE_DAY_SHORT = [
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
  "Sun",
] as const;

/** public.series */
export type Series = {
  id: string;
  groupId: string;
  title: string;
  genre: string | null;
  description: string | null;
  coverDataUrl: string | null;
  /** One or more weekdays, sorted ascending. A series can release more than once a week. */
  releaseDays: ReleaseDay[];
  /** Source language of the raws. Drives reading direction and prompt profile. */
  language: SourceLanguage;
  /** Money paid to the submitter when a chapter is approved. 0 is valid. */
  rateAmount: number;
  createdBy: string;
  createdAt: string;
  archived: boolean;
};

/** public.series_assignments */
export type SeriesAssignment = {
  id: string;
  seriesId: string;
  groupId: string;
  userId: string;
  username: string;
  assignedBy: string;
  createdAt: string;
};

export type SeriesState = {
  version: 1;
  series: Series[];
  assignments: SeriesAssignment[];
};

export type SeriesFailure =
  | "not-found"
  | "forbidden"
  | "not-member"
  | "invalid-title"
  | "invalid-day"
  | "invalid-genre"
  | "invalid-description"
  | "invalid-cover"
  | "invalid-rate"
  | "invalid-language"
  | "storage"
  | "unknown";

export class SeriesError extends Error {
  code: SeriesFailure;

  constructor(code: SeriesFailure, message?: string) {
    super(message ?? code);
    this.name = "SeriesError";
    this.code = code;
  }
}

/* ------------------------------------------------------------------ */
/* Constants + guards                                                  */
/* ------------------------------------------------------------------ */

const SERIES_KEY = "hwaflow.series.v1";
const SERIES_EVENT = "hwaflow:series";

export const MAX_SERIES_TITLE = 80;
export const MAX_SERIES_GENRE = 32;
export const MAX_SERIES_DESCRIPTION = 600;
export const MAX_SERIES_RATE = 9999.99;

export function canManageSeries(role: GroupRole): boolean {
  return role === "owner" || role === "manager";
}

export function isReleaseDay(value: number): value is ReleaseDay {
  return Number.isInteger(value) && value >= 0 && value <= 6;
}

/**
 * Release days are a set: order never matters, duplicates collapse, and at
 * least one day is required. Multi-day series render in every matching lane.
 */
export function normalizeReleaseDays(
  days: number[] | null | undefined
): ReleaseDay[] {
  if (!days || days.length === 0) {
    throw new SeriesError("invalid-day", "Pick at least one release day.");
  }

  const unique = new Set<ReleaseDay>();
  for (const day of days) {
    if (!isReleaseDay(day)) {
      throw new SeriesError("invalid-day", "Pick a valid release day.");
    }
    unique.add(day);
  }

  if (unique.size > 7) {
    throw new SeriesError("invalid-day", "A series releases on at most seven days.");
  }

  return Array.from(unique).sort((a, b) => a - b);
}

/* ------------------------------------------------------------------ */
/* Storage                                                             */
/* ------------------------------------------------------------------ */

function canUseStorage(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const probe = "__hwaflow_series_probe__";
    window.localStorage.setItem(probe, "1");
    window.localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

function emptyState(): SeriesState {
  return { version: 1, series: [], assignments: [] };
}

export function getSeriesState(): SeriesState {
  if (!canUseStorage()) return emptyState();
  try {
    const raw = window.localStorage.getItem(SERIES_KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw) as Partial<SeriesState> | null;
    if (!parsed || typeof parsed !== "object") return emptyState();
    return {
      version: 1,
      // `rateAmount` arrived with the chapter module and `language` after it;
      // older rows default to 0 and Korean rather than rendering `NaN` or
      // extracting Japanese raws right-to-left with left-to-right rules.
      series: Array.isArray(parsed.series)
        ? parsed.series.map((entry) => ({
            ...entry,
            // Rows written before multi-day releases carry `releaseDay`.
            releaseDays: Array.isArray(entry.releaseDays)
              ? entry.releaseDays.filter(isReleaseDay)
              : isReleaseDay(
                    (entry as unknown as { releaseDay?: number }).releaseDay ?? -1
                  )
                ? [
                    (entry as unknown as { releaseDay: ReleaseDay })
                      .releaseDay,
                  ]
                : [],
            language: isSourceLanguage(entry.language)
              ? entry.language
              : "ko",
            rateAmount:
              typeof entry.rateAmount === "number" ? entry.rateAmount : 0,
          }))
        : [],
      assignments: Array.isArray(parsed.assignments)
        ? parsed.assignments
        : [],
    };
  } catch {
    return emptyState();
  }
}

function writeState(state: SeriesState): void {
  if (!canUseStorage()) {
    throw new SeriesError(
      "storage",
      "This browser is blocking local storage. Turn off private mode and try again."
    );
  }
  try {
    window.localStorage.setItem(SERIES_KEY, JSON.stringify(state));
  } catch {
    throw new SeriesError(
      "storage",
      "We couldn't save that series in this browser. Storage may be full."
    );
  }
  notifySeriesChange();
}

function notifySeriesChange(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(SERIES_EVENT));
}

export function subscribeSeries(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};

  const onStorage = (event: StorageEvent) => {
    if (!event.key || event.key === SERIES_KEY) listener();
  };

  window.addEventListener(SERIES_EVENT, listener);
  window.addEventListener("storage", onStorage);

  return () => {
    window.removeEventListener(SERIES_EVENT, listener);
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

export function cleanSeriesTitle(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function validateSeriesTitle(value: string): string | null {
  const title = cleanSeriesTitle(value);
  if (!title) return "Give the series a title.";
  if (title.length < 2) return "Use at least 2 characters.";
  if (title.length > MAX_SERIES_TITLE) {
    return `Keep it to ${MAX_SERIES_TITLE} characters or fewer.`;
  }
  return null;
}

/**
 * Rates are money: validated here, rounded to 2 decimals on write so floating
 * point never leaks into a dashboard total. `0` is a valid rate.
 */
export function normalizeRateAmount(value: number | null | undefined): number {
  if (value === undefined || value === null) return 0;
  if (!Number.isFinite(value)) {
    throw new SeriesError("invalid-rate", "Enter the rate as a number.");
  }
  if (value < 0) {
    throw new SeriesError("invalid-rate", "A rate can't be negative.");
  }
  if (value > MAX_SERIES_RATE) {
    throw new SeriesError(
      "invalid-rate",
      `Keep the rate at ${MAX_SERIES_RATE} or less.`
    );
  }
  return Math.round(value * 100) / 100;
}

/**
 * `language` postdates older rows, so an absent value is Korean rather than an
 * error. An unknown value is an error: silently defaulting would extract manga
 * with Korean rules and in the wrong direction.
 */
export function normalizeSourceLanguage(
  value: SourceLanguage | null | undefined
): SourceLanguage {
  if (value === undefined || value === null) return "ko";
  if (!isSourceLanguage(value)) {
    throw new SeriesError("invalid-language", "Pick a source language.");
  }
  return value;
}

function normalizeOptionalText(
  value: string | null | undefined,
  max: number,
  failure: SeriesFailure,
  label: string
): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > max) {
    throw new SeriesError(
      failure,
      `Keep the ${label} to ${max} characters or fewer.`
    );
  }
  return trimmed;
}

function requireManageRights(
  groupId: string,
  actor: string
): GroupMember {
  const actorMember = getMemberByUsername(groupId, actor);
  if (!actorMember || !canManageSeries(actorMember.role)) {
    throw new SeriesError(
      "forbidden",
      "Only an Owner or Manager can manage series in this group."
    );
  }
  return actorMember;
}

type NormalizedAssignee = { username: string; userId: string };

/**
 * Every assignee must be a real group member and can never be the Owner.
 * Duplicates collapse, and the Owner check runs here so no UI path can bypass
 * it.
 */
function normalizeAssignees(
  groupId: string,
  usernames: string[] | undefined
): NormalizedAssignee[] {
  if (!usernames || usernames.length === 0) return [];
  const members = getMembers(groupId);
  const seen = new Set<string>();
  const result: NormalizedAssignee[] = [];

  for (const raw of usernames) {
    const username = normalizeUsername(raw);
    if (!username || seen.has(username)) continue;
    const member = members.find((entry) => entry.username === username);
    if (!member) {
      throw new SeriesError(
        "not-member",
        "Everyone assigned must be a member of this group."
      );
    }
    if (member.role === "owner") {
      throw new SeriesError(
        "forbidden",
        "The Owner can't be assigned to a series."
      );
    }
    seen.add(username);
    result.push({ username: member.username, userId: member.userId });
  }

  return result;
}

/* ------------------------------------------------------------------ */
/* Reads                                                               */
/* ------------------------------------------------------------------ */

function firstReleaseDay(series: Series): number {
  return series.releaseDays.length > 0 ? series.releaseDays[0] : 7;
}

function sortSeries(a: Series, b: Series): number {
  const dayA = firstReleaseDay(a);
  const dayB = firstReleaseDay(b);
  if (dayA !== dayB) return dayA - dayB;
  return a.title.localeCompare(b.title);
}

export function listSeriesForGroup(groupId: string): Series[] {
  return getSeriesState()
    .series.filter((entry) => entry.groupId === groupId && !entry.archived)
    .sort(sortSeries);
}

export function listSeriesForViewer(
  groupId: string,
  viewerUsername: string
): Series[] {
  const member = getMemberByUsername(groupId, viewerUsername);
  if (!member) return [];
  if (canManageSeries(member.role)) return listSeriesForGroup(groupId);

  const assigned = new Set(
    getSeriesState()
      .assignments.filter(
        (entry) =>
          entry.groupId === groupId &&
          entry.username === normalizeUsername(viewerUsername)
      )
      .map((entry) => entry.seriesId)
  );

  return listSeriesForGroup(groupId).filter((entry) => assigned.has(entry.id));
}

export function getSeries(seriesId: string): Series | null {
  return (
    getSeriesState().series.find((entry) => entry.id === seriesId) ?? null
  );
}

export function getAssignments(seriesId: string): SeriesAssignment[] {
  return getSeriesState()
    .assignments.filter((entry) => entry.seriesId === seriesId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function getAssignedUsernames(seriesId: string): string[] {
  return getAssignments(seriesId).map((entry) => entry.username);
}

export function isAssigned(
  seriesId: string,
  username: string
): boolean {
  const normalized = normalizeUsername(username);
  return getSeriesState().assignments.some(
    (entry) => entry.seriesId === seriesId && entry.username === normalized
  );
}

export function countSeriesInGroup(groupId: string): number {
  return getSeriesState().series.filter(
    (entry) => entry.groupId === groupId && !entry.archived
  ).length;
}

export function countSeriesForMember(
  groupId: string,
  username: string
): number {
  const normalized = normalizeUsername(username);
  if (!normalized) return 0;
  const state = getSeriesState();
  const visible = new Set(
    state.series
      .filter((entry) => entry.groupId === groupId && !entry.archived)
      .map((entry) => entry.id)
  );
  const assigned = new Set(
    state.assignments
      .filter(
        (entry) =>
          entry.groupId === groupId && entry.username === normalized
      )
      .map((entry) => entry.seriesId)
  );
  let total = 0;
  for (const id of assigned) if (visible.has(id)) total += 1;
  return total;
}

export function canViewSeries(
  seriesId: string,
  username: string
): boolean {
  const series = getSeries(seriesId);
  if (!series || series.archived) return false;
  const member = getMemberByUsername(series.groupId, username);
  if (!member) return false;
  if (canManageSeries(member.role)) return true;
  return isAssigned(seriesId, username);
}

export function assigneeDisplayName(username: string): string {
  return displayNameFor(username) ?? username;
}

/* ------------------------------------------------------------------ */
/* Writes                                                              */
/* ------------------------------------------------------------------ */

export type CreateSeriesInput = {
  groupId: string;
  title: string;
  genre?: string | null;
  description?: string | null;
  coverDataUrl?: string | null;
  releaseDays: number[];
  language?: SourceLanguage;
  rateAmount?: number;
  assigneeUsernames?: string[];
  actor: string;
};

export function createSeries(input: CreateSeriesInput): Series {
  const group = getGroup(input.groupId);
  if (!group) {
    throw new SeriesError("not-found", "That group no longer exists.");
  }

  requireManageRights(input.groupId, input.actor);

  const titleError = validateSeriesTitle(input.title);
  if (titleError) throw new SeriesError("invalid-title", titleError);
  const title = cleanSeriesTitle(input.title);

  const releaseDays = normalizeReleaseDays(input.releaseDays);

  const genre = normalizeOptionalText(
    input.genre,
    MAX_SERIES_GENRE,
    "invalid-genre",
    "genre"
  );
  const description = normalizeOptionalText(
    input.description,
    MAX_SERIES_DESCRIPTION,
    "invalid-description",
    "description"
  );

  const coverDataUrl = input.coverDataUrl ?? null;
  if (coverDataUrl) {
    if (!coverDataUrl.startsWith("data:image/")) {
      throw new SeriesError(
        "invalid-cover",
        "That cover could not be read."
      );
    }
    if (seriesCoverByteSize(coverDataUrl) > MAX_SERIES_COVER_BYTES) {
      throw new SeriesError(
        "invalid-cover",
        "That cover is over 120 KB after compression. Try a smaller image."
      );
    }
  }

  const assignees = normalizeAssignees(
    input.groupId,
    input.assigneeUsernames
  );

  const rateAmount = normalizeRateAmount(input.rateAmount);
  const language = normalizeSourceLanguage(input.language);

  const state = getSeriesState();
  const now = new Date().toISOString();
  const series: Series = {
    id: createId("s"),
    groupId: input.groupId,
    title,
    genre,
    description,
    coverDataUrl,
    releaseDays,
    language,
    rateAmount,
    createdBy: normalizeUsername(input.actor),
    createdAt: now,
    archived: false,
  };

  const assignments: SeriesAssignment[] = assignees.map((assignee) => ({
    id: createId("sa"),
    seriesId: series.id,
    groupId: series.groupId,
    userId: assignee.userId,
    username: assignee.username,
    assignedBy: normalizeUsername(input.actor),
    createdAt: now,
  }));

  writeState({
    ...state,
    series: [series, ...state.series],
    assignments: [...assignments, ...state.assignments],
  });

  return series;
}

export type SetSeriesAssignmentsInput = {
  seriesId: string;
  assigneeUsernames: string[];
  actor: string;
};

export function setSeriesAssignments(input: SetSeriesAssignmentsInput): void {
  const state = getSeriesState();
  const series = state.series.find(
    (entry) => entry.id === input.seriesId && !entry.archived
  );
  if (!series) {
    throw new SeriesError("not-found", "That series no longer exists.");
  }

  const group = getGroup(series.groupId);
  if (!group) {
    throw new SeriesError("not-found", "That group no longer exists.");
  }

  requireManageRights(series.groupId, input.actor);

  const next = normalizeAssignees(
    series.groupId,
    input.assigneeUsernames
  );
  const nextUsernames = new Set(next.map((entry) => entry.username));
  const current = state.assignments.filter(
    (entry) => entry.seriesId === series.id
  );
  const currentUsernames = new Set(current.map((entry) => entry.username));

  const added = next.filter(
    (entry) => !currentUsernames.has(entry.username)
  );

  const kept = current.filter((entry) =>
    nextUsernames.has(entry.username)
  );

  const created: SeriesAssignment[] = added.map((assignee) => ({
    id: createId("sa"),
    seriesId: series.id,
    groupId: series.groupId,
    userId: assignee.userId,
    username: assignee.username,
    assignedBy: normalizeUsername(input.actor),
    createdAt: new Date().toISOString(),
  }));

  const unchanged =
    added.length === 0 &&
    current.length === kept.length &&
    current.every((entry) => nextUsernames.has(entry.username));

  if (unchanged) return;

  writeState({
    ...state,
    assignments: [
      ...state.assignments.filter(
        (entry) => entry.seriesId !== series.id
      ),
      ...kept,
      ...created,
    ],
  });

  // Assignment rows are also written by the server RPC in the Supabase path;
  // the notification trigger lives there.
  void added;
}

export type UpdateSeriesInput = {
  seriesId: string;
  title: string;
  genre?: string | null;
  description?: string | null;
  coverDataUrl?: string | null;
  releaseDays: number[];
  language?: SourceLanguage;
  rateAmount?: number;
  actor: string;
};

/**
 * Whole-record replace of the editable fields. Same validation pipeline as
 * `createSeries`, same Owner/Manager guard. Assignments are deliberately not
 * touched here — they have their own dialog and their own notifications.
 */
export function updateSeries(input: UpdateSeriesInput): Series {
  const state = getSeriesState();
  const existing = state.series.find(
    (entry) => entry.id === input.seriesId && !entry.archived
  );
  if (!existing) {
    throw new SeriesError("not-found", "That series no longer exists.");
  }

  requireManageRights(existing.groupId, input.actor);

  const titleError = validateSeriesTitle(input.title);
  if (titleError) throw new SeriesError("invalid-title", titleError);

  const releaseDays = normalizeReleaseDays(input.releaseDays);

  const genre = normalizeOptionalText(
    input.genre,
    MAX_SERIES_GENRE,
    "invalid-genre",
    "genre"
  );
  const description = normalizeOptionalText(
    input.description,
    MAX_SERIES_DESCRIPTION,
    "invalid-description",
    "description"
  );

  const coverDataUrl = input.coverDataUrl ?? null;
  if (coverDataUrl) {
    if (!coverDataUrl.startsWith("data:image/")) {
      throw new SeriesError("invalid-cover", "That cover could not be read.");
    }
    if (seriesCoverByteSize(coverDataUrl) > MAX_SERIES_COVER_BYTES) {
      throw new SeriesError(
        "invalid-cover",
        "That cover is over 120 KB after compression. Try a smaller image."
      );
    }
  }

  const rateAmount = normalizeRateAmount(input.rateAmount);
  const language = normalizeSourceLanguage(input.language ?? existing.language);

  const next: Series = {
    ...existing,
    title: cleanSeriesTitle(input.title),
    genre,
    description,
    coverDataUrl,
    releaseDays,
    language,
    rateAmount,
  };

  writeState({
    ...state,
    series: state.series.map((entry) =>
      entry.id === existing.id ? next : entry
    ),
  });

  return next;
}

export function removeMemberAssignments(
  groupId: string,
  userId: string
): void {
  const state = getSeriesState();
  const next = state.assignments.filter(
    (entry) =>
      !(entry.groupId === groupId && entry.userId === userId)
  );
  if (next.length === state.assignments.length) return;
  writeState({ ...state, assignments: next });
}
