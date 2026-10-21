import type { Metadata } from "next";
import { GroupsView } from "@/components/groups/groups-view";

export const metadata: Metadata = {
  title: "Groups",
  description:
    "Every HwaFlow group you belong to — open one to see its series, members and earnings.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function GroupsPage() {
  return <GroupsView />;
}
