import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { WorkspaceView } from "@/components/chapters/workspace-view";
import { getWorkspaceBundle } from "@/lib/server/chapters";
import { getViewer } from "@/lib/session";

export const metadata: Metadata = {
  title: "Chapter workspace",
  description:
    "Translate a HwaFlow chapter: raw panels on the right, translated text in the middle, chapters and glossary on the left.",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function ChapterWorkspacePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const viewer = await getViewer();
  if (!viewer) redirect("/login");

  const bundle = await getWorkspaceBundle(id, viewer);

  return <WorkspaceView viewer={viewer} bundle={bundle} />;
}
