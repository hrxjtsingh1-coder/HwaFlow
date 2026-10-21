import type { Metadata } from "next";
import { MembersView } from "@/components/members/members-view";

export const metadata: Metadata = {
  title: "Members",
  description:
    "Manage your HwaFlow group: answer invites, invite teammates, change roles, and review the roster.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function MembersPage() {
  return <MembersView />;
}
