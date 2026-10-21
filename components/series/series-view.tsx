"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { findAccount, getInitials, signOut } from "@/lib/auth";
import { formatShortDate } from "@/lib/format";
import { getMembers, type GroupMember } from "@/lib/groups";
import {
  RELEASE_DAY_LABELS,
  canManageSeries,
  type Series,
  type SeriesAssignment,
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
  BookOpen,
  CalendarDays,
  Check,
  Settings,
  Users,
  X,
} from "../icons";
import { Logo } from "../logo";
import { RoleBadge } from "../role-badge";
import { ManageAssignmentsDialog } from "../groups/manage-assignments-dialog";
import { SeriesCover } from "../groups/series-cover";

type Notice = { tone: "success" | "error"; text: string };

function SeriesLoading() {
  return (
    <div className="dash-loading">
      <div className="dash-loading-inner">
        <Logo href="/" />
        <div className="dash-loading-card" role="status" aria-live="polite">
          <span className="dash-spinner" aria-hidden="true" />
          <p>Opening the series…</p>
        </div>
      </div>
    </div>
  );
}

function SeriesNotFound({ accessDenied = false }: { accessDenied?: boolean }) {
  return (
    <section className="sr-notfound dash-enter">
      <p className="eyebrow">Series</p>
      <h1 className="sr-notfound-title">
        {accessDenied ? "No access to this series" : "Series not found"}
      </h1>
      <p className="sr-notfound-copy">
        {accessDenied
          ? "You don't have access to this series. Ask a Manager or Owner to assign you."
          : "This link may be stale, it was removed from this browser, or you don't have access to it."}
      </p>
      <Link href="/groups" className="btn btn-ghost btn-sm">
        <ArrowLeft className="h-4 w-4" />
        Back to your groups
      </Link>
    </section>
  );
}

type AssigneeRow = {
  assignment: SeriesAssignment;
  member: GroupMember;
};

