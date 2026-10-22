"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { signOut } from "@/lib/auth";
import { useActiveGroupId } from "@/lib/active-group";
import { formatMoney } from "@/lib/format";
import type {
  Group,
  GroupInvite,
  GroupMember,
} from "@/lib/groups";
import type { AuthUser } from "@/lib/identity";
import {
  RELEASE_DAY_LABELS,
  canManageSeries,
  type ReleaseDay,
  type Series,
  type SeriesAssignment,
} from "@/lib/series";
import { DashboardRail } from "../dashboard/dashboard-rail";
import { DashboardTopbar } from "../dashboard/dashboard-topbar";
import { workspaceLinks } from "../dashboard/workspace-nav";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  Coins,
  Layers,
  Plus,
  Users,
  X,
} from "../icons";
import { GroupAvatar } from "../group-avatar";
import { RoleBadge } from "../role-badge";
import { CreateSeriesDialog } from "./create-series-dialog";
import { DayLane } from "./day-lane";
import type { SeriesAssignee } from "./series-tile";

type Notice = { tone: "success" | "error"; text: string };

/**
 * The page passes the bundle straight from the server. `null` means RLS found
 * no group for this viewer; "not found" and "no access" are intentionally the
 * same answer.
 */
type GroupDetailBundle = {
  group: Group;
  viewerMember: GroupMember;
  members: GroupMember[];
  invites: GroupInvite[];
  seriesCount: number;
};

type GroupDetailViewProps = {
  viewer: AuthUser;
  bundle: GroupDetailBundle | null;
  /** Non-archived series this viewer can read, already filtered by RLS. */
  series: Series[];
  assignments: SeriesAssignment[];
};

