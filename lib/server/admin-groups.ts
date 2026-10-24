/**
 * `/admin/groups/[id]` read path.
 *
 * The platform admin may see that a group exists, who is in it and how much
 * content it holds — never a series title, a chapter title or a panel. RLS
 * already scopes `series` and `chapters` to the group's own staff, so the
 * counts come from `admin_group_summary()` instead of a select that would
 * quietly return zero.
 */

import "server-only";

import type { Group, GroupMember } from "../groups";
import { getViewer } from "../session";
import { createClient } from "../supabase/server";
import {
  mapGroup,
  mapGroupMember,
  type GroupMemberRow,
  type GroupRow,
} from "./groups";
import { selectAllPages } from "./pagination";
import { signedUrlMap } from "./storage";

export type AdminGroupDetail = {
  group: Group;
  members: GroupMember[];
  owner: GroupMember | null;
  memberCount: number;
  managerCount: number;
  seriesCount: number;
  chapterCount: number;
};

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `null` for a non-admin viewer, a malformed id, or a group that is gone. */
export async function getGroupDetailForAdmin(
  groupId: string
): Promise<AdminGroupDetail | null> {
  const viewer = await getViewer();
  if (!viewer?.isPlatformAdmin) return null;
  if (!UUID.test(groupId)) return null;

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("groups")
    .select("id, name, slug, currency, icon_path, created_by, created_at")
    .eq("id", groupId)
    .maybeSingle();

  if (error) throw new Error(`[admin-groups:group] ${error.message}`);
  if (!data) return null;

  const row = data as unknown as GroupRow;

  const memberRows = await selectAllPages<GroupMemberRow>(async (from, to) => {
    const { data: page, error: memberError } = await supabase
      .from("group_members")
      .select(
        "id, group_id, user_id, role, invited_by, joined_at, profiles!group_members_user_id_fkey(username, display_name)"
      )
      .eq("group_id", groupId)
      .order("id", { ascending: true })
      .range(from, to);

    if (memberError) {
      throw new Error(`[admin-groups:members] ${memberError.message}`);
    }
    return (page ?? []) as unknown as GroupMemberRow[];
  });

  const { data: summaryData, error: summaryError } = await supabase.rpc(
    "admin_group_summary",
    { p_group_id: groupId }
  );

  if (summaryError) {
    throw new Error(`[admin-groups:summary] ${summaryError.message}`);
  }

  const summary = (
    (summaryData ?? []) as unknown as {
      member_count: number;
      series_count: number;
      chapter_count: number;
    }[]
  )[0];

  const iconUrl = row.icon_path
    ? (await signedUrlMap(supabase, "group-icons", [row.icon_path])).get(
        row.icon_path
      ) ?? null
    : null;

  const members = memberRows.map(mapGroupMember);

  return {
    group: mapGroup(row, iconUrl),
    members,
    owner: members.find((member) => member.role === "owner") ?? null,
    // The RPC is authoritative (it counts rows RLS would hide); the local list
    // is the fallback if an older database has not applied the migration yet.
    memberCount: summary?.member_count ?? members.length,
    managerCount: members.filter((member) => member.role === "manager").length,
    seriesCount: summary?.series_count ?? 0,
    chapterCount: summary?.chapter_count ?? 0,
  };
}
