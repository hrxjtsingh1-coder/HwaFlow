"use client";

import { formatShortDate } from "@/lib/format";
import type { Group, GroupInvite } from "@/lib/groups";
import { Check, X } from "../icons";
import { GroupAvatar } from "../group-avatar";
import { RoleBadge } from "../role-badge";

export type InviteItem = {
  invite: GroupInvite;
  group: Group;
};

type ReceivedInvitesProps = {
  items: InviteItem[];
  busyId: string | null;
  onAccept: (inviteId: string) => void;
  onDecline: (inviteId: string) => void;
};

export function ReceivedInvites({
  items,
  busyId,
  onAccept,
  onDecline,
}: ReceivedInvitesProps) {
  if (items.length === 0) return null;

  return (
    <section className="mem-invites dash-enter" aria-labelledby="mem-invites-title">
      <div className="mem-invites-head">
        <div>
          <p className="eyebrow">Waiting for you</p>
          <h2 className="mem-section-title" id="mem-invites-title">
            Group invites
          </h2>
        </div>
        <span className="chip chip-accent">
          {items.length} pending
        </span>
      </div>

      <ul className="mem-invite-list">
        {items.map(({ invite, group }) => {
          const busy = busyId === invite.id;
          return (
            <li className="mem-invite-card" key={invite.id}>
              <GroupAvatar
                name={group.name}
                iconDataUrl={group.iconDataUrl}
                size="md"
              />

              <div className="mem-invite-main">
                <p className="mem-invite-group">{group.name}</p>
                <p className="mem-invite-meta">
                  <RoleBadge role={invite.role} />
                  <span>
                    Invited by @{invite.invitedBy} ·{" "}
                    {formatShortDate(invite.createdAt)}
                  </span>
                </p>
                <p className="mem-invite-note">
                  Accepting joins the group and makes it your active group.
                </p>
              </div>

              <div className="mem-invite-actions">
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => onAccept(invite.id)}
                  disabled={busy}
                >
                  <Check className="h-3.5 w-3.5" />
                  {busy ? "Joining…" : "Accept"}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => onDecline(invite.id)}
                  disabled={busy}
                >
                  <X className="h-3.5 w-3.5" />
                  Decline
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
