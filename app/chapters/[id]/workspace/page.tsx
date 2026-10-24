import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { cache } from "react";

import { WorkspaceView } from "@/components/chapters/workspace-view";
import { getWorkspaceBundle } from "@/lib/server/chapters";
import { getViewer } from "@/lib/session";

const loadWorkspace = cache(async (id: string) => {
  const viewer = await getViewer();
  if (!viewer) return null;
  return { viewer, bundle: await getWorkspaceBundle(id, viewer) };
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const data = await loadWorkspace(id);
  const chapter = data?.bundle?.chapter;

  if (!data?.bundle || !chapter) {
    return {
      title: "Chapter not found",
      description: "This chapter link is stale, or you don't have access to it.",
      robots: { index: false, follow: false },
    };
  }

  const label = chapter.title
    ? `Chapter ${chapter.number} — ${chapter.title}`
    : `Chapter ${chapter.number}`;

  return {
    title: label,
    description: `Translate ${label} of ${data.bundle.series.title}: raw panels, English text and the group glossary side by side.`,
    robots: { index: false, follow: false },
  };
}

export default async function ChapterWorkspacePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await loadWorkspace(id);
  if (!data) redirect("/login");

  return <WorkspaceView viewer={data.viewer} bundle={data.bundle} />;
}
