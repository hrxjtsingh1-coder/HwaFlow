import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { GroupsView } from "@/components/groups/groups-view";
import { listGroupsForViewer } from "@/lib/server/groups";
import { getViewer } from "@/lib/session";

export const metadata: Metadata = {
  title: "Groups",
  description:
    "Every HwaFlow group you belong to — open one to see its series, members and earnings.",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function GroupsPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");

  const memberships = await listGroupsForViewer(viewer);

  // Device-local preference wins on the client; this is only the fallback for
  // a browser that has never chosen a group.
  const defaultActiveId =
    [...memberships].sort((a, b) =>
      b.member.joinedAt.localeCompare(a.member.joinedAt)
    )[0]?.group.id ?? null;

  return (
    <GroupsView
      viewer={viewer}
      memberships={memberships}
      defaultActiveId={defaultActiveId}
    />
  );
}
