import type { Metadata } from "next";
import { SeriesView } from "@/components/series/series-view";

export const metadata: Metadata = {
  title: "Series",
  description:
    "A HwaFlow series: cover, release day, description, assignees and chapters.",
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
  return <SeriesView seriesId={id} />;
}
