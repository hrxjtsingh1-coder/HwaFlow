import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { cache } from "react";

import { GroupDetailAdmin } from "@/components/admin/group-detail-admin";
import { NotFoundState } from "@/components/not-found-state";
import { getGroupDetailForAdmin } from "@/lib/server/admin-groups";
import { getViewer } from "@/lib/session";

const loadDetail = cache(getGroupDetailForAdmin);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const detail = await loadDetail(id);

  return {
    title: detail?.group.name ?? "Group details",
    description: detail
      ? `Platform admin view of ${detail.group.name}: owner, roster and metadata counts.`
      : "Platform admin view of one HwaFlow group: owner, roster and metadata counts.",
    robots: { index: false, follow: false },
  };
}

export default async function AdminGroupPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (!viewer.isPlatformAdmin) redirect("/admin/groups");

  const { id } = await params;
  const detail = await loadDetail(id);

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
