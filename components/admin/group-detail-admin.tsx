"use client";

import Link from "next/link";
import { useState } from "react";

import { getInitials } from "@/lib/auth";
import { formatShortDate } from "@/lib/format";
import type { AdminGroupDetail } from "@/lib/server/admin-groups";
import { ArrowLeft, Crown, Layers, Users } from "../icons";
import { GroupAvatar } from "../group-avatar";
import { RoleBadge } from "../role-badge";
import { ChangeOwnerDialog } from "./change-owner-dialog";

/**
 * Read-only metadata view for one group. Everything arrives as props from the
 * server component, so there is no loading state and no second source of truth.
 */
export function GroupDetailAdmin({ detail }: { detail: AdminGroupDetail }) {
  const [ownerDialogOpen, setOwnerDialogOpen] = useState(false);

  const { group, members, owner } = detail;

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
      </section>

      <div className="admin-stat-row admin-enter" data-delay="55">
        <div className="admin-stat">
          <span className="admin-stat-label">
            <Users className="h-3.5 w-3.5" />
            Members
          </span>
          <span className="admin-stat-value">{detail.memberCount}</span>
        </div>
        <div className="admin-stat">
          <span className="admin-stat-label">
            <Crown className="h-3.5 w-3.5" />
            Managers
          </span>
          <span className="admin-stat-value">{detail.managerCount}</span>
        </div>
        <div className="admin-stat">
          <span className="admin-stat-label">
            <Layers className="h-3.5 w-3.5" />
            Series
          </span>
          <span className="admin-stat-value">{detail.seriesCount}</span>
        </div>
        <div className="admin-stat">
          <span className="admin-stat-label">
            <Layers className="h-3.5 w-3.5" />
            Chapters
          </span>
          <span className="admin-stat-value">{detail.chapterCount}</span>
          <span className="admin-stat-note">
            {detail.chapterCount === 0
              ? "No chapters yet"
              : "Across this group's series"}
          </span>
        </div>
      </div>

      <section className="admin-owner-card admin-enter" data-delay="100">
        <div className="admin-owner-main">
          <span className="admin-avatar admin-avatar--lg" aria-hidden="true">
            {getInitials(owner?.displayName ?? "", owner?.username ?? "")}
          </span>
          <div className="admin-owner-copy">
            <p className="eyebrow">Owner</p>
            <p className="admin-owner-name">
              {owner?.displayName ?? "No Owner assigned"}
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
          <span className="chip">{detail.memberCount} total</span>
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
                        {getInitials(member.displayName, member.username)}
                      </span>
                      <span className="admin-member-meta">
                        <span className="admin-member-name">
                          {member.displayName}
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
                  {/* Assignments are per-member content metadata; RLS keeps them
                      out of the admin console, so a dash is the honest answer. */}
                  <td className="admin-table-muted">—</td>
                  <td className="admin-table-muted">
                    {formatShortDate(member.joinedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="admin-panel-foot-note">
          Admins see metadata only and cannot change members. Roles and invites
          are handled by the group&apos;s Owner and Managers.
        </p>
      </section>

      <ChangeOwnerDialog
        open={ownerDialogOpen}
        group={group}
        members={members}
        onClose={() => setOwnerDialogOpen(false)}
      />
    </div>
  );
}
