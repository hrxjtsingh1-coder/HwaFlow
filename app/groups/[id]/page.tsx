import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { cache } from "react";

import { GroupDetailView } from "@/components/groups/group-detail-view";
import {
  groupEarnings,
  memberEarningsInGroup,
} from "@/lib/server/chapters";
import { getGroupBundle } from "@/lib/server/groups";
import { listSeriesForGroup } from "@/lib/server/series";
import { getViewer } from "@/lib/session";

const loadGroup = cache(async (id: string) => {
  const viewer = await getViewer();
  if (!viewer) return null;

  const [bundle, seriesList] = await Promise.all([
    getGroupBundle(id, viewer),
    listSeriesForGroup(id, viewer),
  ]);

  // An Owner sees the whole group's money; everyone else only their own, which
  // is all RLS will return for them anyway. Both totals arrive in the viewer's
  // own display currency.
  const money = !bundle
    ? 0
    : bundle.viewerMember.role === "owner"
      ? await groupEarnings(id, viewer.displayCurrency)
      : await memberEarningsInGroup(id, viewer.id, viewer.displayCurrency);

  return { viewer, bundle, seriesList, money };
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const data = await loadGroup(id);

  if (!data?.bundle) {
    return {
      title: "Group not found",
      description: "This group link is stale, or you're not a member.",
      robots: { index: false, follow: false },
    };
  }

  return {
    title: data.bundle.group.name,
    description: `${data.bundle.group.name} on HwaFlow — members, series, release days and earnings for the group.`,
    robots: { index: false, follow: false },
  };
}

export default async function GroupDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await loadGroup(id);
  if (!data) redirect("/login");

  return (
    <GroupDetailView
      viewer={data.viewer}
      bundle={data.bundle}
      series={data.seriesList.series}
      assignments={data.seriesList.assignments}
      money={data.money}
    />
  );
}
