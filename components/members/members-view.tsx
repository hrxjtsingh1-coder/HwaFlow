"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { setActiveGroupId } from "@/lib/active-group";
import { getInitials, signOut } from "@/lib/auth";
import { formatShortDate } from "@/lib/format";
import {
  acceptInviteAction,
  changeRoleAction,
  declineInviteAction,
  removeMemberAction,
  revokeInviteAction,
} from "@/lib/groups-actions";
import {
  canManageMembers,
  type Group,
  type GroupInvite,
  type GroupMember,
} from "@/lib/groups";
import type { AuthUser } from "@/lib/identity";
import { useDialogA11y } from "@/lib/use-dialog";
import { DashboardRail } from "../dashboard/dashboard-rail";
import { DashboardTopbar } from "../dashboard/dashboard-topbar";
import { workspaceLinks } from "../dashboard/workspace-nav";
import { AlertCircle, Check, Plus, Trash, Users, X } from "../icons";
import { GroupAvatar } from "../group-avatar";
import { RoleBadge } from "../role-badge";
import { InviteDrawer } from "./invite-drawer";
import { MemberTable } from "./member-table";
import { ReceivedInvites, type InviteItem } from "./received-invites";

type Notice = { tone: "success" | "error"; text: string };

type ActiveGroup = {
  group: Group;
  viewerMember: GroupMember;
  members: GroupMember[];
  invites: GroupInvite[];
  seriesCount: number;
};

type MembersViewProps = {
  viewer: AuthUser;
  bundle: {
    active: ActiveGroup | null;
    received: InviteItem[];
  };
};

