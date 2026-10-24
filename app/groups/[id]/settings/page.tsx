import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";

import { GroupSettingsView } from "@/components/groups/group-settings-view";
import { getRates } from "@/lib/server/fx";
import { countSeriesAssignments, getGroupBundle } from "@/lib/server/groups";
import { getViewer } from "@/lib/session";

/*
 * Metadata and the page read the same rows; `cache()` keeps the title free and
 * the roster is already in the bundle.
 */
const loadSettings = cache(async (id: string) => {
  const viewer = await getViewer();
  if (!viewer) return null;

  const [bundle, seriesCounts, rates] = await Promise.all([
    getGroupBundle(id, viewer),
    countSeriesAssignments(id),
    getRates(),
  ]);

  return { viewer, bundle, seriesCounts, rates };
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const data = await loadSettings(id);

  if (!data?.bundle) {
    return {
      title: "Group not found",
      description: "This group link is stale, or you're not a member.",
      robots: { index: false, follow: false },
    };
  }

  return {
    title: `${data.bundle.group.name} settings`,
    description: `Members, invites and pricing currency for ${data.bundle.group.name} on HwaFlow.`,
    robots: { index: false, follow: false },
  };
}

export default async function GroupSettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab } = await searchParams;

  const data = await loadSettings(id);
  if (!data) redirect("/login");
  if (!data.bundle) notFound();

  return (
    <GroupSettingsView
      viewer={data.viewer}
      bundle={data.bundle}
      seriesCounts={data.seriesCounts}
      rates={data.rates}
      initialTab={tab === "general" ? "general" : "members"}
    />
  );
}
