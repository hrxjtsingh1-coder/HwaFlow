"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { signOut } from "@/lib/auth";
import { useActiveGroupId } from "@/lib/active-group";
import type { Group, GroupMember } from "@/lib/groups";
import type { AuthUser } from "@/lib/identity";
import { DashboardRail } from "../dashboard/dashboard-rail";
import { DashboardTopbar } from "../dashboard/dashboard-topbar";
import { workspaceLinks } from "../dashboard/workspace-nav";
import { ArrowRight, Layers } from "../icons";
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
  /** Latest joined group; used until this device picks one. */
  defaultActiveId: string | null;
};

export function GroupsView({
  viewer,
  memberships,
  defaultActiveId,
}: GroupsViewProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const activeId = useActiveGroupId(viewer.username, defaultActiveId);

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

            {memberships.length === 0 ? (
              <section className="grp-empty dash-enter" data-delay="70">
                <span className="grp-empty-icon" aria-hidden="true">
                  <Layers className="h-6 w-6" />
                </span>
                <h2 className="grp-empty-title">
                  You&apos;re not in a group yet
                </h2>
                <p className="grp-empty-copy">
                  Ask an Owner to invite your username, or accept a pending
                  invite. Invites live on the member settings page.
                </p>
                <span className="grp-username-chip">@{viewer.username}</span>
                <Link href="/settings/members" className="btn btn-primary btn-sm">
                  Go to member settings
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
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

            <footer className="grp-footer">
              <span>
                Groups and members sync with your team — changes appear after a
                refresh.
              </span>
              <Link href="/dashboard" className="dash-link">
                Back to dashboard
                <ArrowRight className="h-3 w-3" />
              </Link>
            </footer>
          </div>
        </main>
      </div>
    </div>
  );
}
