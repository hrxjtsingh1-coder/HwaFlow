import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { GroupDetailView } from "@/components/groups/group-detail-view";
import { getGroupBundle } from "@/lib/server/groups";
import { listSeriesForGroup } from "@/lib/server/series";
import { getViewer } from "@/lib/session";

export const metadata: Metadata = {
  title: "Group",
  description:
    "A HwaFlow group's members, series and earnings, grouped by release day.",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function GroupDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const viewer = await getViewer();
  if (!viewer) redirect("/login");

  const [bundle, seriesList] = await Promise.all([
    getGroupBundle(id, viewer),
    listSeriesForGroup(id, viewer),
  ]);

  return (
    <GroupDetailView
      viewer={viewer}
      bundle={bundle}
      series={seriesList.series}
      assignments={seriesList.assignments}
    />
  );
}
