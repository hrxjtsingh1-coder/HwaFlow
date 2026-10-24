/**
 * Server-side group reads.
 *
 * Every query uses the cookie-bound client from `lib/supabase/server.ts`, so
 * row-level security decides what comes back. This module never uses the
 * secret key: a bug here can expose nothing a signed-in user could not already
 * ask PostgREST for.
 *
 * Reads are split by surface so each page fetches only what it renders:
 *   - `/groups`              -> listGroupsForViewer, listReceivedInvites
 *   - `/groups/[id]`         -> getGroupBundle
 *   - `/groups/[id]/settings`-> getGroupBundle, countSeriesAssignments
 *   - `/admin/groups`        -> listGroupsForAdmin
 */

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  Group,
  GroupInvite,
  GroupMember,
  GroupRole,
} from "../groups";
import type { AuthUser } from "../identity";
import { createClient } from "../supabase/server";
import { countByKey } from "./counts";
import { selectAllPages } from "./pagination";
import { signedUrlMap } from "./storage";

/* ------------------------------------------------------------------ */
/* Row shapes                                                          */
/* ------------------------------------------------------------------ */

type ProfileEmbed = {
  username: string;
  display_name: string;
} | null;

export type GroupRow = {
  id: string;
  name: string;
  slug: string;
  currency: string;
  icon_path: string | null;
  created_by: string | null;
  created_at: string;
};

type GroupMemberRow = {
  id: string;
  group_id: string;
  user_id: string;
  role: GroupRole;
  invited_by: string | null;
  joined_at: string;
  profiles?: ProfileEmbed;
};

export type { GroupMemberRow };

type GroupInviteRow = {
  id: string;
  group_id: string;
  role: "manager" | "staff";
  status: "pending" | "accepted" | "revoked";
  invited_by: string | null;
  created_at: string;
  invitee?: ProfileEmbed;
  inviter?: ProfileEmbed;
};

type MembershipRow = GroupMemberRow & {
  groups: GroupRow;
};

/* ------------------------------------------------------------------ */
/* Public shapes                                                       */
/* ------------------------------------------------------------------ */

export type GroupMembership = {
  group: Group;
  member: GroupMember;
  memberCount: number;
  seriesCount: number;
};

export type GroupBundle = {
  group: Group;
  viewerMember: GroupMember;
  members: GroupMember[];
  /** Pending invites. Empty for Staff. */
  invites: GroupInvite[];
  seriesCount: number;
};

export type ReceivedInvite = {
  invite: GroupInvite;
  group: Group;
};

export type AdminGroupCard = {
  group: Group;
  owner: GroupMember | null;
  memberCount: number;
  seriesCount: number;
};

/* ------------------------------------------------------------------ */
/* Mappers                                                             */
/* ------------------------------------------------------------------ */

export function mapGroup(row: GroupRow, iconUrl: string | null): Group {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    currency: row.currency.trim(),
    // Signed URL for server groups; the same field carries the local data URL
    // in the pre-migration modules, so every avatar keeps one code path.
    iconDataUrl: iconUrl,
    // `groups.created_by` is a uuid. No surface renders it; the Owner is the
    // person the UI cares about and comes from group_members.
    createdBy: "",
    createdAt: row.created_at,
  };
}

export function mapGroupMember(row: GroupMemberRow): GroupMember {
  return {
    id: row.id,
    groupId: row.group_id,
    userId: row.user_id,
    username: row.profiles?.username ?? "",
    displayName: row.profiles?.display_name ?? "Unknown member",
    role: row.role,
    invitedBy: null,
    joinedAt: row.joined_at,
  };
}

function mapGroupInvite(
  row: GroupInviteRow,
  username: string
): GroupInvite {
  return {
    id: row.id,
    groupId: row.group_id,
    username,
    role: row.role,
    status: row.status,
    invitedBy: row.inviter?.username ?? "unknown",
    createdAt: row.created_at,
  };
}

function fail(scope: string, message: string): never {
  throw new Error(`[groups:${scope}] ${message}`);
}

/* ------------------------------------------------------------------ */
/* `/groups`                                                           */
/* ------------------------------------------------------------------ */