export function GroupDetailView({
  viewer,
  bundle,
  series,
  assignments,
}: GroupDetailViewProps) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const noticeTimer = useRef<number | null>(null);
  const activeId = useActiveGroupId(viewer.username);

  const notify = (tone: Notice["tone"], text: string) => {
    setNotice({ tone, text });
    if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(null), 4800);
  };

  useEffect(() => {
    return () => {
      if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
    };
  }, []);

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

  if (!bundle) {
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
              <section className="grp-notfound dash-enter">
                <p className="eyebrow">Groups</p>
                <h1 className="grp-notfound-title">Group not found</h1>
                <p className="grp-notfound-copy">
                  You may not have access, or this group was removed.
                </p>
                <Link href="/groups" className="btn btn-ghost btn-sm">
                  <ArrowLeft className="h-4 w-4" />
                  Back to your groups
                </Link>
              </section>
            </div>
          </main>
        </div>
      </div>
    );
  }

  const { group, viewerMember, members } = bundle;
  const viewerRole = viewerMember.role;
  const canManage = canManageSeries(viewerRole);
  const active = activeId === group.id;

  const visibleSeries = series;

  // Earnings need approved chapters; they arrive in Phase 3.
  const money = 0;
  const moneyNote =
    viewerRole === "owner"
      ? "Group total this month"
      : "Your approved work in this group";

  const memberByUsername = new Map(
    members.map((member) => [member.username, member])
  );
  const assigneesBySeries: Record<string, SeriesAssignee[]> = {};
  for (const assignment of assignments) {
    const member = memberByUsername.get(assignment.username);
    if (!member) continue;
    if (!assigneesBySeries[assignment.seriesId]) {
      assigneesBySeries[assignment.seriesId] = [];
    }
    assigneesBySeries[assignment.seriesId].push({
      username: member.username,
      displayName: member.displayName,
    });
  }

  const byDay = (day: number) =>
    visibleSeries.filter((entry) => entry.releaseDays.includes(day as ReleaseDay));

  const handleCreated = (created: Series) => {
    setCreateOpen(false);
    notify("success", `${created.title} was created.`);
    router.refresh();
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
          trail={[
            { label: "Workspace", href: "/groups" },
            { label: "Groups", href: "/groups" },
            { label: group.name },
          ]}
        />

        <main className="dash-main" id="main">
          <div className="dash-content grp-content">
            {notice ? (
              <div
                className="grp-notice"
                data-tone={notice.tone}
                role="status"
                aria-live="polite"
              >
                <span className="grp-notice-icon" aria-hidden="true">
                  {notice.tone === "success" ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : (
                    <AlertCircle className="h-3.5 w-3.5" />
                  )}
                </span>
                <span className="grp-notice-text">{notice.text}</span>
                <button
                  type="button"
                  className="grp-notice-close"
                  onClick={() => setNotice(null)}
                  aria-label="Dismiss message"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : null}

            <Link href="/groups" className="grp-back-link">
              <ArrowLeft className="h-3.5 w-3.5" />
              All groups
            </Link>

            <section className="grp-group-head dash-enter">
              <GroupAvatar
                name={group.name}
                iconDataUrl={group.iconDataUrl}
                size="lg"
              />
              <div className="grp-group-heading">
                <p className="eyebrow">Group</p>
                <h1 className="grp-group-title">{group.name}</h1>
                <div className="grp-group-meta">
                  <RoleBadge role={viewerRole} />
                  <span className="chip chip-accent">{group.currency}</span>
                  <span className="grp-group-slug">@{group.slug}</span>
                  {active ? (
                    <span className="chip chip-mint">Active group</span>
                  ) : null}
                </div>
              </div>
            </section>

            <div className="grp-stats dash-enter" data-delay="55">
              <article className="grp-stat">
                <span className="grp-stat-label">
                  <Users className="h-3.5 w-3.5" />
                  Members
                </span>
                <p className="grp-stat-value">{members.length}</p>
                <span className="grp-stat-note">Everyone in the group</span>
              </article>

              <article className="grp-stat">
                <span className="grp-stat-label">
                  <Layers className="h-3.5 w-3.5" />
                  Series
                </span>
                <p className="grp-stat-value">{visibleSeries.length}</p>
                <span className="grp-stat-note">
                  {viewerRole === "staff"
                    ? "Assigned to you"
                    : "In this group"}
                </span>
              </article>

              <article className="grp-stat">
                <span className="grp-stat-label">
                  <Coins className="h-3.5 w-3.5" />
                  Money earned
                </span>
                <p className="grp-stat-value">
                  {formatMoney(money, group.currency)}
                </p>
                <span className="grp-stat-note">
                  {moneyNote} · no approved chapters yet
                </span>
              </article>
            </div>

            <div className="grp-section-head dash-enter" data-delay="100">
              <div>
                <p className="eyebrow">Library</p>
                <h2 className="grp-section-title">Series</h2>
              </div>
              <div className="grp-section-actions">
                <span className="chip">{visibleSeries.length} series</span>
                {canManage ? (
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => setCreateOpen(true)}
                  >
                    <Plus className="h-4 w-4" />
                    New series
                  </button>
                ) : null}
              </div>
            </div>

            {visibleSeries.length === 0 ? (
              <section
                className="grp-empty grp-empty--series dash-enter"
                data-delay="140"
              >
                <span className="grp-empty-icon" aria-hidden="true">
                  <Layers className="h-6 w-6" />
                </span>
                <h2 className="grp-empty-title">
                  {viewerRole === "staff"
                    ? "No series assigned to you yet"
                    : "No series yet"}
                </h2>
                <p className="grp-empty-copy">
                  {viewerRole === "staff"
                    ? "A Manager or Owner assigns series. Once you're assigned, it appears here under its release day."
                    : "Create the first series and it will appear under its release day for everyone who can see it."}
                </p>
                {canManage ? (
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => setCreateOpen(true)}
                  >
                    <Plus className="h-4 w-4" />
                    Create the first series
                  </button>
                ) : null}
              </section>
            ) : null}

            <div className="grp-days">
              {RELEASE_DAY_LABELS.map((label, index) => (
                <DayLane
                  key={label}
                  day={index as ReleaseDay}
                  series={byDay(index)}
                  viewerRole={viewerRole}
                  viewerUsername={viewer.username}
                  assigneesBySeries={assigneesBySeries}
                />
              ))}
            </div>

            <footer className="grp-footer">
              <span>Group and member data syncs with your team.</span>
              <Link href="/dashboard" className="dash-link">
                Back to dashboard
                <ArrowRight className="h-3 w-3" />
              </Link>
            </footer>
          </div>
        </main>
      </div>

      {createOpen ? (
        <CreateSeriesDialog
          group={group}
          members={members}
          onClose={() => setCreateOpen(false)}
          onCreated={handleCreated}
        />
      ) : null}
    </div>
  );
}
