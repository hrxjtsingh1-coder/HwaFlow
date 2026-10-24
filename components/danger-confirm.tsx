"use client";

import { useId } from "react";

/**
 * Typed confirmation for actions that cannot be undone.
 *
 * A second "are you sure?" button gets clicked on autopilot; making the user
 * reproduce a name forces them to read what they are about to delete.
 */

export function matchesPhrase(phrase: string, value: string): boolean {
  return value.trim() === phrase.trim();
}

export function DangerConfirm({
  phrase,
  value,
  onChange,
  label = "Type",
}: {
  phrase: string;
  value: string;
  onChange: (value: string) => void;
  label?: string;
}) {
  const id = useId();
  const matches = matchesPhrase(phrase, value);

  return (
    <div className="danger-confirm">
      <label className="danger-confirm-label" htmlFor={id}>
        {label} <strong>{phrase}</strong> to confirm
      </label>
      <input
        id={id}
        className="grp-input"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        placeholder={phrase}
        aria-describedby={`${id}-state`}
      />
      <p className="danger-confirm-state" id={`${id}-state`} data-ok={matches}>
        {matches
          ? "Confirmed."
          : "The button stays disabled until this matches exactly."}
      </p>
    </div>
  );
}
