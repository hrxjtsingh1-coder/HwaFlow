import type { Metadata } from "next";
import { GroupsView } from "@/components/admin/groups-view";

export const metadata: Metadata = {
  title: "Groups",
  description:
    "Platform admin console for HwaFlow groups: create a group, assign its Owner, and review metadata.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function AdminGroupsPage() {
  return <GroupsView />;
}
