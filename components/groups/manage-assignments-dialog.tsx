"use client";

import { useState } from "react";
import type { GroupMember } from "@/lib/groups";
import { setSeriesAssignmentsAction } from "@/lib/series-actions";
import type { Series } from "@/lib/series";
import { useDialogA11y } from "@/lib/use-dialog";
import { AlertCircle, Users, X } from "../icons";
import { AssigneePicker } from "./assignee-picker";

type ManageAssignmentsDialogProps = {
  series: Series;
  groupName: string;
  members: GroupMember[];
  initialAssigneeUsernames: string[];
  onClose: () => void;
  onSaved: () => void;
};

export function ManageAssignmentsDialog({
  series,
  groupName,
  members,
  initialAssigneeUsernames,
  onClose,
  onSaved,
}: ManageAssignmentsDialogProps) {
  const panelRef = useDialogA11y(true, onClose);
  const [assignees, setAssignees] = useState<string[]>(
    initialAssigneeUsernames
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (busy) return;
    setError(null);
    setBusy(true);

    const memberByUsername = new Map(
      members.map((member) => [member.username, member])
    );
    const userIds = assignees
      .map((username) => memberByUsername.get(username)?.userId)
      .filter((id): id is string => Boolean(id));

    try {
      const result = await setSeriesAssignmentsAction({
        seriesId: series.id,
        userIds,
      });

      if (!result.ok) {
        setError(result.message);
        return;
      }

      onSaved();
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grp-dialog-layer">
      <div className="grp-dialog-backdrop" onClick={onClose} aria-hidden="true" />
      <div
        className="grp-dialog grp-dialog--assign"
        role="dialog"
        aria-modal="true"
        aria-labelledby="manage-assignments-title"
        ref={panelRef}
        tabIndex={-1}
      >
        <header className="grp-dialog-head">
          <span className="grp-dialog-icon" aria-hidden="true">
            <Users className="h-4 w-4" />
          </span>
          <div className="grp-dialog-heading">
            <p className="eyebrow">Assignments</p>
            <h2 className="grp-dialog-title" id="manage-assignments-title">
              Who works on {series.title}?
            </h2>
            <p className="grp-dialog-sub">
              {groupName} · assigned members get this series on their calendar
              and in notifications.
            </p>
          </div>
          <button
            type="button"
            className="grp-icon-btn"
            onClick={onClose}
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="grp-form-body">
          <AssigneePicker
            members={members}
            selected={assignees}
            onChange={setAssignees}
            disabled={busy}
            label="Assigned members"
            hint="Managers can still see every series for approvals. Only assigned people get calendar entries and release notifications."
          />

          {error ? (
            <p className="grp-form-error" role="alert">
              <AlertCircle className="h-4 w-4" />
              {error}
            </p>
          ) : null}
        </div>

        <footer className="grp-dialog-foot">
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={handleSave}
            disabled={busy}
          >
            {busy ? "Saving…" : "Save assignments"}
          </button>
        </footer>
      </div>
    </div>
  );
}
