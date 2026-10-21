"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { getInitials, signOut } from "@/lib/auth";
import { formatShortDate } from "@/lib/format";
import {
  GroupError,
  acceptInvite,
  canManageMembers,
  changeRole,
  declineInvite,
  getActiveGroupFor,
  getGroup,
  getMembers,
  listInvitesForGroup,
  listInvitesForUser,
  removeMember,
  revokeInvite,
  type Group,
  type GroupInvite,
  type GroupMember,
} from "@/lib/groups";
import { useAuthSession } from "@/lib/use-auth-session";
import { useDialogA11y } from "@/lib/use-dialog";
import { useGroups } from "@/lib/use-groups";
import { DashboardRail } from "../dashboard/dashboard-rail";
import { DashboardTopbar } from "../dashboard/dashboard-topbar";
import {
  AlertCircle,
  Check,
  LayoutGrid,
  Plus,
  Trash,
  Users,
  X,
} from "../icons";
import { GroupAvatar } from "../group-avatar";
import { Logo } from "../logo";
import { RoleBadge } from "../role-badge";
import { InviteDrawer } from "./invite-drawer";
import { MemberTable } from "./member-table";
import { ReceivedInvites, type InviteItem } from "./received-invites";

type Notice = { tone: "success" | "error"; text: string };

function errorMessage(caught: unknown): string {
  return caught instanceof GroupError
    ? caught.message
    : "Something went wrong. Try again.";
}

function MembersLoading() {
  return (
    <div className="dash-loading">
      <div className="dash-loading-inner">
        <Logo href="/" />
        <div className="dash-loading-card" role="status" aria-live="polite">
          <span className="dash-spinner" aria-hidden="true" />
          <p>Opening member settings…</p>
        </div>
      </div>
    </div>
  );
}

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

