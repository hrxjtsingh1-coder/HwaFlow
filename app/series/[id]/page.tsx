import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { SeriesView } from "@/components/series/series-view";
import { getSeriesBundle } from "@/lib/server/series";
import { listChaptersForSeries } from "@/lib/server/chapters";
import { getViewer } from "@/lib/session";

export const metadata: Metadata = {
  title: "Series",
  description:
    "A HwaFlow series: cover, release days, description, assignees and chapters.",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function SeriesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const viewer = await getViewer();
  if (!viewer) redirect("/login");

  const [bundle, chapters] = await Promise.all([
    getSeriesBundle(id, viewer),
    listChaptersForSeries(id),
  ]);

  return <SeriesView viewer={viewer} bundle={bundle} chapters={chapters} />;
}