function RemoveMemberDialog({
  member,
  groupName,
  onClose,
  onConfirm,
}: {
  member: GroupMember;
  groupName: string;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const panelRef = useDialogA11y(true, onClose);

  return (
    <div className="mem-dialog-layer">
      <div className="mem-dialog-backdrop" onClick={onClose} aria-hidden="true" />
      <div
        className="mem-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="remove-member-title"
        ref={panelRef}
        tabIndex={-1}
      >
        <header className="mem-dialog-head">
          <span className="mem-dialog-icon" aria-hidden="true">
            <Trash className="h-4 w-4" />
          </span>
          <div>
            <h2 className="mem-dialog-title" id="remove-member-title">
              Remove {member.displayName}?
            </h2>
            <p className="mem-dialog-sub">
              @{member.username} leaves {groupName} immediately. Any series
              assignments are unassigned, and their access to this group&apos;s
              work ends now.
            </p>
          </div>
        </header>

        <footer className="mem-dialog-foot">
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm mem-danger-btn"
            onClick={onConfirm}
            data-autofocus
          >
            <Trash className="h-3.5 w-3.5" />
            Remove member
          </button>
        </footer>
      </div>
    </div>
  );
}

export function MembersView({ viewer, bundle }: MembersViewProps) {
  const router = useRouter();

  const [menuOpen, setMenuOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<GroupMember | null>(null);
  const [busyInviteId, setBusyInviteId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
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

  const activeGroup: ActiveGroup | null = bundle.active;
  const viewerMember = activeGroup?.viewerMember ?? null;
  const viewerRole = viewerMember?.role ?? null;
  const members: GroupMember[] = activeGroup?.members ?? [];
  const groupInvites: GroupInvite[] = activeGroup?.invites ?? [];
  const receivedWithGroups = bundle.received;

  // Series assignments arrive in Phase 2; every count starts at zero.
  const seriesCounts: Record<string, number> = {};

  const canManage = viewerRole ? canManageMembers(viewerRole) : false;
  const owner = members.find((member) => member.role === "owner") ?? null;

  const handleSignOut = () => {
    void signOut();
  };

  const handleAccept = async (inviteId: string) => {
    setBusyInviteId(inviteId);
    const result = await acceptInviteAction(inviteId);

    if (!result.ok) {
      notify("error", result.message);
      setBusyInviteId(null);
      return;
    }

    setActiveGroupId(viewer.username, result.data.groupId);
    notify("success", "You joined the group. It's now your active group.");
    setBusyInviteId(null);
    router.refresh();
  };

  const handleDecline = async (inviteId: string) => {
    setBusyInviteId(inviteId);
    const result = await declineInviteAction(inviteId);

    if (!result.ok) notify("error", result.message);
    else {
      notify("success", "Invite declined.");
      router.refresh();
    }
    setBusyInviteId(null);
  };

  const handleRoleChange = async (
    member: GroupMember,
    role: "manager" | "staff"
  ) => {
    if (!activeGroup) return;

    const result = await changeRoleAction({
      groupId: activeGroup.group.id,
      userId: member.userId,
      role,
    });

    if (!result.ok) {
      notify("error", result.message);
      return;
    }

    notify(
      "success",
      `${member.displayName} is now ${role === "manager" ? "a Manager" : "Staff"}.`
    );
    router.refresh();
  };

  const handleRevoke = async (invite: GroupInvite) => {
    const result = await revokeInviteAction(invite.id);

    if (!result.ok) {
      notify("error", result.message);
      return;
    }

    notify("success", `Invite for @${invite.username} revoked.`);
    router.refresh();
  };

  const handleConfirmRemove = async () => {
    if (!activeGroup || !removeTarget) return;

    setBusy(true);
    const result = await removeMemberAction({
      groupId: activeGroup.group.id,
      userId: removeTarget.userId,
    });
    setBusy(false);

    if (!result.ok) {
      notify("error", result.message);
      setRemoveTarget(null);
      return;
    }

    notify(
      "success",
      `${removeTarget.displayName} was removed from the group.`
    );
    setRemoveTarget(null);
    router.refresh();
  };

  const roleForInvites = viewerRole ?? "staff";
  const hasInvites = receivedWithGroups.length > 0;

  return (
    <div className="dash-shell">
      <DashboardRail
        user={viewer}
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        onSignOut={handleSignOut}
        links={workspaceLinks()}
        active="members"
      />

      <div className="dash-body">
        <DashboardTopbar
          onOpenMenu={() => setMenuOpen(true)}
          trail={[{ label: "Workspace" }, { label: "Members" }]}
        />

        <main className="dash-main" id="main">
          <div className="dash-content mem-content">
            {notice ? (
              <div
                className="mem-notice"
                data-tone={notice.tone}
                role="status"
                aria-live="polite"
              >
                <span className="mem-notice-icon" aria-hidden="true">
                  {notice.tone === "success" ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : (
                    <AlertCircle className="h-3.5 w-3.5" />
                  )}
                </span>
                <span className="mem-notice-text">{notice.text}</span>
                <button
                  type="button"
                  className="mem-notice-close"
                  onClick={() => setNotice(null)}
                  aria-label="Dismiss message"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : null}

            <ReceivedInvites
              items={receivedWithGroups}
              busyId={busyInviteId}
              onAccept={handleAccept}
              onDecline={handleDecline}
            />

            {!activeGroup || !viewerMember || !viewerRole ? (
              <section className="mem-empty dash-enter">
                <span className="mem-empty-icon" aria-hidden="true">
                  <Users className="h-6 w-6" />
                </span>
                <h1 className="mem-empty-title">You&apos;re not in a group yet</h1>
                <p className="mem-empty-copy">
                  {hasInvites
                    ? "Accept an invite above, or ask an Owner to invite your username."
                    : "Ask an Owner to invite your username. Invites appear on this page — there's no email to wait for."}
                </p>
                <span className="mem-username-chip">@{viewer.username}</span>
                <Link href="/dashboard" className="mem-back-link">
                  Back to your dashboard
                </Link>
              </section>
            ) : (
              <>
                <section className="mem-group-head dash-enter">
                  <div className="mem-group-head-main">
                    <GroupAvatar
                      name={activeGroup.group.name}
                      iconDataUrl={activeGroup.group.iconDataUrl}
                      size="lg"
                    />
                    <div className="mem-group-copy">
                      <p className="eyebrow">Members</p>
                      <h1 className="mem-group-title">
                        {activeGroup.group.name}
                      </h1>
                      <div className="mem-group-meta">
                        <span className="chip chip-accent">
                          {activeGroup.group.currency}
                        </span>
                        <RoleBadge role={viewerRole} />
                        <span className="mem-group-slug">
                          @{activeGroup.group.slug}
                        </span>
                      </div>
                    </div>
                  </div>

                  {canManage ? (
                    <button
                      type="button"
                      className="btn btn-primary btn-sm mem-invite-btn"
                      onClick={() => setInviteOpen(true)}
                    >
                      <Plus className="h-4 w-4" />
                      Invite member
                    </button>
                  ) : null}
                </section>

                {canManage ? (
                  <>
                    <section
                      className="mem-panel dash-enter"
                      data-delay="55"
                      aria-labelledby="mem-pending-title"
                    >
                      <div className="mem-panel-head">
                        <div>
                          <p className="eyebrow">Invites</p>
                          <h2 className="mem-section-title" id="mem-pending-title">
                            Pending
                          </h2>
                        </div>
                        <span className="chip">
                          {groupInvites.length} waiting
                        </span>
                      </div>

                      {groupInvites.length === 0 ? (
                        <p className="mem-panel-empty">
                          No pending invites. Everyone you&apos;ve asked has
                          already answered.
                        </p>
                      ) : (
                        <ul className="mem-pending-list">
                          {groupInvites.map((invite) => {
                            const canRevoke =
                              viewerRole === "owner" ||
                              invite.invitedBy === viewer.username;
                            return (
                              <li className="mem-pending-row" key={invite.id}>
                                <span className="mem-pending-main">
                                  <span className="mem-pending-name">
                                    @{invite.username}
                                  </span>
                                  <span className="mem-pending-meta">
                                    Invited by @{invite.invitedBy} ·{" "}
                                    {formatShortDate(invite.createdAt)}
                                  </span>
                                </span>
                                <RoleBadge role={invite.role} />
                                {canRevoke ? (
                                  <button
                                    type="button"
                                    className="mem-text-btn"
                                    onClick={() => void handleRevoke(invite)}
                                  >
                                    Revoke
                                  </button>
                                ) : (
                                  <span className="mem-pending-locked">
                                    Sent by someone else
                                  </span>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </section>

                    <section
                      className="mem-panel dash-enter"
                      data-delay="100"
                      aria-labelledby="mem-roster-title"
                    >
                      <div className="mem-panel-head">
                        <div>
                          <p className="eyebrow">Roster</p>
                          <h2 className="mem-section-title" id="mem-roster-title">
                            Members
                          </h2>
                        </div>
                        <span className="chip">{members.length} people</span>
                      </div>

                      <MemberTable
                        members={members}
                        viewerRole={viewerRole}
                        viewerUsername={viewer.username}
                        seriesCounts={seriesCounts}
                        onRoleChange={(member, role) =>
                          void handleRoleChange(member, role)
                        }
                        onRemove={setRemoveTarget}
                      />

                      <p className="mem-panel-foot">
                        {viewerRole === "owner"
                          ? "Only the Owner changes roles or removes people. Removal immediately unassigns that person's series."
                          : "You can invite Staff and run approvals. Role changes and removals belong to the Owner."}
                      </p>
                    </section>
                  </>
                ) : (
                  <section className="mem-staff-card dash-enter">
                    <div className="mem-staff-head">
                      <span className="mem-avatar mem-avatar--lg" aria-hidden="true">
                        {getInitials(viewer.displayName, viewer.username)}
                      </span>
                      <div className="mem-staff-copy">
                        <p className="eyebrow">Your membership</p>
                        <h2 className="mem-staff-name">{viewer.displayName}</h2>
                        <p className="mem-staff-handle">@{viewer.username}</p>
                      </div>
                      <RoleBadge role={viewerRole} />
                    </div>

                    <dl className="mem-staff-facts">
                      <div>
                        <dt>Role</dt>
                        <dd>Staff</dd>
                      </div>
                      <div>
                        <dt>Joined</dt>
                        <dd>{formatShortDate(viewerMember.joinedAt)}</dd>
                      </div>
                      <div>
                        <dt>Series assigned</dt>
                        <dd>{seriesCounts[viewerMember.id] ?? 0}</dd>
                      </div>
                    </dl>

                    <p className="mem-staff-note">
                      Staff work on the series they&apos;re assigned to, edit
                      translations, and see their own earnings. A Manager or
                      Owner assigns series and handles the roster.
                    </p>
                  </section>
                )}
              </>
            )}

            <footer className="mem-footer">
              <span>Members and invites sync with your team.</span>
              {owner ? <span>Owned by @{owner.username}</span> : null}
            </footer>
          </div>
        </main>
      </div>

      {activeGroup && canManage ? (
        <InviteDrawer
          open={inviteOpen}
          group={activeGroup.group}
          viewerRole={roleForInvites}
          onClose={() => setInviteOpen(false)}
          onInvited={(name) => {
            notify("success", `${name} was invited.`);
            router.refresh();
          }}
        />
      ) : null}

      {removeTarget && activeGroup ? (
        <RemoveMemberDialog
          member={removeTarget}
          groupName={activeGroup.group.name}
          onClose={() => setRemoveTarget(null)}
          onConfirm={() => {
            if (!busy) void handleConfirmRemove();
          }}
        />
      ) : null}
    </div>
  );
}
