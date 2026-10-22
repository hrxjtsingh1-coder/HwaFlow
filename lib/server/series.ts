/**
 * Server-side series reads.
 *
 * RLS does the access split: an Owner or Manager sees every non-archived
 * series in their group, Staff only rows they're assigned to. Both call the
 * same query, so no role branch can drift from the database policy.
 *
 * Covers live in the private `covers` bucket as
 * `{group}/{series}/cover.webp`; the page receives a short-lived signed URL in
 * `coverDataUrl` so every image component keeps one prop.
 */

import "server-only";

import type { SourceLanguage } from "../ai/types";
import type { Group, GroupMember, GroupRole } from "../groups";
import type { AuthUser } from "../identity";
import {
  isReleaseDay,
  type ReleaseDay,
  type Series,
  type SeriesAssignment,
} from "../series";
import { createClient } from "../supabase/server";
import {
  mapGroup,
  mapGroupMember,
  type GroupMemberRow,
  type GroupRow,
} from "./groups";
import { signedUrlMap } from "./storage";

/* ------------------------------------------------------------------ */
/* Row shapes                                                          */
/* ------------------------------------------------------------------ */

type ProfileEmbed = {
  username: string;
  display_name: string;
} | null;

type SeriesAssignmentRow = {
  user_id: string;
  assigned_by: string;
  created_at: string;
  profiles?: ProfileEmbed;
};

export type SeriesRow = {
  id: string;
  group_id: string;
  title: string;
  genre: string | null;
  description: string | null;
  cover_path: string | null;
  source_language: string;
  reading_direction: string;
  rate_amount: number | string;
  archived: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
  creator?: ProfileEmbed;
  series_release_days?: Array<{ weekday: number }>;
  series_assignments?: SeriesAssignmentRow[];
};

/* ------------------------------------------------------------------ */
/* Public shapes                                                       */
/* ------------------------------------------------------------------ */

export type SeriesList = {
  series: Series[];
  assignments: SeriesAssignment[];
};

export type SeriesBundle = {
  series: Series;
  group: Group;
  viewerMember: GroupMember;
  viewerRole: GroupRole;
  members: GroupMember[];
  assignments: SeriesAssignment[];
  creatorName: string;
};

/* ------------------------------------------------------------------ */
/* Mapping                                                             */
/* ------------------------------------------------------------------ */

function releaseDaysOf(row: SeriesRow): ReleaseDay[] {
  const days = (row.series_release_days ?? [])
    .map((entry) => entry.weekday)
    .filter((day): day is ReleaseDay => isReleaseDay(day));

  return Array.from(new Set(days)).sort((a, b) => a - b);
}

function mapAssignment(
  series: Pick<Series, "id" | "groupId">,
  row: SeriesAssignmentRow
): SeriesAssignment {
  return {
    id: `${series.id}:${row.user_id}`,
    seriesId: series.id,
    groupId: series.groupId,
    userId: row.user_id,
    username: row.profiles?.username ?? "",
    assignedBy: row.assigned_by,
    createdAt: row.created_at,
  };
}

function mapSeries(row: SeriesRow, coverUrl: string | null): Series {
  return {
    id: row.id,
    groupId: row.group_id,
    title: row.title,
    genre: row.genre,
    description: row.description,
    coverDataUrl: coverUrl,
    releaseDays: releaseDaysOf(row),
    language: row.source_language as SourceLanguage,
    rateAmount: Number(row.rate_amount),
    createdBy: row.creator?.username ?? "",
    createdAt: row.created_at,
    archived: row.archived,
  };
}

function sortSeries(a: Series, b: Series): number {
  const dayA = a.releaseDays[0] ?? 7;
  const dayB = b.releaseDays[0] ?? 7;
  if (dayA !== dayB) return dayA - dayB;
  return a.title.localeCompare(b.title);
}

function fail(scope: string, message: string): never {
  throw new Error(`[series:${scope}] ${message}`);
}

/* ------------------------------------------------------------------ */
/* Queries                                                             */
/* ------------------------------------------------------------------ */

