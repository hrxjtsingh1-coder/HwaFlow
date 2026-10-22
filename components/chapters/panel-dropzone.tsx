"use client";

import { useRef, useState } from "react";
import { Plus, UploadCloud } from "../icons";

export type UploadProgress = { current: number; total: number } | null;

type PanelDropzoneProps = {
  onFiles: (files: File[]) => void;
  busy: boolean;
  progress: UploadProgress;
  /** `drop` is the viewer's empty state; `button` is the header's + Add panels. */
  variant?: "drop" | "button";
  disabled?: boolean;
};

/**
 * Upload entry point. Compression happens in the caller, one file at a time, so
 * this component only collects files — and never starts a run.
 */
export function PanelDropzone({
  onFiles,
  busy,
  progress,
  variant = "drop",
  disabled = false,
}: PanelDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const locked = busy || disabled;

  const handleFiles = (list: FileList | null) => {
    if (!list || list.length === 0 || locked) return;
    onFiles(Array.from(list));
  };

  const progressLabel =
    progress && progress.total > 0
      ? `Preparing panel ${Math.min(progress.current + 1, progress.total)} of ${progress.total}…`
      : "Preparing panels…";

  const input = (
    <input
      ref={inputRef}
      type="file"
      accept="image/*"
      multiple
      className="ch-file-input"
      disabled={locked}
      onChange={(event) => {
        handleFiles(event.target.files);
        event.target.value = "";
      }}
    />
  );

  if (variant === "button") {
    return (
      <>
        {input}
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => inputRef.current?.click()}
          disabled={locked}
          title={busy ? progressLabel : "Add another panel sequence"}
        >
          <Plus className="h-3.5 w-3.5" />
          {busy ? progressLabel : "Add panels"}
        </button>
      </>
    );
  }

  return (
    <div
      className="ch-dropzone"
      data-dragging={dragging ? "true" : "false"}
      data-busy={busy ? "true" : "false"}
      onDragOver={(event) => {
        event.preventDefault();
        if (!locked) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        handleFiles(event.dataTransfer.files);
      }}
    >
      {input}
      <span className="ch-dropzone-icon" aria-hidden="true">
        <UploadCloud className="h-5 w-5" />
      </span>
      <p className="ch-dropzone-title">
        {busy ? progressLabel : "Drop raw panels here"}
      </p>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        onClick={() => inputRef.current?.click()}
        disabled={locked}
      >
        or choose files
      </button>
      <p className="ch-dropzone-hint">
        PNG, JPG or WebP · up to 10 MB each · panels are added in selection order
      </p>
    </div>
  );
}
