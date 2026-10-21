"use client";

import { useEffect, useRef, useState } from "react";
import { getInitials } from "@/lib/auth";
import type { GroupMember } from "@/lib/groups";
import { ChevronDown, Search, X } from "../icons";
import { RoleBadge } from "../role-badge";

type AssigneePickerProps = {
  /** Every group member. The Owner is filtered out automatically. */
  members: GroupMember[];
  selected: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
  label?: string;
  hint?: string;
};

/**
 * Multi-select member picker rendered as an anchored popover. It lives inside
 * the create-series / manage-assignments dialogs, so Escape closes only the
 * popover (capture phase) and never the dialog underneath.
 */
export function AssigneePicker({
  members,
  selected,
  onChange,
  disabled = false,
  label = "Assign members",
  hint,
}: AssigneePickerProps) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const candidates = [...members]
    .filter((member) => member.role !== "owner")
    .sort((a, b) => {
      const rank = { manager: 0, staff: 1, owner: 2 };
      const diff = rank[a.role] - rank[b.role];
      return diff !== 0 ? diff : a.displayName.localeCompare(b.displayName);
    });

  const selectedSet = new Set(selected);
  const chosen = candidates.filter((member) =>
    selectedSet.has(member.username)
  );

  const needle = term.trim().toLowerCase();
  const filtered = needle
    ? candidates.filter(
        (member) =>
          member.displayName.toLowerCase().includes(needle) ||
          member.username.toLowerCase().includes(needle)
      )
    : candidates;

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      // Stop the dialog underneath from also handling Escape.
      event.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown, true);
    const focusTimer = window.setTimeout(() => {
      // The popover renders inline so it can push the form body taller than
      // the viewport on phones. Focus without scrolling, then bring the whole
      // popover into view so the member list is visible straight away.
      searchRef.current?.focus({ preventScroll: true });
      wrapRef.current?.scrollIntoView({ block: "nearest" });
    }, 30);

    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown, true);
      window.clearTimeout(focusTimer);
    };
  }, [open]);

  const toggle = (username: string) => {
    if (selectedSet.has(username)) {
      onChange(selected.filter((entry) => entry !== username));
    } else {
      onChange([...selected, username]);
    }
  };

  return (
    <div className="grp-assign-field">
      <span className="grp-field-label">{label}</span>

      <div className="grp-assign-wrap" ref={wrapRef}>
        <button
          ref={triggerRef}
          type="button"
          className="grp-assign-trigger"
          aria-expanded={open}
          aria-controls="assignee-popover"
          disabled={disabled}
          onClick={() => setOpen((value) => !value)}
        >
          <span>
            {chosen.length === 0
              ? "Choose members"
              : `${chosen.length} member${chosen.length === 1 ? "" : "s"} selected`}
          </span>
          <ChevronDown className="h-4 w-4" />
        </button>

        <div
          className="grp-assign-popover"
          id="assignee-popover"
          role="group"
          aria-label="Group members"
          data-open={open ? "true" : "false"}
          aria-hidden={open ? undefined : "true"}
        >
          <div className="grp-assign-search">
            <Search className="h-4 w-4" />
            <input
              ref={searchRef}
              type="search"
              value={term}
              onChange={(event) => setTerm(event.target.value)}
              placeholder="Search members"
              aria-label="Search group members"
              tabIndex={open ? 0 : -1}
            />
          </div>

          {filtered.length === 0 ? (
            <p className="grp-assign-empty">
              No members match &ldquo;{term.trim()}&rdquo;.
            </p>
          ) : (
            <ul className="grp-assign-list">
              {filtered.map((member) => {
                const checked = selectedSet.has(member.username);
                return (
                  <li key={member.id}>
                    <label className="grp-assign-option">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(member.username)}
                        tabIndex={open ? 0 : -1}
                      />
                      <span className="grp-assign-avatar" aria-hidden="true">
                        {getInitials(member.displayName, member.username)}
                      </span>
                      <span className="grp-assign-meta">
                        <span className="grp-assign-name">
                          {member.displayName}
                        </span>
                        <span className="grp-assign-handle">
                          @{member.username}
                        </span>
                      </span>
                      <RoleBadge role={member.role} />
                    </label>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="grp-assign-foot">
            <span>
              {chosen.length} selected
            </span>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setOpen(false);
                triggerRef.current?.focus();
              }}
              tabIndex={open ? 0 : -1}
            >
              Done
            </button>
          </div>
        </div>
      </div>

      {chosen.length > 0 ? (
        <div className="grp-assign-chips">
          {chosen.map((member) => (
            <span className="chip chip-accent" key={member.id}>
              {member.displayName}
              <button
                type="button"
                className="grp-chip-remove"
                onClick={() =>
                  onChange(selected.filter((entry) => entry !== member.username))
                }
                aria-label={`Remove ${member.displayName}`}
                disabled={disabled}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      ) : null}

      {hint ? <p className="grp-field-hint">{hint}</p> : null}
    </div>
  );
}