const SERIES_COLUMNS = `
  id, group_id, title, genre, description, cover_path, source_language,
  reading_direction, rate_amount, archived, created_by, created_at, updated_at,
  creator:profiles!series_created_by_fkey(username, display_name),
  series_release_days(weekday),
  series_assignments(
    user_id, assigned_by, created_at,
    profiles!series_assignments_user_id_fkey(username, display_name)
  )
`;

/**
 * Every series the viewer can read in one group. Staff get their assignments
 * only; RLS decides, not this function.
 */
export async function listSeriesForGroup(
  groupId: string,
  viewer: AuthUser
): Promise<SeriesList> {
  void viewer;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("series")
    .select(SERIES_COLUMNS)
    .eq("group_id", groupId)
    .eq("archived", false);

  if (error) fail("listSeriesForGroup", error.message);

  const rows = (data ?? []) as unknown as SeriesRow[];

  const coverUrls = await signedUrlMap(
    supabase,
    "covers",
    rows.map((row) => row.cover_path)
  );

  const series = rows
    .map((row) =>
      mapSeries(
        row,
        row.cover_path ? coverUrls.get(row.cover_path) ?? null : null
      )
    )
    .sort(sortSeries);

  const assignments: SeriesAssignment[] = [];
  const byId = new Map(series.map((entry) => [entry.id, entry]));
  for (const row of rows) {
    const mapped = byId.get(row.id);
    if (!mapped) continue;
    for (const assignment of row.series_assignments ?? []) {
      assignments.push(mapAssignment(mapped, assignment));
    }
  }

  return { series, assignments };
}

/** Alias kept for the plan's surface names; access is identical. */
export async function listSeriesForViewer(
  groupId: string,
  viewer: AuthUser
): Promise<SeriesList> {
  return listSeriesForGroup(groupId, viewer);
}

/**
 * One series plus its group and roster. Returns null when RLS hides the row,
 * which is also the answer for an unassigned Staff member.
 */
export async function getSeriesBundle(
  seriesId: string,
  viewer: AuthUser
): Promise<SeriesBundle | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("series")
    .select(SERIES_COLUMNS)
    .eq("id", seriesId)
    .maybeSingle();

  if (error) fail("getSeriesBundle.series", error.message);
  if (!data) return null;

  const row = data as unknown as SeriesRow;

  const [{ data: groupData, error: groupError }, { data: memberData, error: memberError }] =
    await Promise.all([
      supabase
        .from("groups")
        .select("id, name, slug, currency, icon_path, created_by, created_at")
        .eq("id", row.group_id)
        .maybeSingle(),
      supabase
        .from("group_members")
        .select(
          "id, group_id, user_id, role, invited_by, joined_at, profiles!group_members_user_id_fkey(username, display_name)"
        )
        .eq("group_id", row.group_id),
    ]);

  if (groupError) fail("getSeriesBundle.group", groupError.message);
  if (memberError) fail("getSeriesBundle.members", memberError.message);
  if (!groupData) return null;

  const memberRows = (memberData ?? []) as unknown as GroupMemberRow[];
  const viewerRow = memberRows.find((member) => member.user_id === viewer.id);
  if (!viewerRow) return null;

  const coverUrl = row.cover_path
    ? (await signedUrlMap(supabase, "covers", [row.cover_path])).get(
        row.cover_path
      ) ?? null
    : null;

  const series = mapSeries(row, coverUrl);
  const assignments = (row.series_assignments ?? []).map((assignment) =>
    mapAssignment(series, assignment)
  );

  return {
    series,
    group: mapGroup(groupData as unknown as GroupRow, null),
    viewerMember: mapGroupMember(viewerRow),
    viewerRole: viewerRow.role,
    members: memberRows
      .map(mapGroupMember)
      .sort((a, b) => {
        const rank: Record<GroupRole, number> = {
          owner: 3,
          manager: 2,
          staff: 1,
        };
        const byRole = rank[b.role] - rank[a.role];
        return byRole !== 0 ? byRole : a.joinedAt.localeCompare(b.joinedAt);
      }),
    assignments,
    creatorName: row.creator?.display_name ?? row.creator?.username ?? "",
  };
}
