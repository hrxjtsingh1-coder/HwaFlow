"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { signOut } from "@/lib/auth";
import {
  getActiveGroupFor,
  listGroupsForUser,
} from "@/lib/groups";
import {
  countSeriesForMember,
  countSeriesInGroup,
} from "@/lib/series";
import { useAuthSession } from "@/lib/use-auth-session";
import { useGroups } from "@/lib/use-groups";
import { useSeries } from "@/lib/use-series";
import { DashboardRail } from "../dashboard/dashboard-rail";
import { DashboardTopbar } from "../dashboard/dashboard-topbar";
import { workspaceLinks } from "../dashboard/workspace-nav";
import { ArrowRight, Layers } from "../icons";
import { Logo } from "../logo";
import { GroupCard } from "./group-card";

function GroupsLoading() {
  return (
    <div className="dash-loading">
      <div className="dash-loading-inner">
        <Logo href="/" />
        <div className="dash-loading-card" role="status" aria-live="polite">
          <span className="dash-spinner" aria-hidden="true" />
          <p>Opening your groups…</p>
        </div>
      </div>
    </div>
  );
}

export function GroupsView() {
  const router = useRouter();
  const { user, ready: authReady } = useAuthSession();
  const { state, ready: groupsReady } = useGroups();
  const { ready: seriesReady } = useSeries();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (authReady && !user) router.replace("/login");
  }, [authReady, user, router]);

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

  if (!authReady || !groupsReady || !seriesReady || !state || !user) {
    return <GroupsLoading />;
  }

  const memberships = listGroupsForUser(user.username);
  const activeId = getActiveGroupFor(user.username)?.group.id ?? null;

  const handleSignOut = () => {
    signOut();
    router.replace("/login");
  };

  return (
    <div className="dash-shell">
      <DashboardRail
        user={user}
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
                <span className="grp-username-chip">@{user.username}</span>
                <Link href="/settings/members" className="btn btn-primary btn-sm">
                  Go to member settings
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </section>
            ) : (
              <div className="grp-grid">
                {memberships.map(({ group, member }, index) => {
                  const memberCount = state.members.filter(
                    (entry) => entry.groupId === group.id
                  ).length;
                  const seriesCount =
                    member.role === "staff"
                      ? countSeriesForMember(group.id, user.username)
                      : countSeriesInGroup(group.id);

                  return (
                    <GroupCard
                      key={group.id}
                      group={group}
                      member={member}
                      memberCount={memberCount}
                      seriesCount={seriesCount}
                      active={group.id === activeId}
                      index={index}
                    />
                  );
                })}
              </div>
            )}

            <footer className="grp-footer">
              <span>
                Preview build — groups, series and assignments stay in this
                browser.
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
