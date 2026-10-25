"use client";

import { useState } from "react";
import type { Series } from "@/lib/series";
import { deleteSeriesAction } from "@/lib/series-actions";
import { useDialogA11y } from "@/lib/use-dialog";
import { DangerConfirm, matchesPhrase } from "../danger-confirm";
import { AlertCircle, Trash, X } from "../icons";

/**
 * The one destructive action that reaches across the whole series. The phrase
 * is the series title itself, so nobody arrives here by muscle memory.
 */
export function DeleteSeriesDialog({
  series,
  chapterCount,
  onClose,
  onDeleted,
}: {
  series: Series;
  chapterCount: number;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const panelRef = useDialogA11y(true, onClose);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = matchesPhrase(series.title, typed);

  const confirm = async () => {
    if (busy || !ready) return;
    setBusy(true);
    setError(null);

    try {
      const result = await deleteSeriesAction({ seriesId: series.id });
      if (!result.ok) {
        setError(result.message);
        setBusy(false);
        return;
      }
      onDeleted();
    } catch {
      setError("Something went wrong. Try again.");
      setBusy(false);
    }
  };

  return (
    <div className="grp-dialog-layer">
      <div className="grp-dialog-backdrop" onClick={onClose} aria-hidden="true" />
      <div
        className="grp-dialog ch-dialog ch-dialog--danger"
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-series-title"
        ref={panelRef}
        tabIndex={-1}
      >
        <header className="grp-dialog-head">
          <span
            className="grp-dialog-icon ch-dialog-icon--danger"
            aria-hidden="true"
          >
            <Trash className="h-4 w-4" />
          </span>
          <div className="grp-dialog-heading">
            <p className="eyebrow">Delete series</p>
            <h2 className="grp-dialog-title" id="delete-series-title">
              Delete {series.title}?
            </h2>
            <p className="grp-dialog-sub">
              {chapterCount === 0
                ? "This series has no chapters yet."
                : `This takes ${chapterCount} chapter${
                    chapterCount === 1 ? "" : "s"
                  } and every translated line with it.`}{" "}
              It can&apos;t be undone.
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

        <div className="ch-dialog-body">
          <p className="ch-dialog-note">
            <AlertCircle className="h-4 w-4" aria-hidden="true" />
            Sanctioned earnings for its chapters disappear too. Only an Owner or
            Manager can do this.
          </p>

          <DangerConfirm
            phrase={series.title}
            value={typed}
            onChange={setTyped}
            label="Type"
          />

          {error ? (
            <p className="grp-form-error" role="alert">
              <AlertCircle className="h-4 w-4" />
              {error}
            </p>
          ) : null}
        </div>

        <footer className="grp-dialog-foot">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={onClose}
            autoFocus
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-sm ch-danger-btn"
            disabled={busy || !ready}
            onClick={() => void confirm()}
          >
            {busy ? "Deleting…" : "Delete series"}
          </button>
        </footer>
      </div>
    </div>
  );
}
