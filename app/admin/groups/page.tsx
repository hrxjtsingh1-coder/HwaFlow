import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { GroupsView } from "@/components/admin/groups-view";
import { listGroupsForAdmin } from "@/lib/server/groups";
import { getViewer } from "@/lib/session";

export const metadata: Metadata = {
  title: "Group directory",
  description:
    "Platform admin console for HwaFlow groups: create a group, assign its Owner, and review metadata.",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function AdminGroupsPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (!viewer.isPlatformAdmin) redirect("/dashboard");

  const cards = await listGroupsForAdmin();

  return <GroupsView cards={cards} />;
}
