"use client";

import { useState } from "react";
import type { Chapter } from "@/lib/chapters";
import { useDialogA11y } from "@/lib/use-dialog";
import { AlertCircle, Trash, X } from "../icons";
import { DangerConfirm, matchesPhrase } from "../danger-confirm";

type DeleteChapterDialogProps = {
  chapter: Chapter;
  onClose: () => void;
  onConfirm: () => void;
};

/**
 * Delete confirm. Centred modal, focus lands on Cancel — deleting a chapter
 * takes its panels and every translated line with it.
 */
export function DeleteChapterDialog({
  chapter,
  onClose,
  onConfirm,
}: DeleteChapterDialogProps) {
  const panelRef = useDialogA11y(true, onClose);
  const [busy, setBusy] = useState(false);
  const [typed, setTyped] = useState("");

  const phrase = chapter.title?.trim() || `Chapter ${chapter.number}`;
  const ready = matchesPhrase(phrase, typed);

  return (
    <div className="grp-dialog-layer">
      <div className="grp-dialog-backdrop" onClick={onClose} aria-hidden="true" />
      <div
        className="grp-dialog ch-dialog ch-dialog--danger"
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-chapter-title"
        ref={panelRef}
        tabIndex={-1}
      >
        <header className="grp-dialog-head">
          <span className="grp-dialog-icon ch-dialog-icon--danger" aria-hidden="true">
            <Trash className="h-4 w-4" />
          </span>
          <div className="grp-dialog-heading">
            <p className="eyebrow">Delete</p>
            <h2 className="grp-dialog-title" id="delete-chapter-title">
              Delete {phrase}?
            </h2>
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
            Approved money from this chapter disappears with it.
          </p>

          <DangerConfirm
            phrase={phrase}
            value={typed}
            onChange={setTyped}
            label="Type"
          />
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
            onClick={() => {
              setBusy(true);
              onConfirm();
            }}
          >
            {busy ? "Deleting…" : "Delete chapter"}
          </button>
        </footer>
      </div>
    </div>
  );
}
