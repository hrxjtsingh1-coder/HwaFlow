import type { Metadata } from "next";
import { WorkspaceView } from "@/components/chapters/workspace-view";

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
  return <WorkspaceView chapterId={id} />;
}
