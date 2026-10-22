import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { MembersView } from "@/components/members/members-view";
import { getMembersBundle } from "@/lib/server/groups";
import { getViewer } from "@/lib/session";

export const metadata: Metadata = {
  title: "Members",
  description:
    "Manage your HwaFlow group: answer invites, invite teammates, change roles, and review the roster.",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function MembersPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");

  const bundle = await getMembersBundle(viewer);

  return <MembersView viewer={viewer} bundle={bundle} />;
}
