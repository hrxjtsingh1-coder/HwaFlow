"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { signOut } from "@/lib/auth";
import { useActiveGroupId } from "@/lib/active-group";
import {
  acceptInviteAction,
  declineInviteAction,
} from "@/lib/groups-actions";
import type { Group, GroupMember } from "@/lib/groups";
import type { AuthUser } from "@/lib/identity";
import { DashboardRail } from "../dashboard/dashboard-rail";
import { DashboardTopbar } from "../dashboard/dashboard-topbar";
import { workspaceLinks } from "../dashboard/workspace-nav";
import { Layers } from "../icons";
import { ReceivedInvites, type InviteItem } from "../members/received-invites";
import { GroupCard } from "./group-card";

type Membership = {
  group: Group;
  member: GroupMember;
  memberCount: number;
  seriesCount: number;
};

type GroupsViewProps = {
  viewer: AuthUser;
  memberships: Membership[];
  /** Pending invites for the viewer; these used to live on `/settings/members`. */
  invites: InviteItem[];
  /** Latest joined group; used until this device picks one. */
  defaultActiveId: string | null;
};

export function GroupsView({
  viewer,
  memberships,
  invites,
  defaultActiveId,
}: GroupsViewProps) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [busyInviteId, setBusyInviteId] = useState<string | null>(null);
  const activeId = useActiveGroupId(viewer.username, defaultActiveId);

  const answerInvite = async (
    inviteId: string,
    answer: "accept" | "decline"
  ) => {
    setBusyInviteId(inviteId);
    const result =
      answer === "accept"
        ? await acceptInviteAction(inviteId)
        : await declineInviteAction(inviteId);
    setBusyInviteId(null);

    if (result.ok) router.refresh();
  };

  useEffect(() => {
    if (!menuOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const handleSignOut = () => {
    void signOut();
  };

  return (
    <div className="dash-shell">
      <DashboardRail
        user={viewer}
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        onSignOut={handleSignOut}
        links={workspaceLinks()}
        active="groups"
      />

      <div className="dash-body">
        <DashboardTopbar
          onOpenMenu={() => setMenuOpen(true)}
          trail={[{ label: "Workspace" }, { label: "Groups" }]}
        />

        <main className="dash-main" id="main">
          <div className="dash-content grp-content">
            <section className="grp-hero dash-enter">
              <p className="eyebrow">Workspace</p>
              <h1 className="grp-hero-title">Your groups</h1>
              <p className="grp-hero-sub">
                {memberships.length === 0
                  ? "Groups you join will appear here."
                  : `${memberships.length} group${
                      memberships.length === 1 ? "" : "s"
                    } · choose one to see its series, members and earnings.`}
              </p>
            </section>

            <ReceivedInvites
              items={invites}
              busyId={busyInviteId}
              onAccept={(inviteId) => void answerInvite(inviteId, "accept")}
              onDecline={(inviteId) => void answerInvite(inviteId, "decline")}
            />

            {memberships.length === 0 ? (
              <section className="grp-empty dash-enter" data-delay="70">
                <span className="grp-empty-icon" aria-hidden="true">
                  <Layers className="h-6 w-6" />
                </span>
                <h2 className="grp-empty-title">
                  You&apos;re not in a group yet
                </h2>
                <p className="grp-empty-copy">
                  Ask an Owner to invite your username — pending invites show up
                  right here.
                </p>
                <span className="grp-username-chip">@{viewer.username}</span>
              </section>
            ) : (
              <div className="grp-grid">
                {memberships.map(({ group, member, memberCount, seriesCount }, index) => (
                  <GroupCard
                    key={group.id}
                    group={group}
                    member={member}
                    memberCount={memberCount}
                    seriesCount={seriesCount}
                    active={group.id === activeId}
                    index={index}
                  />
                ))}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
