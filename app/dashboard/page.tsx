import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { DashboardHome } from "@/components/dashboard/dashboard-home";
import {
  countApprovedForViewer,
  dashboardWeek,
  earningsForViewer,
} from "@/lib/server/chapters";
import { listGroupsForViewer } from "@/lib/server/groups";
import { getViewer } from "@/lib/session";

export const metadata: Metadata = {
  title: "Overview",
  description:
    "Your HwaFlow workspace — review chapters, follow the translation pipeline, keep names consistent, and see what your group has shipped.",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function DashboardPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");

  const [memberships, week, earnings, approved] = await Promise.all([
    listGroupsForViewer(viewer),
    dashboardWeek(viewer),
    earningsForViewer(viewer),
    countApprovedForViewer(viewer),
  ]);

  const newest = [...memberships].sort((a, b) =>
    b.member.joinedAt.localeCompare(a.member.joinedAt)
  )[0];

  return (
    <DashboardHome
      viewer={viewer}
      currency={newest?.group.currency ?? "USD"}
      week={week}
      earnings={earnings}
      approved={approved}
      nowIso={new Date().toISOString()}
    />
  );
}
