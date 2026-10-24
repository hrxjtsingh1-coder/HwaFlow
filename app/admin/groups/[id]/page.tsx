import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { GroupDetailAdmin } from "@/components/admin/group-detail-admin";
import { NotFoundState } from "@/components/not-found-state";
import { getGroupDetailForAdmin } from "@/lib/server/admin-groups";
import { getViewer } from "@/lib/session";

export const metadata: Metadata = {
  title: "Group details",
  description:
    "Platform admin view of one HwaFlow group: owner, roster and metadata counts.",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function AdminGroupPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (!viewer.isPlatformAdmin) redirect("/admin/groups");

  const { id } = await params;
  const detail = await getGroupDetailForAdmin(id);

  // ARCHITECTURE §9: in-app missing states stay at HTTP 200, so this is a
  // rendered state rather than `notFound()`.
  if (!detail) {
    return (
      <div className="admin-page">
        <NotFoundState
          title="Group not found"
          copy="This link may be stale, or the group no longer exists."
          href="/admin/groups"
          action="Back to groups"
          secondaryHref="/admin"
          secondaryAction="Admin home"
        />
      </div>
    );
  }

  return <GroupDetailAdmin detail={detail} />;
}