export function MembersView() {
  const router = useRouter();
  const { user, ready: authReady } = useAuthSession();
  const { ready: groupsReady } = useGroups();

  const [menuOpen, setMenuOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<GroupMember | null>(null);
  const [busyInviteId, setBusyInviteId] = useState<string | null>(null);
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

  if (!authReady || !groupsReady || !user) return <MembersLoading />;

  const active = getActiveGroupFor(user.username);
  const activeGroup: Group | null = active?.group ?? null;
  const viewerMember = active?.member ?? null;
  const viewerRole = viewerMember?.role ?? null;

  const members: GroupMember[] = activeGroup ? getMembers(activeGroup.id) : [];

  // Invites can point at groups other than the active one, so resolve each.
  const receivedWithGroups: InviteItem[] = listInvitesForUser(user.username)
    .filter((invite) => invite.status === "pending")
    .map((invite) => {
      const group =
        activeGroup?.id === invite.groupId
          ? activeGroup
          : getGroup(invite.groupId);
      return group ? { invite, group } : null;
    })
    .filter((item): item is InviteItem => item !== null);

  const groupInvites: GroupInvite[] = activeGroup
    ? listInvitesForGroup(activeGroup.id).filter(
        (invite) => invite.status === "pending"
      )
    : [];

  const canManage = viewerRole ? canManageMembers(viewerRole) : false;
  const owner = members.find((member) => member.role === "owner") ?? null;

  const handleSignOut = () => {
    signOut();
    router.replace("/login");
  };

  const handleAccept = (inviteId: string) => {
    if (!user) return;
    setBusyInviteId(inviteId);
    try {
      acceptInvite(inviteId, user.username);
      notify("success", "You joined the group. It's now your active group.");
    } catch (caught) {
      notify("error", errorMessage(caught));
    } finally {
      setBusyInviteId(null);
    }
  };

  const handleDecline = (inviteId: string) => {
    if (!user) return;
    setBusyInviteId(inviteId);
    try {
      declineInvite(inviteId, user.username);
      notify("success", "Invite declined.");
    } catch (caught) {
      notify("error", errorMessage(caught));
    } finally {
      setBusyInviteId(null);
    }
  };

  const handleRoleChange = (
    member: GroupMember,
    role: "manager" | "staff"
  ) => {
    if (!activeGroup || !user) return;
    try {
      changeRole({
        groupId: activeGroup.id,
        userId: member.userId,
        role,
        actor: user.username,
      });
      notify(
        "success",
        `${member.displayName} is now ${role === "manager" ? "a Manager" : "Staff"}.`
      );
    } catch (caught) {
      notify("error", errorMessage(caught));
    }
  };

  const handleRevoke = (invite: GroupInvite) => {
    if (!user) return;
    try {
      revokeInvite(invite.id, user.username);
      notify("success", `Invite for @${invite.username} revoked.`);
    } catch (caught) {
      notify("error", errorMessage(caught));
    }
  };

  const handleConfirmRemove = () => {
    if (!activeGroup || !user || !removeTarget) return;
    try {
      removeMember({
        groupId: activeGroup.id,
        userId: removeTarget.userId,
        actor: user.username,
      });
      notify("success", `${removeTarget.displayName} was removed from the group.`);
      setRemoveTarget(null);
    } catch (caught) {
      notify("error", errorMessage(caught));
      setRemoveTarget(null);
    }
  };

  const roleForInvites = viewerRole ?? "staff";
  const hasInvites = receivedWithGroups.length > 0;

  return (
    <div className="dash-shell">
      <DashboardRail
        user={user}
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        onSignOut={handleSignOut}
        links={[
          {
            key: "overview",
            href: "/dashboard",
            label: "Dashboard",
            icon: LayoutGrid,
          },
          {
            key: "members",
            href: "/settings/members",
            label: "Members",
            icon: Users,
          },
        ]}
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
                <span className="mem-username-chip">@{user.username}</span>
                <Link href="/dashboard" className="mem-back-link">
                  Back to your dashboard
                </Link>
              </section>
            ) : (
              <>
                <section className="mem-group-head dash-enter">
                  <div className="mem-group-head-main">
                    <GroupAvatar
                      name={activeGroup.name}
                      iconDataUrl={activeGroup.iconDataUrl}
                      size="lg"
                    />
                    <div className="mem-group-copy">
                      <p className="eyebrow">Members</p>
                      <h1 className="mem-group-title">{activeGroup.name}</h1>
                      <div className="mem-group-meta">
                        <span className="chip chip-accent">
                          {activeGroup.currency}
                        </span>
                        <RoleBadge role={viewerRole} />
                        <span className="mem-group-slug">
                          @{activeGroup.slug}
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
                              invite.invitedBy === user.username;
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
                                    onClick={() => handleRevoke(invite)}
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
                        viewerUsername={user.username}
                        onRoleChange={handleRoleChange}
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
                        {getInitials(user.displayName, user.username)}
                      </span>
                      <div className="mem-staff-copy">
                        <p className="eyebrow">Your membership</p>
                        <h2 className="mem-staff-name">{user.displayName}</h2>
                        <p className="mem-staff-handle">@{user.username}</p>
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
                        <dd>0</dd>
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
              <span>
                Preview build — members and invites stay in this browser.
              </span>
              {owner ? (
                <span>Owned by @{owner.username}</span>
              ) : null}
            </footer>
          </div>
        </main>
      </div>

      {activeGroup && canManage ? (
        <InviteDrawer
          open={inviteOpen}
          group={activeGroup}
          actor={user.username}
          viewerRole={roleForInvites}
          onClose={() => setInviteOpen(false)}
          onInvited={(name) => notify("success", `${name} was invited.`)}
        />
      ) : null}

      {removeTarget && activeGroup ? (
        <RemoveMemberDialog
          member={removeTarget}
          groupName={activeGroup.name}
          onClose={() => setRemoveTarget(null)}
          onConfirm={handleConfirmRemove}
        />
      ) : null}
    </div>
  );
}
