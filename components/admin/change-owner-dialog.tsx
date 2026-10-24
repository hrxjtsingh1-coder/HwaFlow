"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { getInitials } from "@/lib/auth";
import { transferOwnershipAction } from "@/lib/groups-actions";
import { type Group, type GroupMember } from "@/lib/groups";
import { useDialogA11y } from "@/lib/use-dialog";
import { Crown, X } from "../icons";
import { RoleBadge } from "../role-badge";

type ChangeOwnerDialogProps = {
  open: boolean;
  group: Group;
  members: GroupMember[];
  onClose: () => void;
};

export function ChangeOwnerDialog({
  open,
  group,
  members,
  onClose,
}: ChangeOwnerDialogProps) {
  const router = useRouter();
  const panelRef = useDialogA11y(open, onClose);
  const [selectedId, setSelectedId] = useState("");
  const [outgoingRole, setOutgoingRole] = useState<"manager" | "staff">(
    "manager"
  );
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const currentOwner = members.find((member) => member.role === "owner") ?? null;
  const candidates = members.filter((member) => member.role !== "owner");

  useEffect(() => {
    if (!open) return;
    setSelectedId("");
    setOutgoingRole("manager");
    setError(null);
    setSubmitting(false);
  }, [open]);

  if (!open) return null;

  const selected = candidates.find((member) => member.userId === selectedId);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selected || submitting) return;

    setSubmitting(true);
    setError(null);

    const result = await transferOwnershipAction({
      groupId: group.id,
      userId: selected.userId,
      outgoingRole,
    });

    if (!result.ok) {
      setError(result.message);
      setSubmitting(false);
      return;
    }

    onClose();
    // The page is a server component; refresh so the new Owner and the
    // demoted member's role come from the database, not from this dialog.
    router.refresh();
  };

  return (
    <div className="admin-dialog-layer">
      <div className="admin-dialog-backdrop" onClick={onClose} aria-hidden="true" />
      <div
        className="admin-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="change-owner-title"
        ref={panelRef}
        tabIndex={-1}
      >
        <header className="admin-dialog-head">
          <div>
            <p className="eyebrow">Platform admin</p>
            <h2 className="admin-dialog-title" id="change-owner-title">
              Change Owner
            </h2>
            <p className="admin-dialog-sub">
              {group.name} has exactly one Owner. This is a single, atomic swap.
            </p>
          </div>
          <button
            type="button"
            className="admin-icon-btn"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <form onSubmit={handleSubmit}>
          <div className="admin-dialog-body">
            <fieldset className="admin-fieldset">
              <legend className="admin-field-label">New Owner</legend>
              <div className="admin-picker">
                {candidates.map((member) => (
                  <label
                    key={member.id}
                    className="admin-picker-row"
                    data-selected={selectedId === member.userId ? "true" : "false"}
                  >
                    <input
                      type="radio"
                      name="new-owner"
                      value={member.userId}
                      checked={selectedId === member.userId}
                      onChange={() => setSelectedId(member.userId)}
                      data-autofocus
                    />
                    <span className="admin-avatar" aria-hidden="true">
                      {getInitials(member.displayName, member.username)}
                    </span>
                    <span className="admin-picker-main">
                      <span className="admin-picker-name">
                        {member.displayName}
                      </span>
                      <span className="admin-picker-handle">
                        @{member.username}
                      </span>
                    </span>
                    <RoleBadge role={member.role} />
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset className="admin-fieldset">
              <legend className="admin-field-label">
                {currentOwner?.displayName ?? "Current Owner"} becomes
              </legend>
              <div className="admin-radio-row">
                <label className="admin-radio" data-selected={outgoingRole === "manager" ? "true" : "false"}>
                  <input
                    type="radio"
                    name="outgoing-role"
                    value="manager"
                    checked={outgoingRole === "manager"}
                    onChange={() => setOutgoingRole("manager")}
                  />
                  <span>
                    <strong>Manager</strong>
                    <em>Keeps inviting Staff and running approvals.</em>
                  </span>
                </label>
                <label className="admin-radio" data-selected={outgoingRole === "staff" ? "true" : "false"}>
                  <input
                    type="radio"
                    name="outgoing-role"
                    value="staff"
                    checked={outgoingRole === "staff"}
                    onChange={() => setOutgoingRole("staff")}
                  />
                  <span>
                    <strong>Staff</strong>
                    <em>Loses management powers on this group.</em>
                  </span>
                </label>
              </div>
            </fieldset>

            <p className="admin-dialog-note">
              <Crown className="h-3.5 w-3.5" />
              {selected ? (
                <>
                  <strong>{selected.displayName}</strong> becomes Owner.{" "}
                  <strong>{currentOwner?.displayName ?? "The current Owner"}</strong>{" "}
                  is demoted to {outgoingRole === "manager" ? "Manager" : "Staff"}.
                </>
              ) : (
                "Pick a member to see the exact change."
              )}
            </p>

            <p className="admin-form-error" role="alert" aria-live="polite">
              {error ?? ""}
            </p>
          </div>

          <footer className="admin-dialog-foot">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={onClose}
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary btn-sm"
              disabled={!selected || submitting}
            >
              {submitting ? "Transferring…" : "Transfer ownership"}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
