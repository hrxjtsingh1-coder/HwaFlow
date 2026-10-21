"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { signOut } from "@/lib/auth";
import {
  groupEarningsThisMonth,
  memberEarningsThisMonth,
} from "@/lib/earnings";
import { formatMoney } from "@/lib/format";
import {
  getActiveGroupFor,
  getMembers,
  type GroupMember,
} from "@/lib/groups";
import {
  RELEASE_DAY_LABELS,
  canManageSeries,
  countSeriesForMember,
  countSeriesInGroup,
  listSeriesForGroup,
  listSeriesForViewer,
  type ReleaseDay,
  type Series,
} from "@/lib/series";
import { useAuthSession } from "@/lib/use-auth-session";
import { useGroups } from "@/lib/use-groups";
import { useSeries } from "@/lib/use-series";
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
import { Logo } from "../logo";
import { RoleBadge } from "../role-badge";
import { CreateSeriesDialog } from "./create-series-dialog";
import { DayLane } from "./day-lane";

type Notice = { tone: "success" | "error"; text: string };

function DetailLoading() {
  return (
    <div className="dash-loading">
      <div className="dash-loading-inner">
        <Logo href="/" />
        <div className="dash-loading-card" role="status" aria-live="polite">
          <span className="dash-spinner" aria-hidden="true" />
          <p>Opening the group…</p>
        </div>
      </div>
    </div>
  );
}

export function GroupDetailView({ groupId }: { groupId: string }) {
  const router = useRouter();
  const { user, ready: authReady } = useAuthSession();
  const { state, ready: groupsReady } = useGroups();
  const { state: seriesState, ready: seriesReady } = useSeries();

  const [menuOpen, setMenuOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const noticeTimer = useRef<number | null>(null);

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

  if (
    !authReady ||
    !groupsReady ||
    !seriesReady ||
    !state ||
    !seriesState ||
    !user
  ) {
    return <DetailLoading />;
  }

  const group = state.groups.find((entry) => entry.id === groupId);
  const viewerMember: GroupMember | undefined = state.members.find(
    (entry) => entry.groupId === groupId && entry.username === user.username
  );

  if (!group || !viewerMember) {
    return (
      <div className="dash-shell">
        <DashboardRail
          user={user}
          open={menuOpen}
          onClose={() => setMenuOpen(false)}
          onSignOut={() => {
            signOut();
            router.replace("/login");
          }}
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
                  You may not have access, or this group was removed from this
                  browser.
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

  const members = getMembers(group.id);
  const viewerRole = viewerMember.role;
  const canManage = canManageSeries(viewerRole);
  const active = getActiveGroupFor(user.username)?.group.id === group.id;

  const visibleSeries =
    viewerRole === "staff"
      ? listSeriesForViewer(group.id, user.username)
      : listSeriesForGroup(group.id);
  const seriesCount =
    viewerRole === "staff"
      ? countSeriesForMember(group.id, user.username)
      : countSeriesInGroup(group.id);

  const money =
    viewerRole === "owner"
      ? groupEarningsThisMonth(group.id)
      : memberEarningsThisMonth(group.id, user.username);
  const moneyNote =
    viewerRole === "owner"
      ? "Group total this month"
      : "Your approved work in this group";

  const assigneesBySeries: Record<string, string[]> = {};
  for (const assignment of seriesState.assignments) {
    if (assignment.groupId !== group.id) continue;
    if (!assigneesBySeries[assignment.seriesId]) {
      assigneesBySeries[assignment.seriesId] = [];
    }
    assigneesBySeries[assignment.seriesId].push(assignment.username);
  }

  const byDay = (day: number) =>
    visibleSeries.filter((entry) => entry.releaseDay === day);

  const handleCreated = (series: Series) => {
    setCreateOpen(false);
    notify("success", `${series.title} was created.`);
  };

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
                <p className="grp-stat-value">{seriesCount}</p>
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
                <span className="chip">
                  {seriesCount} series
                </span>
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
              <section className="grp-empty grp-empty--series dash-enter" data-delay="140">
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
                  viewerUsername={user.username}
                  assigneesBySeries={assigneesBySeries}
                />
              ))}
            </div>

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

      {createOpen ? (
        <CreateSeriesDialog
          group={group}
          members={members}
          actor={user.username}
          onClose={() => setCreateOpen(false)}
          onCreated={handleCreated}
        />
      ) : null}
    </div>
  );
}
