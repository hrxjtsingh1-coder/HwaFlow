import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { cache } from "react";

import { SeriesView } from "@/components/series/series-view";
import { getRates } from "@/lib/server/fx";
import { getSeriesBundle } from "@/lib/server/series";
import { listChaptersForSeries } from "@/lib/server/chapters";
import { getViewer } from "@/lib/session";

/*
 * Metadata and the page read the same rows. `cache()` keys the call per
 * request, so the title costs nothing extra.
 */
const loadSeries = cache(async (id: string) => {
  const viewer = await getViewer();
  if (!viewer) return null;

  const [bundle, chapters, rates] = await Promise.all([
    getSeriesBundle(id, viewer),
    listChaptersForSeries(id),
    getRates(),
  ]);

  return { viewer, bundle, chapters, rates };
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const data = await loadSeries(id);

  if (!data?.bundle) {
    return {
      title: "Series not found",
      description: "This series link is stale, or you don't have access to it.",
      robots: { index: false, follow: false },
    };
  }

  const { series, group } = data.bundle;
  return {
    title: series.title,
    description: `${series.title} in ${group.name} on HwaFlow — synopsis, release days, assignees and every chapter in one place.`,
    robots: { index: false, follow: false },
  };
}

export default async function SeriesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await loadSeries(id);
  if (!data) redirect("/login");

  return (
    <SeriesView
      viewer={data.viewer}
      bundle={data.bundle}
      chapters={data.chapters}
      rates={data.rates}
    />
  );
}