export function SeriesView({ seriesId }: { seriesId: string }) {
  const router = useRouter();
  const { user, ready: authReady } = useAuthSession();
  const { state: groupsState, ready: groupsReady } = useGroups();
  const { state: seriesState, ready: seriesReady } = useSeries();

  const [menuOpen, setMenuOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
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
    !groupsState ||
    !seriesState ||
    !user
  ) {
    return <SeriesLoading />;
  }

  const series: Series | undefined = seriesState.series.find(
    (entry) => entry.id === seriesId && !entry.archived
  );
  const group = series
    ? groupsState.groups.find((entry) => entry.id === series.groupId)
    : undefined;
  const viewerMember: GroupMember | undefined =
    series && group
      ? groupsState.members.find(
          (entry) =>
            entry.groupId === group.id && entry.username === user.username
        )
      : undefined;

  const assignedToViewer =
    series && viewerMember
      ? seriesState.assignments.some(
          (entry) =>
            entry.seriesId === series.id &&
            entry.username === user.username
        )
      : false;

  const allowed =
    Boolean(series && group && viewerMember) &&
    (viewerMember?.role !== "staff" || assignedToViewer);

  if (!series || !group || !viewerMember || !allowed) {
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
            trail={[{ label: "Workspace" }, { label: "Series" }]}
          />
          <main className="dash-main" id="main">
            <div className="dash-content sr-content">
              <SeriesNotFound
                accessDenied={
                  Boolean(series && group && viewerMember) &&
                  viewerMember?.role === "staff" &&
                  !assignedToViewer
                }
              />
            </div>
          </main>
        </div>
      </div>
    );
  }

  const members = getMembers(group.id);
  const memberByUsername = new Map(
    members.map((member) => [member.username, member])
  );

  const assignees: AssigneeRow[] = seriesState.assignments
    .filter((entry) => entry.seriesId === series.id)
    .map((assignment) => {
      const member = memberByUsername.get(assignment.username);
      return member ? { assignment, member } : null;
    })
    .filter((entry): entry is AssigneeRow => entry !== null)
    .sort((a, b) =>
      a.member.displayName.localeCompare(b.member.displayName)
    );

  const canManage = canManageSeries(viewerMember.role);
  const createdBy =
    findAccount(series.createdBy)?.displayName ?? `@${series.createdBy}`;

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
            { label: group.name, href: `/groups/${group.id}` },
            { label: series.title },
          ]}
        />

        <main className="dash-main" id="main">
          <div className="dash-content sr-content">
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

            <Link href={`/groups/${group.id}`} className="grp-back-link">
              <ArrowLeft className="h-3.5 w-3.5" />
              {group.name}
            </Link>

            <section className="sr-hero dash-enter">
              <div className="sr-hero-cover">
                <SeriesCover
                  title={series.title}
                  coverDataUrl={series.coverDataUrl}
                  size="lg"
                />
              </div>

              <div className="sr-hero-copy">
                <p className="eyebrow">Series</p>
                <h1 className="sr-title">{series.title}</h1>

                <div className="sr-meta">
                  <span className="chip chip-accent">
                    <CalendarDays className="h-3 w-3" />
                    {RELEASE_DAY_LABELS[series.releaseDay]}
                  </span>
                  {series.genre ? (
                    <span className="chip">{series.genre}</span>
                  ) : null}
                  <Link
                    href={`/groups/${group.id}`}
                    className="chip chip-mint"
                  >
                    <Users className="h-3 w-3" />
                    {group.name}
                  </Link>
                </div>

                <p className="sr-hero-note">
                  Created {formatShortDate(series.createdAt)} by {createdBy}
                </p>
              </div>
            </section>

            <div className="sr-grid">
              <div className="sr-main">
                <section className="sr-panel dash-enter" data-delay="55">
                  <div className="sr-panel-head">
                    <div>
                      <p className="eyebrow">About</p>
                      <h2 className="sr-panel-title">Description</h2>
                    </div>
                  </div>
                  {series.description ? (
                    <p className="sr-description">{series.description}</p>
                  ) : (
                    <p className="sr-description sr-description--empty">
                      No description yet. The team can use the title, genre and
                      release day for now.
                    </p>
                  )}
                </section>

                <section className="sr-panel dash-enter" data-delay="100">
                  <div className="sr-panel-head">
                    <div>
                      <p className="eyebrow">Production</p>
                      <h2 className="sr-panel-title">Chapters</h2>
                    </div>
                    <span className="chip">Coming soon</span>
                  </div>

                  <div className="sr-chapters-empty">
                    <span className="sr-chapters-icon" aria-hidden="true">
                      <BookOpen className="h-5 w-5" />
                    </span>
                    <div>
                      <p className="sr-chapters-title">No chapters yet</p>
                      <p className="sr-chapters-copy">
                        Chapters arrive with the production milestone. Approved
                        chapters will feed earnings and the dashboard calendar
                        from here.
                      </p>
                    </div>
                  </div>
                </section>
              </div>

              <aside className="sr-side">
                <section className="sr-panel dash-enter" data-delay="80">
                  <div className="sr-panel-head">
                    <div>
                      <p className="eyebrow">Details</p>
                      <h2 className="sr-panel-title">At a glance</h2>
                    </div>
                  </div>

                  <dl className="sr-facts">
                    <div>
                      <dt>Group</dt>
                      <dd>
                        <Link href={`/groups/${group.id}`} className="sr-fact-link">
                          {group.name}
                        </Link>
                      </dd>
                    </div>
                    <div>
                      <dt>Release day</dt>
                      <dd>{RELEASE_DAY_LABELS[series.releaseDay]}</dd>
                    </div>
                    <div>
                      <dt>Genre</dt>
                      <dd>{series.genre ?? "Not set"}</dd>
                    </div>
                    <div>
                      <dt>Currency</dt>
                      <dd>{group.currency}</dd>
                    </div>
                    <div>
                      <dt>Created</dt>
                      <dd>{formatShortDate(series.createdAt)}</dd>
                    </div>
                  </dl>
                </section>

                <section className="sr-panel dash-enter" data-delay="125">
                  <div className="sr-panel-head">
                    <div>
                      <p className="eyebrow">Team</p>
                      <h2 className="sr-panel-title">Assignees</h2>
                    </div>
                    {canManage ? (
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => setManageOpen(true)}
                      >
                        <Settings className="h-3.5 w-3.5" />
                        Manage
                      </button>
                    ) : null}
                  </div>

                  {assignees.length === 0 ? (
                    <p className="sr-assignees-empty">
                      {canManage
                        ? "No one is assigned yet. Assign members to put this series on their calendar and notify them."
                        : "No one is assigned to this series yet."}
                    </p>
                  ) : (
                    <ul className="sr-assignees">
                      {assignees.map(({ assignment, member }) => {
                        const displayName =
                          findAccount(member.username)?.displayName ??
                          member.displayName;
                        return (
                          <li
                            className="sr-assignee"
                            key={assignment.id}
                          >
                            <span className="sr-avatar" aria-hidden="true">
                              {getInitials(displayName, member.username)}
                            </span>
                            <span className="sr-assignee-main">
                              <span className="sr-assignee-name">
                                {displayName}
                              </span>
                              <span className="sr-assignee-meta">
                                @{member.username} · added{" "}
                                {formatShortDate(assignment.createdAt)}
                              </span>
                            </span>
                            <RoleBadge role={member.role} />
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </section>
              </aside>
            </div>

            <footer className="grp-footer">
              <span>
                Preview build — series and assignments stay in this browser.
              </span>
              <Link href={`/groups/${group.id}`} className="dash-link">
                Back to {group.name}
                <ArrowLeft className="h-3 w-3" />
              </Link>
            </footer>
          </div>
        </main>
      </div>

      {manageOpen ? (
        <ManageAssignmentsDialog
          series={series}
          groupName={group.name}
          members={members}
          actor={user.username}
          onClose={() => setManageOpen(false)}
          onSaved={() => {
            setManageOpen(false);
            notify("success", "Assignments updated.");
          }}
        />
      ) : null}
    </div>
  );
}
