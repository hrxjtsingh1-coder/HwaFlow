"use client";

/**
 * `/groups/[id]/settings` — the group's own settings, not a workspace-wide page.
 *
 * Members and pricing live together because they are the same job: who is in
 * the group, and what the group pays them. The group is explicit in the URL, so
 * an Owner with several groups never edits the wrong one.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { signOut } from "@/lib/auth";
import { formatShortDate } from "@/lib/format";
import {
  canManageMembers,
  type GroupInvite,
  type GroupMember,
} from "@/lib/groups";
import {
  changeRoleAction,
  removeMemberAction,
  revokeInviteAction,
  setGroupCurrencyAction,
} from "@/lib/groups-actions";
import type { AuthUser } from "@/lib/identity";
import { CURRENCIES, type Rates } from "@/lib/money";
import type { GroupBundle } from "@/lib/server/groups";
import { DashboardRail } from "../dashboard/dashboard-rail";
import { DashboardTopbar } from "../dashboard/dashboard-topbar";
import { workspaceLinks } from "../dashboard/workspace-nav";
import {
  AlertCircle,
  ArrowLeft,
  Check,
  Coins,
  Plus,
  X,
} from "../icons";
import { InviteDrawer } from "../members/invite-drawer";
import { MemberTable } from "../members/member-table";
import { RemoveMemberDialog } from "../members/remove-member-dialog";
import { GroupAvatar } from "../group-avatar";
import { RoleBadge } from "../role-badge";

type Notice = { tone: "success" | "error"; text: string };

type Tab = "members" | "general";

type GroupSettingsViewProps = {
  viewer: AuthUser;
  bundle: GroupBundle;
  /** Assigned series per member, keyed by user id. */
  seriesCounts: Record<string, number>;
  /** USD-based rates, for the currency preview. */
  rates: Rates;
  initialTab: Tab;
};

