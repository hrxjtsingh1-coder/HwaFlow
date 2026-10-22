"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { findAccount, getInitials } from "@/lib/auth";
import { countChaptersForSeries } from "@/lib/chapters";
import { formatShortDate } from "@/lib/format";
import { type GroupMember } from "@/lib/groups";
import { countSeriesInGroup, listSeriesForGroup } from "@/lib/series";
import { useAuthSession } from "@/lib/use-auth-session";
import { useChapters } from "@/lib/use-chapters";
import { useGroups } from "@/lib/use-groups";
import { useSeries } from "@/lib/use-series";
import {
  ArrowLeft,
  ArrowUpRight,
  Crown,
  Layers,
  Users,
} from "../icons";
import { GroupAvatar } from "../group-avatar";
import { RoleBadge } from "../role-badge";
import { ChangeOwnerDialog } from "./change-owner-dialog";

function DetailSkeleton() {
  return (
    <div className="admin-page" aria-hidden="true">
      <div className="admin-skeleton-card admin-skeleton-card--detail">
        <span className="admin-skeleton-line admin-skeleton-line--icon" />
        <span className="admin-skeleton-line admin-skeleton-line--title" />
        <span className="admin-skeleton-line" />
      </div>
    </div>
  );
}

export function GroupDetail({ groupId }: { groupId: string }) {
  const { user, ready: authReady } = useAuthSession();
  const { state, ready } = useGroups();
  const { ready: seriesReady } = useSeries();
  const { ready: chaptersReady } = useChapters();
  const [ownerDialogOpen, setOwnerDialogOpen] = useState(false);

  useEffect(() => {
    setOwnerDialogOpen(false);
  }, [groupId]);

  if (!authReady || !ready || !seriesReady || !chaptersReady || !state || !user) {
    return <DetailSkeleton />;
  }

  const group = state.groups.find((entry) => entry.id === groupId);

  if (!group) {
    return (
      <div className="admin-page">
        <section className="admin-notfound admin-enter">
          <p className="eyebrow">Admin / Groups</p>
          <h1 className="admin-notfound-title">Group not found</h1>
          <p className="admin-notfound-copy">
            This link may be stale, or the group was removed from this browser.
          </p>
          <Link href="/admin/groups" className="btn btn-ghost btn-sm">
            <ArrowLeft className="h-4 w-4" />
            Back to groups
          </Link>
        </section>
      </div>
    );
  }

  const members: GroupMember[] = state.members.filter(
    (member) => member.groupId === group.id
  );
  const owner = members.find((member) => member.role === "owner") ?? null;
  const managers = members.filter((member) => member.role === "manager").length;
  const series = countSeriesInGroup(group.id);
  // Chapters live in their own store and never flow back into groups.ts, so the
  // count is summed here from the group's series.
  const chapters = listSeriesForGroup(group.id).reduce(
    (total, entry) => total + countChaptersForSeries(entry.id),
    0
  );

  const displayNameFor = (member: GroupMember) =>
    findAccount(member.username)?.displayName ?? member.displayName;

  const sorted = [...members].sort((a, b) => {
    const rank = { owner: 3, manager: 2, staff: 1 };
    const diff = rank[b.role] - rank[a.role];
    return diff !== 0 ? diff : a.joinedAt.localeCompare(b.joinedAt);
  });

  return (
    <div className="admin-page">
      <Link href="/admin/groups" className="admin-back-inline">
        <ArrowLeft className="h-3.5 w-3.5" />
        All groups
      </Link>

      <section className="admin-detail-head admin-enter">
        <GroupAvatar
          name={group.name}
          iconDataUrl={group.iconDataUrl}
          size="lg"
        />

        <div className="admin-detail-heading">
          <p className="eyebrow">Group</p>
          <h1 className="admin-detail-title">{group.name}</h1>
          <div className="admin-detail-meta">
            <code className="admin-slug-chip">{group.slug}</code>
            <span className="chip chip-accent">{group.currency}</span>
            <span className="admin-detail-created">
              Created {formatShortDate(group.createdAt)}
            </span>
          </div>
        </div>

        <Link
          href="/settings/members"
          className="btn btn-ghost btn-sm admin-detail-action"
        >
          Open member settings
          <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </section>

      <div className="admin-stat-row admin-enter" data-delay="55">
        <div className="admin-stat">
          <span className="admin-stat-label">
            <Users className="h-3.5 w-3.5" />
            Members
          </span>
          <span className="admin-stat-value">{members.length}</span>
        </div>
        <div className="admin-stat">
          <span className="admin-stat-label">
            <Crown className="h-3.5 w-3.5" />
            Managers
          </span>
          <span className="admin-stat-value">{managers}</span>
        </div>
        <div className="admin-stat" data-muted="true">
          <span className="admin-stat-label">
            <Layers className="h-3.5 w-3.5" />
            Series
          </span>
          <span className="admin-stat-value">{series}</span>
          <span className="admin-stat-note">Available with the series module</span>
        </div>
        <div className="admin-stat" data-muted="true">
          <span className="admin-stat-label">
            <Layers className="h-3.5 w-3.5" />
            Chapters
          </span>
          <span className="admin-stat-value">{chapters}</span>
          <span className="admin-stat-note">
            {chapters === 0 ? "No chapters yet" : "Across this group's series"}
          </span>
        </div>
      </div>

      <section className="admin-owner-card admin-enter" data-delay="100">
        <div className="admin-owner-main">
          <span className="admin-avatar admin-avatar--lg" aria-hidden="true">
            {getInitials(
              owner ? displayNameFor(owner) : "",
              owner?.username ?? ""
            )}
          </span>
          <div className="admin-owner-copy">
            <p className="eyebrow">Owner</p>
            <p className="admin-owner-name">
              {owner ? displayNameFor(owner) : "No Owner assigned"}
            </p>
            <p className="admin-owner-handle">
              {owner ? `@${owner.username}` : "—"}
              {owner ? (
                <span className="admin-owner-since">
                  Owner since {formatShortDate(owner.joinedAt)}
                </span>
              ) : null}
            </p>
          </div>
        </div>

        <div className="admin-owner-action">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setOwnerDialogOpen(true)}
            disabled={members.length < 2}
          >
            <Crown className="h-3.5 w-3.5" />
            Change Owner
          </button>
          {members.length < 2 ? (
            <p className="admin-owner-hint">
              Add members before transferring ownership.
            </p>
          ) : null}
        </div>
      </section>

      <section className="admin-panel admin-enter" data-delay="140">
        <div className="admin-panel-head">
          <div>
            <p className="eyebrow">Roster</p>
            <h2 className="admin-panel-title">Members</h2>
          </div>
          <span className="chip">{members.length} total</span>
        </div>

        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th scope="col">Member</th>
                <th scope="col">Role</th>
                <th scope="col">Series</th>
                <th scope="col">Joined</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((member) => (
                <tr key={member.id}>
                  <td>
                    <span className="admin-member-cell">
                      <span className="admin-avatar" aria-hidden="true">
                        {getInitials(
                          displayNameFor(member),
                          member.username
                        )}
                      </span>
                      <span className="admin-member-meta">
                        <span className="admin-member-name">
                          {displayNameFor(member)}
                        </span>
                        <span className="admin-member-handle">
                          @{member.username}
                        </span>
                      </span>
                    </span>
                  </td>
                  <td>
                    <RoleBadge role={member.role} />
                  </td>
                  <td className="admin-table-muted">0</td>
                  <td className="admin-table-muted">
                    {formatShortDate(member.joinedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="admin-panel-foot-note">
          Read-only here — the admin console sees metadata only. Role changes
          and invites live in member settings, owned by the group&apos;s Owner
          and Managers.
        </p>
      </section>

      <ChangeOwnerDialog
        open={ownerDialogOpen}
        group={group}
        members={members}
        actor={user.username}
        onClose={() => setOwnerDialogOpen(false)}
      />
    </div>
  );
}
