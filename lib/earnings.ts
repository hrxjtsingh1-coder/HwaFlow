/**
 * Earnings are always derived from approved work, never stored as a running
 * total (ARCHITECTURE.md R4).
 *
 *   amount = sum(chapter.rateSnapshot) for chapters where status = 'approved'
 *            and approvedAt falls in the current calendar month.
 *
 * The rate is snapshotted onto the chapter at submit time, so editing a series
 * rate never rewrites history and reopening an approval removes the money by
 * simply changing the status.
 *
 * `lib/chapters.ts` must never import this module — that would be a cycle.
 */

import { normalizeUsername } from "./auth";
import { getChapterState, type Chapter } from "./chapters";

function inCurrentMonth(iso: string | null, now: Date): boolean {
  if (!iso) return false;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return false;
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth()
  );
}

function approvedThisMonth(
  predicate: (chapter: Chapter) => boolean,
  now = new Date()
): Chapter[] {
  return getChapterState().chapters.filter(
    (chapter) =>
      chapter.status === "approved" &&
      inCurrentMonth(chapter.approvedAt, now) &&
      predicate(chapter)
  );
}

function sumRates(chapters: Chapter[]): number {
  const total = chapters.reduce(
    (accumulator, chapter) => accumulator + (chapter.rateSnapshot ?? 0),
    0
  );
  // Money is stored at 2 decimals; keep it there.
  return Math.round(total * 100) / 100;
}

export function totalEarningsThisMonth(username: string): number {
  const normalized = normalizeUsername(username);
  if (!normalized) return 0;
  return sumRates(
    approvedThisMonth((chapter) => chapter.submittedBy === normalized)
  );
}

/** Approved chapters credited to a member, or to the whole group when omitted. */
export function approvedChaptersThisMonth(username?: string): number {
  if (!username) {
    return approvedThisMonth(() => true).length;
  }
  const normalized = normalizeUsername(username);
  if (!normalized) return 0;
  return approvedThisMonth(
    (chapter) => chapter.submittedBy === normalized
  ).length;
}

/** Owner-only group stat. */
export function groupEarningsThisMonth(groupId: string): number {
  return sumRates(approvedThisMonth((chapter) => chapter.groupId === groupId));
}

/** Manager/Staff stat: only the viewer's own approved work in this group. */
export function memberEarningsThisMonth(
  groupId: string,
  username: string
): number {
  const normalized = normalizeUsername(username);
  if (!normalized) return 0;
  return sumRates(
    approvedThisMonth(
      (chapter) =>
        chapter.groupId === groupId && chapter.submittedBy === normalized
    )
  );
}