export function GroupSettingsView({
  viewer,
  bundle,
  seriesCounts,
  rates,
  initialTab,
}: GroupSettingsViewProps) {
  const router = useRouter();

  const [menuOpen, setMenuOpen] = useState(false);
  const [tab, setTab] = useState<Tab>(initialTab);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<GroupMember | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const noticeTimer = useRef<number | null>(null);

  const { group, members, invites, viewerMember } = bundle;
  const viewerRole = viewerMember.role;
  const canManage = canManageMembers(viewerRole);
  const isOwner = viewerRole === "owner";

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

  const handleRoleChange = async (
    member: GroupMember,
    role: "manager" | "staff"
  ) => {
    const result = await changeRoleAction({
      groupId: group.id,
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
    if (!removeTarget) return;

    setBusy(true);
    const result = await removeMemberAction({
      groupId: group.id,
      userId: removeTarget.userId,
    });
    setBusy(false);

    if (!result.ok) {
      notify("error", result.message);
      return;
    }

    notify(
      "success",
      `${removeTarget.displayName} was removed from ${group.name}.`
    );
    setRemoveTarget(null);
    router.refresh();
  };

  const handleCurrency = async (currency: string) => {
    setBusy(true);
    const result = await setGroupCurrencyAction({ groupId: group.id, currency });
    setBusy(false);

    if (!result.ok) {
      notify("error", result.message);
      return;
    }

    notify(
      "success",
      `Prices are now in ${currency}. Converted ${result.data.series} ${
        result.data.series === 1 ? "series" : "series"
      } and ${result.data.chapters} ${
        result.data.chapters === 1 ? "chapter" : "chapters"
      } still in progress.`
    );
    router.refresh();
  };

  return (
    <div className="dash-shell">
      <DashboardRail
        user={viewer}
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        onSignOut={() => void signOut()}
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
            { label: "Settings" },
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

            <Link href={`/groups/${group.id}`} className="grp-back-link">
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to {group.name}
            </Link>

            <section className="grp-group-head dash-enter">
              <GroupAvatar
                name={group.name}
                iconDataUrl={group.iconDataUrl}
                size="lg"
              />
              <div className="grp-group-heading">
                <p className="eyebrow">Settings</p>
                <h1 className="grp-group-title">{group.name}</h1>
                <div className="grp-group-meta">
                  <RoleBadge role={viewerRole} />
                  <span className="chip chip-accent">{group.currency}</span>
                  <span className="grp-group-slug">@{group.slug}</span>
                </div>
              </div>
            </section>

            <div className="grp-tabs" role="tablist" aria-label="Group settings">
              <button
                type="button"
                role="tab"
                className="grp-tab"
                aria-selected={tab === "members"}
                data-active={tab === "members" ? "true" : "false"}
                onClick={() => setTab("members")}
              >
                Members
                <span className="grp-tab-count">{members.length}</span>
              </button>
              <button
                type="button"
                role="tab"
                className="grp-tab"
                aria-selected={tab === "general"}
                data-active={tab === "general" ? "true" : "false"}
                onClick={() => setTab("general")}
              >
                General
              </button>
            </div>

            {tab === "members" ? (
              <>
                {canManage ? (
                  <section className="mem-panel" aria-labelledby="gs-invites">
                    <div className="mem-panel-head">
                      <div>
                        <p className="eyebrow">Invites</p>
                        <h2 className="mem-section-title" id="gs-invites">
                          Pending
                        </h2>
                      </div>
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={() => setInviteOpen(true)}
                      >
                        <Plus className="h-4 w-4" />
                        Invite member
                      </button>
                    </div>

                    {invites.length === 0 ? (
                      <p className="mem-panel-empty">
                        No pending invites. Everyone you&apos;ve asked has
                        already answered.
                      </p>
                    ) : (
                      <ul className="mem-pending-list">
                        {invites.map((invite) => {
                          const canRevoke =
                            isOwner || invite.invitedBy === viewer.username;
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
                ) : null}

                <section className="mem-panel" aria-labelledby="gs-roster">
                  <div className="mem-panel-head">
                    <div>
                      <p className="eyebrow">Roster</p>
                      <h2 className="mem-section-title" id="gs-roster">
                        Members
                      </h2>
                    </div>
                    <span className="chip">
                      {members.length}{" "}
                      {members.length === 1 ? "person" : "people"}
                    </span>
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
                    {isOwner
                      ? "Only the Owner changes roles or removes people. Removal immediately unassigns that person's series."
                      : "You can invite Staff and run approvals. Role changes and removals belong to the Owner."}
                  </p>
                </section>
              </>
            ) : (
              <CurrencyPanel
                group={group}
                rates={rates}
                isOwner={isOwner}
                busy={busy}
                onSwitch={handleCurrency}
              />
            )}
          </div>
        </main>
      </div>

      <InviteDrawer
        open={inviteOpen}
        group={group}
        viewerRole={viewerRole}
        onClose={() => setInviteOpen(false)}
        onInvited={(displayName) => {
          setInviteOpen(false);
          notify("success", `Invite sent to ${displayName}.`);
          router.refresh();
        }}
      />

      {removeTarget ? (
        <RemoveMemberDialog
          member={removeTarget}
          groupName={group.name}
          busy={busy}
          onClose={() => setRemoveTarget(null)}
          onConfirm={() => void handleConfirmRemove()}
        />
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Currency                                                            */
/* ------------------------------------------------------------------ */

function CurrencyPanel({
  group,
  rates,
  isOwner,
  busy,
  onSwitch,
}: {
  group: GroupBundle["group"];
  rates: Rates;
  isOwner: boolean;
  busy: boolean;
  onSwitch: (currency: string) => void;
}) {
  const [target, setTarget] = useState(group.currency);
  const changed = target !== group.currency;

  const perUsdFrom = rates[group.currency] ?? 1;
  const perUsdTo = rates[target] ?? 1;
  const rate = perUsdTo / perUsdFrom;

  return (
    <section className="mem-panel" aria-labelledby="gs-currency">
      <div className="mem-panel-head">
        <div>
          <p className="eyebrow">Money</p>
          <h2 className="mem-section-title" id="gs-currency">
            Pricing currency
          </h2>
        </div>
        <span className="chip chip-accent">{group.currency}</span>
      </div>

      <p className="mem-panel-empty">
        Every series sets its rate in this currency. Switching converts each
        series price and every chapter still in progress at the current rate;
        approved chapters keep the currency they were paid in.
      </p>

      <div className="grp-currency-row">
        <label className="grp-field">
          <span className="grp-field-label">Currency</span>
          <select
            className="grp-input"
            value={target}
            onChange={(event) => setTarget(event.target.value)}
            disabled={!isOwner || busy}
          >
            {CURRENCIES.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
        </label>

        <p className="grp-currency-rate">
          <Coins className="h-3.5 w-3.5" />
          1 {group.currency} = {rate.toFixed(4)} {target}
        </p>

        {isOwner ? (
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={!changed || busy}
            onClick={() => onSwitch(target)}
          >
            {busy ? "Converting…" : `Switch to ${target}`}
          </button>
        ) : (
          <p className="grp-currency-locked">
            Only the Owner can change the group currency.
          </p>
        )}
      </div>
    </section>
  );
}
