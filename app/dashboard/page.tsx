import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { DashboardHome } from "@/components/dashboard/dashboard-home";
import {
  countApprovedForViewer,
  dashboardWeek,
  earningsForViewer,
} from "@/lib/server/chapters";
import { recentFocusDays } from "@/lib/server/focus";
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

  const [week, earnings, approved, focus] = await Promise.all([
    dashboardWeek(viewer),
    earningsForViewer(viewer),
    countApprovedForViewer(viewer),
    recentFocusDays(viewer),
  ]);

  return (
    <DashboardHome
      viewer={viewer}
      currency={viewer.displayCurrency}
      week={week}
      earnings={earnings}
      approved={approved}
      focus={focus}
      nowIso={new Date().toISOString()}
    />
  );
}
