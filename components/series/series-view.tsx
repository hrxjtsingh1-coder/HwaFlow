"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { getInitials, signOut } from "@/lib/auth";
import {
  createChapterAction,
  deleteChapterAction,
} from "@/lib/chapter-actions";
import { type Chapter } from "@/lib/chapters";
import { formatMoney, formatShortDate } from "@/lib/format";
import type { Group, GroupMember, GroupRole } from "@/lib/groups";
import type { AuthUser } from "@/lib/identity";
import {
  RELEASE_DAY_LABELS,
  canManageSeries,
  type Series,
  type SeriesAssignment,
} from "@/lib/series";
import { DashboardRail } from "../dashboard/dashboard-rail";
import { DashboardTopbar } from "../dashboard/dashboard-topbar";
import { workspaceLinks } from "../dashboard/workspace-nav";
import {
  AlertCircle,
  ArrowLeft,
  CalendarDays,
  Check,
  Settings,
  Users,
  X,
} from "../icons";
import { RoleBadge } from "../role-badge";
import { ChapterList } from "../chapters/chapter-list";
import { DeleteChapterDialog } from "../chapters/delete-chapter-dialog";
import { ManageAssignmentsDialog } from "../groups/manage-assignments-dialog";
import { SeriesCover } from "../groups/series-cover";
import { EditSeriesDialog } from "./edit-series-dialog";

type Notice = { tone: "success" | "error"; text: string };

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
          : "This link may be stale, or you don't have access to it."}
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
  member: GroupMember | null;
};

type SeriesBundle = {
  series: Series;
  group: Group;
  viewerMember: GroupMember;
  viewerRole: GroupRole;
  members: GroupMember[];
  assignments: SeriesAssignment[];
  creatorName: string;
};

type SeriesViewProps = {
  viewer: AuthUser;
  bundle: SeriesBundle | null;
  chapters: Chapter[];
};

export function SeriesView({ viewer, bundle, chapters }: SeriesViewProps) {
  const router = useRouter();

  const [menuOpen, setMenuOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Chapter | null>(null);
  const [creating, setCreating] = useState(false);
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
            trail={[{ label: "Workspace" }, { label: "Series" }]}
          />
          <main className="dash-main" id="main">
            <div className="dash-content sr-content">
              <SeriesNotFound />
            </div>
          </main>
        </div>
      </div>
    );
  }

  const { series, group, viewerMember, viewerRole, members, assignments } =
    bundle;

  const memberByUsername = new Map(
    members.map((member) => [member.username, member])
  );

  const assignees: AssigneeRow[] = assignments
    .map((assignment) => ({
      assignment,
      member: memberByUsername.get(assignment.username) ?? null,
    }))
    .sort((a, b) => {
      const nameA = a.member?.displayName ?? a.assignment.username;
      const nameB = b.member?.displayName ?? b.assignment.username;
      return nameA.localeCompare(nameB);
    });

  const canManage = canManageSeries(viewerRole);
  const createdBy = bundle.creatorName || series.createdBy || "a teammate";

  const handleCreateChapter = async () => {
    if (creating) return;
    setCreating(true);

    const result = await createChapterAction(series.id);
    if (!result.ok) {
      setCreating(false);
      notify("error", result.message);
      return;
    }

    router.push(`/chapters/${result.data.id}/workspace`);
  };

  const handleDeleteChapter = async () => {
    if (!deleteTarget) return;
    const target = deleteTarget;

    const result = await deleteChapterAction({ chapterId: target.id });
    setDeleteTarget(null);

    if (!result.ok) {
      notify("error", result.message);
      return;
    }

    notify("success", `Chapter ${target.number} was deleted.`);
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
                  {series.releaseDays.length === 0 ? (
                    <span className="chip chip-accent">
                      <CalendarDays className="h-3 w-3" />
                      No release day
                    </span>
                  ) : (
                    series.releaseDays.map((day) => (
                      <span className="chip chip-accent" key={day}>
                        <CalendarDays className="h-3 w-3" />
                        {RELEASE_DAY_LABELS[day]}
                      </span>
                    ))
                  )}
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

                {canManage ? (
                  <div className="ch-series-edit">
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => setEditOpen(true)}
                    >
                      <Settings className="h-3.5 w-3.5" />
                      Edit
                    </button>
                  </div>
                ) : null}

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
                      release days for now.
                    </p>
                  )}
                </section>

                <ChapterList
                  chapters={chapters}
                  canManage={canManage}
                  canCreate={canManage || viewerRole === "staff"}
                  creating={creating}
                  onCreate={handleCreateChapter}
                  onDelete={(chapter) => setDeleteTarget(chapter)}
                />
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
                      <dt>Release days</dt>
                      <dd>
                        {series.releaseDays.length === 0
                          ? "Not set"
                          : series.releaseDays
                              .map((day) => RELEASE_DAY_LABELS[day])
                              .join(", ")}
                      </dd>
                    </div>
                    <div>
                      <dt>Rate</dt>
                      <dd>
                        {formatMoney(series.rateAmount, group.currency)}
                        <span className="ch-rate-note">
                          {" "}
                          per approved chapter
                        </span>
                      </dd>
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
                          member?.displayName || assignment.username;
                        const username =
                          member?.username || assignment.username;
                        return (
                          <li className="sr-assignee" key={assignment.id}>
                            <span className="sr-avatar" aria-hidden="true">
                              {getInitials(displayName, username)}
                            </span>
                            <span className="sr-assignee-main">
                              <span className="sr-assignee-name">
                                {displayName}
                              </span>
                              <span className="sr-assignee-meta">
                                @{username} · added{" "}
                                {formatShortDate(assignment.createdAt)}
                              </span>
                            </span>
                            {member ? <RoleBadge role={member.role} /> : null}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </section>
              </aside>
            </div>

            <footer className="grp-footer">
              <span>Series, assignments and members sync with your team.</span>
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
          initialAssigneeUsernames={assignments.map(
            (assignment) => assignment.username
          )}
          onClose={() => setManageOpen(false)}
          onSaved={() => {
            setManageOpen(false);
            notify("success", "Assignments updated.");
            router.refresh();
          }}
        />
      ) : null}

      {editOpen ? (
        <EditSeriesDialog
          series={series}
          group={group}
          onClose={() => setEditOpen(false)}
          onSaved={() => {
            setEditOpen(false);
            notify("success", "Series updated.");
            router.refresh();
          }}
        />
      ) : null}

      {deleteTarget ? (
        <DeleteChapterDialog
          chapter={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={handleDeleteChapter}
        />
      ) : null}
    </div>
  );
}
