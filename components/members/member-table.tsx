"use client";

import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { getInitials } from "@/lib/auth";
import { formatShortDate } from "@/lib/format";
import type { GroupMember, GroupRole } from "@/lib/groups";
import { Crown, MoreHorizontal, Trash } from "../icons";
import { RoleBadge } from "../role-badge";

type MemberTableProps = {
  members: GroupMember[];
  viewerRole: GroupRole;
  viewerUsername: string;
  /** Keyed by membership id; assigned series only. */
  seriesCounts: Record<string, number>;
  onRoleChange: (member: GroupMember, role: "manager" | "staff") => void;
  onRemove: (member: GroupMember) => void;
};

function RowActions({
  member,
  onRoleChange,
  onRemove,
}: {
  member: GroupMember;
  onRoleChange: (member: GroupMember, role: "manager" | "staff") => void;
  onRemove: (member: GroupMember) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const onMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const items = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>("[role='menuitem']")
    );
    if (items.length === 0) return;
    event.preventDefault();
    const current = items.indexOf(document.activeElement as HTMLElement);
    const step = event.key === "ArrowDown" ? 1 : -1;
    items[(current + step + items.length) % items.length].focus();
  };

  return (
    <div className="mem-row-actions" ref={wrapRef}>
      <button
        ref={triggerRef}
        type="button"
        className="dash-icon-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Actions for ${member.displayName}`}
        onClick={() => setOpen((value) => !value)}
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>

      <div
        className="mem-menu"
        role="menu"
        data-open={open ? "true" : "false"}
        aria-label={`${member.displayName} actions`}
        onKeyDown={onMenuKeyDown}
      >
        {member.role !== "manager" ? (
          <button
            type="button"
            role="menuitem"
            className="mem-menu-item"
            tabIndex={open ? 0 : -1}
            onClick={() => {
              setOpen(false);
              onRoleChange(member, "manager");
            }}
          >
            <Crown className="h-3.5 w-3.5" />
            Make manager
          </button>
        ) : null}
        {member.role !== "staff" ? (
          <button
            type="button"
            role="menuitem"
            className="mem-menu-item"
            tabIndex={open ? 0 : -1}
            onClick={() => {
              setOpen(false);
              onRoleChange(member, "staff");
            }}
          >
            Make staff
          </button>
        ) : null}
        <button
          type="button"
          role="menuitem"
          className="mem-menu-item mem-menu-item--danger"
          tabIndex={open ? 0 : -1}
          onClick={() => {
            setOpen(false);
            onRemove(member);
          }}
        >
          <Trash className="h-3.5 w-3.5" />
          Remove member
        </button>
      </div>
    </div>
  );
}

export function MemberTable({
  members,
  viewerRole,
  viewerUsername,
  seriesCounts,
  onRoleChange,
  onRemove,
}: MemberTableProps) {
  const isOwner = viewerRole === "owner";

  return (
    <div className="mem-table-wrap">
      <table className="mem-table">
        <thead>
          <tr>
            <th scope="col">Member</th>
            <th scope="col">Role</th>
            <th scope="col" className="mem-table-series">Series</th>
            <th scope="col">Joined</th>
            {isOwner ? <th scope="col" className="mem-table-actions-head">Actions</th> : null}
          </tr>
        </thead>
        <tbody>
          {members.map((member) => {
            const displayName = member.displayName;
            const isViewer = member.username === viewerUsername;
            return (
              <tr key={member.id}>
                <td>
                  <span className="mem-member-cell">
                    <span className="mem-avatar" aria-hidden="true">
                      {getInitials(displayName, member.username)}
                    </span>
                    <span className="mem-member-meta">
                      <span className="mem-member-name">
                        {displayName}
                        {isViewer ? (
                          <span className="mem-you">you</span>
                        ) : null}
                      </span>
                      <span className="mem-member-handle">
                        @{member.username}
                      </span>
                    </span>
                  </span>
                </td>
                <td>
                  <RoleBadge role={member.role} />
                </td>
                <td className="mem-table-muted mem-table-series">
                  {seriesCounts[member.id] ?? 0}
                </td>
                <td className="mem-table-muted">
                  {formatShortDate(member.joinedAt)}
                </td>
                {isOwner ? (
                  <td className="mem-table-actions">
                    {member.role !== "owner" ? (
                      <RowActions
                        member={member}
                        onRoleChange={onRoleChange}
                        onRemove={onRemove}
                      />
                    ) : null}
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