export async function listGroupsForViewer(
  viewer: AuthUser
): Promise<GroupMembership[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("group_members")
    .select(
      "id, group_id, user_id, role, invited_by, joined_at, groups!inner(id, name, slug, currency, icon_path, created_by, created_at)"
    )
    .eq("user_id", viewer.id);

  if (error) fail("listGroupsForViewer", error.message);

  const rows = (data ?? []) as unknown as MembershipRow[];
  if (rows.length === 0) return [];

  const groupIds = rows.map((row) => row.group_id);

  const [{ data: memberRows, error: memberError }, { data: seriesRows, error: seriesError }, iconUrls] =
    await Promise.all([
      supabase
        .from("group_members")
        .select("group_id")
        .in("group_id", groupIds),
      supabase
        .from("series")
        .select("group_id")
        .in("group_id", groupIds)
        .eq("archived", false),
      signedUrlMap(
        supabase,
        "group-icons",
        rows.map((row) => row.groups.icon_path)
      ),
    ]);

  if (memberError) fail("listGroupsForViewer.counts", memberError.message);
  if (seriesError) fail("listGroupsForViewer.series", seriesError.message);

  const counts = new Map<string, number>();
  for (const row of (memberRows ?? []) as Array<{ group_id: string }>) {
    counts.set(row.group_id, (counts.get(row.group_id) ?? 0) + 1);
  }

  const seriesCounts = new Map<string, number>();
  for (const row of (seriesRows ?? []) as Array<{ group_id: string }>) {
    seriesCounts.set(row.group_id, (seriesCounts.get(row.group_id) ?? 0) + 1);
  }

  return rows
    .map((row) => ({
      group: mapGroup(
        row.groups,
        row.groups.icon_path ? iconUrls.get(row.groups.icon_path) ?? null : null
      ),
      member: mapGroupMember(row),
      memberCount: counts.get(row.group_id) ?? 1,
      seriesCount: seriesCounts.get(row.group_id) ?? 0,
    }))
    .sort((a, b) => a.group.name.localeCompare(b.group.name));
}

/* ------------------------------------------------------------------ */
/* `/groups/[id]`                                                      */
/* ------------------------------------------------------------------ */

export async function getGroupBundle(
  groupId: string,
  viewer: AuthUser
): Promise<GroupBundle | null> {
  const supabase = await createClient();

  const { data: groupData, error: groupError } = await supabase
    .from("groups")
    .select("id, name, slug, currency, icon_path, created_by, created_at")
    .eq("id", groupId)
    .maybeSingle();

  // RLS returns no row for a non-member, so "not found" and "forbidden" look
  // the same on purpose.
  if (groupError) fail("getGroupBundle.group", groupError.message);
  if (!groupData) return null;

  const groupRow = groupData as unknown as GroupRow;

  const { data: memberData, error: memberError } = await supabase
    .from("group_members")
    .select(
      "id, group_id, user_id, role, invited_by, joined_at, profiles!group_members_user_id_fkey(username, display_name)"
    )
    .eq("group_id", groupId);

  if (memberError) fail("getGroupBundle.members", memberError.message);

  const memberRows = (memberData ?? []) as unknown as GroupMemberRow[];
  const viewerRow = memberRows.find((row) => row.user_id === viewer.id);
  if (!viewerRow) return null;

  const viewerRole = viewerRow.role;
  const canManageInvites = viewerRole === "owner" || viewerRole === "manager";

  const [{ data: inviteData, error: inviteError }, iconUrl] = await Promise.all([
    canManageInvites
      ? supabase
          .from("group_invites")
          .select(
            "id, group_id, role, status, invited_by, created_at, invitee:profiles!group_invites_user_id_fkey(username, display_name), inviter:profiles!group_invites_invited_by_fkey(username, display_name)"
          )
          .eq("group_id", groupId)
          .eq("status", "pending")
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    // Signing is a second network hop; await it next to the invite query.
    // (The helper swallows unreadable objects and returns null.)
    (async () => {
      if (!groupRow.icon_path) return null;
      const urls = await signedUrlMap(supabase, "group-icons", [
        groupRow.icon_path,
      ]);
      return urls.get(groupRow.icon_path) ?? null;
    })(),
  ]);

  if (inviteError) fail("getGroupBundle.invites", inviteError.message);

  const inviteRows = (inviteData ?? []) as unknown as GroupInviteRow[];

  return {
    group: mapGroup(groupRow, iconUrl),
    viewerMember: mapGroupMember(viewerRow),
    members: memberRows
      .map(mapGroupMember)
      .sort((a, b) => {
        const rank: Record<GroupRole, number> = {
          owner: 3,
          manager: 2,
          staff: 1,
        };
        const byRole = rank[b.role] - rank[a.role];
        if (byRole !== 0) return byRole;
        return a.joinedAt.localeCompare(b.joinedAt);
      }),
    invites: inviteRows.map((row) =>
      mapGroupInvite(row, row.invitee?.username ?? "")
    ),
    seriesCount: 0,
  };
}

/* ------------------------------------------------------------------ */
/* Invites + roster counts                                             */
/* ------------------------------------------------------------------ */

export async function listReceivedInvites(
  viewer: AuthUser
): Promise<ReceivedInvite[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("group_invites")
    .select(
      "id, group_id, role, status, invited_by, created_at, groups!inner(id, name, slug, currency, icon_path, created_by, created_at), inviter:profiles!group_invites_invited_by_fkey(username, display_name)"
    )
    .eq("user_id", viewer.id)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (error) fail("listReceivedInvites", error.message);

  const rows = (data ?? []) as unknown as Array<
    GroupInviteRow & { groups: GroupRow }
  >;

  const iconUrls = await signedUrlMap(
    supabase,
    "group-icons",
    rows.map((row) => row.groups.icon_path)
  );

  return rows.map((row) => ({
    invite: mapGroupInvite(row, viewer.username),
    group: mapGroup(
      row.groups,
      row.groups.icon_path ? iconUrls.get(row.groups.icon_path) ?? null : null
    ),
  }));
}

