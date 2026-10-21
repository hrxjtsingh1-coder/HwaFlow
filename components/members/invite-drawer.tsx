"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { findAccount, normalizeUsername } from "@/lib/auth";
import {
  GroupError,
  inviteMember,
  type Group,
  type GroupRole,
} from "@/lib/groups";
import { useDialogA11y } from "@/lib/use-dialog";
import { X } from "../icons";

type LookupState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "found"; displayName: string; username: string }
  | { status: "missing" };

type InviteDrawerProps = {
  open: boolean;
  group: Group;
  actor: string;
  viewerRole: GroupRole;
  onClose: () => void;
  onInvited: (username: string) => void;
};

export function InviteDrawer({
  open,
  group,
  actor,
  viewerRole,
  onClose,
  onInvited,
}: InviteDrawerProps) {
  const panelRef = useDialogA11y(open, onClose);
  const [username, setUsername] = useState("");
  const [role, setRole] = useState<"manager" | "staff">("staff");
  const [lookup, setLookup] = useState<LookupState>({ status: "idle" });
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const usernameRef = useRef<HTMLInputElement>(null);

  const isOwner = viewerRole === "owner";

  useEffect(() => {
    if (!open) return;
    setUsername("");
    setRole("staff");
    setLookup({ status: "idle" });
    setUsernameError(null);
    setFormError(null);
    setSubmitting(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const normalized = normalizeUsername(username);
    if (!normalized) {
      setLookup({ status: "idle" });
      return;
    }
    setLookup({ status: "checking" });
    const timer = window.setTimeout(() => {
      const account = findAccount(normalized);
      setLookup(
        account
          ? {
              status: "found",
              displayName: account.displayName,
              username: account.username,
            }
          : { status: "missing" }
      );
    }, 340);
    return () => window.clearTimeout(timer);
  }, [username, open]);

  if (!open) return null;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;

    const normalized = normalizeUsername(username);
    const account = normalized ? findAccount(normalized) : null;
    const nextError = !normalized
      ? "Enter the username to invite."
      : !account
        ? "No account with that username. They need to register first."
        : null;

    setUsernameError(nextError);
    setFormError(null);

    if (nextError) {
      usernameRef.current?.focus();
      return;
    }

    setSubmitting(true);
    try {
      inviteMember({
        groupId: group.id,
        username: normalized,
        role: isOwner ? role : "staff",
        actor,
      });
      onInvited(account?.displayName ?? normalized);
      onClose();
    } catch (caught) {
      if (caught instanceof GroupError) {
        if (
          caught.code === "invitee-not-found" ||
          caught.code === "already-member" ||
          caught.code === "already-invited"
        ) {
          setUsernameError(caught.message);
          usernameRef.current?.focus();
        } else {
          setFormError(caught.message);
        }
      } else {
        setFormError("We couldn't send that invite. Try again.");
      }
      setSubmitting(false);
    }
  };

  return (
    <div className="mem-sheet-layer">
      <div className="mem-sheet-backdrop" onClick={onClose} aria-hidden="true" />

      <div
        className="mem-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="invite-member-title"
        ref={panelRef}
        tabIndex={-1}
      >
        <header className="mem-sheet-head">
          <div>
            <p className="eyebrow">Members</p>
            <h2 className="mem-sheet-title" id="invite-member-title">
              Invite member
            </h2>
            <p className="mem-sheet-sub">
              They receive a pending invite on this page and join when they
              accept.
            </p>
          </div>
          <button
            type="button"
            className="dash-icon-btn"
            onClick={onClose}
            aria-label="Close drawer"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <form className="mem-sheet-form" onSubmit={handleSubmit} noValidate>
          <div className="mem-sheet-body">
            <div className="mem-field">
              <label className="mem-field-label" htmlFor="invite-username">
                Username
              </label>
              <div className="mem-input-wrap">
                <span className="mem-input-prefix" aria-hidden="true">
                  @
                </span>
                <input
                  ref={usernameRef}
                  id="invite-username"
                  className="mem-input mem-input--prefixed"
                  value={username}
                  onChange={(event) => {
                    setUsername(event.target.value);
                    if (usernameError) setUsernameError(null);
                  }}
                  placeholder="username"
                  autoComplete="off"
                  spellCheck={false}
                  autoCapitalize="none"
                  data-autofocus
                  aria-invalid={usernameError ? true : undefined}
                  aria-describedby="invite-username-status"
                />
              </div>
              {usernameError ? (
                <p className="mem-field-error" id="invite-username-status" role="alert">
                  {usernameError}
                </p>
              ) : (
                <p
                  className="mem-field-hint"
                  id="invite-username-status"
                  aria-live="polite"
                  data-status={lookup.status}
                >
                  {lookup.status === "idle"
                    ? "They must already have a HwaFlow account."
                    : lookup.status === "checking"
                      ? "Checking…"
                      : lookup.status === "found"
                        ? `Found: ${lookup.displayName} (@${lookup.username})`
                        : "No account with that username. They need to register first."}
                </p>
              )}
            </div>

            <fieldset className="mem-fieldset">
              <legend className="mem-field-label">Role</legend>
              <div className="mem-radio-row">
                <label
                  className="mem-radio"
                  data-selected={role === "staff" ? "true" : "false"}
                  data-locked={isOwner ? undefined : "true"}
                >
                  <input
                    type="radio"
                    name="invite-role"
                    value="staff"
                    checked={role === "staff"}
                    onChange={() => setRole("staff")}
                  />
                  <span>
                    <strong>Staff</strong>
                    <em>Works on series they&apos;re assigned to.</em>
                  </span>
                </label>

                <label
                  className="mem-radio"
                  data-selected={role === "manager" ? "true" : "false"}
                  data-locked={isOwner ? undefined : "true"}
                >
                  <input
                    type="radio"
                    name="invite-role"
                    value="manager"
                    checked={role === "manager"}
                    onChange={() => setRole("manager")}
                    disabled={!isOwner}
                  />
                  <span>
                    <strong>Manager</strong>
                    <em>Can invite Staff and run approvals.</em>
                  </span>
                </label>
              </div>
              {!isOwner ? (
                <p className="mem-field-hint">
                  Managers can add Staff. Only the Owner promotes to Manager.
                </p>
              ) : null}
            </fieldset>

            <p className="mem-form-error" role="alert" aria-live="polite">
              {formError ?? ""}
            </p>
          </div>

          <footer className="mem-sheet-foot">
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
              disabled={submitting}
            >
              {submitting ? "Sending…" : "Send invite"}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
