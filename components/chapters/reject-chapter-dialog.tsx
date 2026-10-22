"use client";

import { useState } from "react";
import type { Chapter } from "@/lib/chapters";
import { useDialogA11y } from "@/lib/use-dialog";
import { ArrowLeft, X } from "../icons";

const MAX_NOTE = 300;

type RejectChapterDialogProps = {
  chapter: Chapter;
  onClose: () => void;
  onReject: (note: string) => void;
};

/** Reject with an optional reason; the note is shown to the submitter. */
export function RejectChapterDialog({
  chapter,
  onClose,
  onReject,
}: RejectChapterDialogProps) {
  const panelRef = useDialogA11y(true, onClose);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <div className="grp-dialog-layer">
      <div className="grp-dialog-backdrop" onClick={onClose} aria-hidden="true" />
      <div
        className="grp-dialog ch-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="reject-chapter-title"
        ref={panelRef}
        tabIndex={-1}
      >
        <header className="grp-dialog-head">
          <span className="grp-dialog-icon" aria-hidden="true">
            <ArrowLeft className="h-4 w-4" />
          </span>
          <div className="grp-dialog-heading">
            <p className="eyebrow">Review</p>
            <h2 className="grp-dialog-title" id="reject-chapter-title">
              Reject Chapter {chapter.number}?
            </h2>
            <p className="grp-dialog-sub">
              It goes back to the submitter, who can edit and resubmit it.
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
          <label className="grp-field">
            <span className="grp-field-label">
              Why is this going back?{" "}
              <span className="grp-field-optional">optional</span>
            </span>
            <textarea
              className="grp-textarea"
              rows={3}
              value={note}
              maxLength={MAX_NOTE}
              data-autofocus
              onChange={(event) => setNote(event.target.value)}
              placeholder="e.g. Panel 4 reads as a threat — soften the line."
            />
            <span className="grp-field-count">
              {note.length}/{MAX_NOTE}
            </span>
          </label>
        </div>

        <footer className="grp-dialog-foot">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-sm ch-danger-btn"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              onReject(note);
            }}
          >
            {busy ? "Rejecting…" : "Reject chapter"}
          </button>
        </footer>
      </div>
    </div>
  );
}
