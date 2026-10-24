"use client";

import { useState } from "react";

import type { GroupMember } from "@/lib/groups";
import { useDialogA11y } from "@/lib/use-dialog";
import { DangerConfirm, matchesPhrase } from "../danger-confirm";
import { Trash } from "../icons";

/**
 * Removal needs the username typed back: it unassigns series immediately and
 * cannot be undone from the UI.
 */
export function RemoveMemberDialog({
  member,
  groupName,
  busy = false,
  onClose,
  onConfirm,
}: {
  member: GroupMember;
  groupName: string;
  busy?: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const panelRef = useDialogA11y(true, onClose);
  const [typed, setTyped] = useState("");
  const phrase = `@${member.username}`;
  const ready = matchesPhrase(phrase, typed);

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

        <DangerConfirm
          phrase={phrase}
          value={typed}
          onChange={setTyped}
          label="Type"
        />

        <footer className="mem-dialog-foot">
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm mem-danger-btn"
            onClick={onConfirm}
            disabled={!ready || busy}
            data-autofocus
          >
            <Trash className="h-3.5 w-3.5" />
            {busy ? "Removing…" : "Remove member"}
          </button>
        </footer>
      </div>
    </div>
  );
}
