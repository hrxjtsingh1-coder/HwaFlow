"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { findAccount, normalizeUsername } from "@/lib/auth";
import {
  GROUP_CURRENCIES,
  GroupError,
  cleanGroupName,
  createGroup,
  slugBase,
  uniqueSlug,
  validateGroupName,
  type Group,
} from "@/lib/groups";
import { useDialogA11y } from "@/lib/use-dialog";
import { X } from "../icons";
import { GroupIconField } from "./group-icon-field";

type LookupState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "found"; displayName: string; username: string }
  | { status: "missing" };

type CreateGroupDrawerProps = {
  open: boolean;
  actor: string;
  existingSlugs: string[];
  onClose: () => void;
  onCreated: (group: Group) => void;
};

export function CreateGroupDrawer({
  open,
  actor,
  existingSlugs,
  onClose,
  onCreated,
}: CreateGroupDrawerProps) {
  const panelRef = useDialogA11y(open, onClose);

  const [name, setName] = useState("");
  const [ownerUsername, setOwnerUsername] = useState("");
  const [currency, setCurrency] = useState<string>("USD");
  const [iconDataUrl, setIconDataUrl] = useState<string | null>(null);
  const [lookup, setLookup] = useState<LookupState>({ status: "idle" });
  const [nameError, setNameError] = useState<string | null>(null);
  const [ownerError, setOwnerError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const nameRef = useRef<HTMLInputElement>(null);
  const ownerRef = useRef<HTMLInputElement>(null);

  // A fresh form every time the drawer opens.
  useEffect(() => {
    if (!open) return;
    setName("");
    setOwnerUsername("");
    setCurrency("USD");
    setIconDataUrl(null);
    setLookup({ status: "idle" });
    setNameError(null);
    setOwnerError(null);
    setFormError(null);
    setSubmitting(false);
  }, [open]);

  // Debounced account lookup.
  useEffect(() => {
    if (!open) return;
    const normalized = normalizeUsername(ownerUsername);
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
  }, [ownerUsername, open]);

  if (!open) return null;

  const previewSlug = uniqueSlug(
    slugBase(cleanGroupName(name) || "your-group"),
    existingSlugs
  );

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;

    const nextNameError = validateGroupName(name);
    const normalizedOwner = normalizeUsername(ownerUsername);
    const ownerAccount = normalizedOwner ? findAccount(normalizedOwner) : null;
    const nextOwnerError = !normalizedOwner
      ? "Enter the Owner's username."
      : !ownerAccount
        ? "No account with that username. They need to register first."
        : null;

    setNameError(nextNameError);
    setOwnerError(nextOwnerError);
    setFormError(null);

    if (nextNameError) {
      nameRef.current?.focus();
      return;
    }
    if (nextOwnerError) {
      ownerRef.current?.focus();
      return;
    }

    setSubmitting(true);
    try {
      const group = createGroup({
        name,
        ownerUsername: normalizedOwner,
        currency,
        iconDataUrl,
        actor,
      });
      onCreated(group);
      onClose();
    } catch (caught) {
      if (caught instanceof GroupError) {
        if (caught.code === "invalid-name") {
          setNameError(caught.message);
          nameRef.current?.focus();
        } else if (
          caught.code === "owner-not-found" ||
          caught.code === "already-member"
        ) {
          setOwnerError(caught.message);
          ownerRef.current?.focus();
        } else {
          setFormError(caught.message);
        }
      } else {
        setFormError("Something went wrong creating that group. Try again.");
      }
      setSubmitting(false);
    }
  };

  return (
    <div className="admin-sheet-layer">
      <div className="admin-sheet-backdrop" onClick={onClose} aria-hidden="true" />

      <div
        className="admin-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-group-title"
        ref={panelRef}
        tabIndex={-1}
      >
        <header className="admin-sheet-head">
          <div>
            <p className="eyebrow">Platform</p>
            <h2 className="admin-sheet-title" id="create-group-title">
              New group
            </h2>
            <p className="admin-sheet-sub">
              The group starts with one Owner. Everyone else joins by invite.
            </p>
          </div>
          <button
            type="button"
            className="admin-icon-btn"
            onClick={onClose}
            aria-label="Close drawer"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <form className="admin-sheet-form" onSubmit={handleSubmit} noValidate>
          <div className="admin-sheet-body">
            <div className="admin-field">
              <label className="admin-field-label" htmlFor="group-name">
                Group name
              </label>
              <input
                ref={nameRef}
                id="group-name"
                className="admin-input"
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                  if (nameError) setNameError(null);
                }}
                placeholder="e.g. Midnight Scans"
                maxLength={60}
                autoComplete="off"
                data-autofocus
                aria-invalid={nameError ? true : undefined}
                aria-describedby={
                  nameError ? "group-name-error" : "group-slug-preview"
                }
              />
              {nameError ? (
                <p className="admin-field-error" id="group-name-error" role="alert">
                  {nameError}
                </p>
              ) : null}
              <p className="admin-slug-preview" id="group-slug-preview">
                Slug <code>{previewSlug}</code>
                <span>Read-only — it keeps links stable.</span>
              </p>
            </div>

            <div className="admin-field">
              <label className="admin-field-label" htmlFor="group-owner">
                Owner username
              </label>
              <div className="admin-input-wrap">
                <span className="admin-input-prefix" aria-hidden="true">
                  @
                </span>
                <input
                  ref={ownerRef}
                  id="group-owner"
                  className="admin-input admin-input--prefixed"
                  value={ownerUsername}
                  onChange={(event) => {
                    setOwnerUsername(event.target.value);
                    if (ownerError) setOwnerError(null);
                  }}
                  placeholder="username"
                  autoComplete="off"
                  spellCheck={false}
                  autoCapitalize="none"
                  aria-invalid={ownerError ? true : undefined}
                  aria-describedby="group-owner-status"
                />
              </div>
              {ownerError ? (
                <p className="admin-field-error" id="group-owner-status" role="alert">
                  {ownerError}
                </p>
              ) : (
                <p
                  className="admin-field-hint"
                  id="group-owner-status"
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

            <GroupIconField
              id="group-icon"
              name={name}
              value={iconDataUrl}
              onChange={setIconDataUrl}
              disabled={submitting}
            />

            <div className="admin-field">
              <label className="admin-field-label" htmlFor="group-currency">
                Currency
              </label>
              <select
                id="group-currency"
                className="admin-select"
                value={currency}
                onChange={(event) => setCurrency(event.target.value)}
              >
                {GROUP_CURRENCIES.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>
              <p className="admin-field-hint">
                Used for the group&apos;s rates. No conversion happens in the app.
              </p>
            </div>

            <p className="admin-form-error" role="alert" aria-live="polite">
              {formError ?? ""}
            </p>
          </div>

          <footer className="admin-sheet-foot">
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
              {submitting ? "Creating…" : "Create group"}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
