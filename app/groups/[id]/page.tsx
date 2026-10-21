import type { Metadata } from "next";
import { GroupDetailView } from "@/components/groups/group-detail-view";

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
  return <GroupDetailView groupId={id} />;
}