/**
 * How many series each member is assigned to, for one group.
 *
 * A Manager/Owner sees every assignment in the group (`can_view_series`), so
 * the roster can show the real workload instead of a hardcoded zero. Staff
 * cannot manage members, so this is only ever called for a manageable group.
 */
export async function countSeriesAssignments(
  groupId: string
): Promise<Record<string, number>> {
  const supabase = await createClient();

  const { data: seriesRows, error: seriesError } = await supabase
    .from("series")
    .select("id")
    .eq("group_id", groupId);

  if (seriesError) fail("getMembersBundle.series", seriesError.message);

  const seriesIds = ((seriesRows ?? []) as unknown as { id: string }[]).map(
    (row) => row.id
  );
  if (seriesIds.length === 0) return {};

  const assignments = await selectAllPages<{ user_id: string }>(
    async (from, to) => {
      // `series_assignments` has a composite primary key (series_id, user_id)
      // and no `id` column, so the keyset for paging is those two columns.
      const { data, error } = await supabase
        .from("series_assignments")
        .select("user_id")
        .in("series_id", seriesIds)
        .order("series_id", { ascending: true })
        .order("user_id", { ascending: true })
        .range(from, to);

      if (error) fail("getMembersBundle.assignments", error.message);
      return (data ?? []) as unknown as { user_id: string }[];
    }
  );

  return Object.fromEntries(
    Array.from(countByKey(assignments, "user_id"), ([userId, count]) => [
      userId,
      count,
    ])
  );
}

/* ------------------------------------------------------------------ */
/* `/admin/groups`                                                     */
/* ------------------------------------------------------------------ */

export async function listGroupsForAdmin(): Promise<AdminGroupCard[]> {
  const supabase = await createClient();

  const groupsResult = await supabase
    .from("groups")
    .select("id, name, slug, currency, icon_path, created_by, created_at")
    .order("created_at", { ascending: false });

  if (groupsResult.error) fail("listGroupsForAdmin.groups", groupsResult.error.message);

  const groupRows = (groupsResult.data ?? []) as unknown as GroupRow[];

  // Paginated: past 1000 memberships an unpaged select silently drops groups,
  // which showed up as cards with no owner and undercounted members.
  const memberRows = await selectAllPages<GroupMemberRow>(async (from, to) => {
    const { data, error } = await supabase
      .from("group_members")
      .select(
        "id, group_id, user_id, role, invited_by, joined_at, profiles!group_members_user_id_fkey(username, display_name)"
      )
      .order("id", { ascending: true })
      .range(from, to);

    if (error) fail("listGroupsForAdmin.members", error.message);
    return (data ?? []) as unknown as GroupMemberRow[];
  });

  const iconUrls = await signedUrlMap(
    supabase,
    "group-icons",
    groupRows.map((row) => row.icon_path)
  );

  const byGroup = new Map<string, GroupMember[]>();
  for (const row of memberRows) {
    const list = byGroup.get(row.group_id) ?? [];
    list.push(mapGroupMember(row));
    byGroup.set(row.group_id, list);
  }

  // Counts come from a platform-admin RPC: the admin cannot select from
  // `series` (RLS scopes it to the group's own staff), so a direct query would
  // report zero for every group.
  const { data: summaryData, error: summaryError } = await supabase.rpc(
    "admin_group_summaries"
  );

  // Degrade instead of 500 when the migration has not been pushed yet: the
  // grid is still usable and the log names the missing function. Counts read 0
  // until then, which is the pre-fix behaviour, not a new one.
  if (summaryError) {
    console.warn(
      `[groups] admin_group_summaries unavailable, counts read 0: ${summaryError.message}`
    );
  }

  const summaries = new Map(
    (
      (summaryError ? [] : summaryData ?? []) as unknown as {
        group_id: string;
        member_count: number;
        series_count: number;
        chapter_count: number;
      }[]
    ).map((row) => [row.group_id, row])
  );

  return groupRows.map((row) => {
    const members = byGroup.get(row.id) ?? [];
    return {
      group: mapGroup(
        row,
        row.icon_path ? iconUrls.get(row.icon_path) ?? null : null
      ),
      owner: members.find((member) => member.role === "owner") ?? null,
      memberCount: members.length,
      seriesCount: summaries.get(row.id)?.series_count ?? 0,
    };
  });
}

/**
 * Used by the admin create action to refresh the single returned group without
 * refetching the whole list.
 */
export async function getGroupForAdmin(
  groupId: string
): Promise<Group | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("groups")
    .select("id, name, slug, currency, icon_path, created_by, created_at")
    .eq("id", groupId)
    .maybeSingle();

  if (error) fail("getGroupForAdmin", error.message);
  if (!data) return null;

  const row = data as unknown as GroupRow;
  const iconUrl = row.icon_path
    ? (
        await signedUrlMap(supabase, "group-icons", [row.icon_path])
      ).get(row.icon_path) ?? null
    : null;

  return mapGroup(row, iconUrl);
}
