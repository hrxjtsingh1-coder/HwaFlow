"use client";

import { useRef, useState } from "react";
import { formatMB, MAX_CHAPTER_BYTES, MAX_CHAPTER_PAGES, MAX_PAGE_BYTES } from "@/lib/engine-limits";
import { Plus, UploadCloud } from "../icons";

export type UploadProgress = { current: number; total: number } | null;

type PanelDropzoneProps = {
  onFiles: (files: File[]) => void;
  busy: boolean;
  progress: UploadProgress;
  /** `drop` is the viewer's empty state; `button` is the studio's + Add panels. */
  variant?: "drop" | "button";
  disabled?: boolean;
  /** Pages left before the 20-page cap. `0` renders the locked state. */
  remaining?: number;
};

/**
 * Upload entry point. The caller validates and prepares each page at its
 * original pixel dimensions; this component only collects files and never
 * starts an engine run.
 */
export function PanelDropzone({
  onFiles,
  busy,
  progress,
  variant = "drop",
  disabled = false,
  remaining = MAX_CHAPTER_PAGES,
}: PanelDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  // Once the chapter holds the maximum, uploading is not offered at all — the
  // count is enforced on the server too, so this is the honest UI for it.
  const atCapacity = remaining <= 0;
  const locked = busy || disabled || atCapacity;

  const handleFiles = (list: FileList | null) => {
    if (!list || list.length === 0 || locked) return;
    onFiles(Array.from(list));
  };

  const progressLabel =
    progress && progress.total > 0
      ? `Preparing page ${Math.min(progress.current + 1, progress.total)} of ${progress.total}…`
      : "Preparing pages…";

  const input = (
    <input
      ref={inputRef}
      type="file"
      accept="image/png,image/jpeg,image/webp,image/avif,image/bmp,image/gif,image/tiff,.png,.jpg,.jpeg,.webp,.avif,.bmp,.gif,.tif,.tiff"
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
          className="cs-btn"
          onClick={() => inputRef.current?.click()}
          disabled={locked}
          title={
            atCapacity
              ? `This chapter already holds all ${MAX_CHAPTER_PAGES} pages. Remove one to add another.`
              : busy
                ? progressLabel
                : `Insert full-resolution pages after the panel you are looking at (${remaining} of ${MAX_CHAPTER_PAGES} left)`
          }
        >
          <Plus className="h-3 w-3" />
          {busy ? progressLabel : atCapacity ? "Chapter full" : "Add panels"}
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
        {busy
          ? progressLabel
          : atCapacity
            ? "This chapter is full"
            : "Drop raw pages here"}
      </p>
      {atCapacity ? (
        <p className="ch-dropzone-hint">
          All {MAX_CHAPTER_PAGES} pages are used. Delete a page to upload another — the
          cap is enforced on the server as well, so nothing can be added past it.
        </p>
      ) : (
        <>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => inputRef.current?.click()}
            disabled={locked}
          >
            or choose files
          </button>
          <p className="ch-dropzone-hint">
            PNG, JPG, WebP, AVIF, BMP, GIF, TIFF · {formatMB(MAX_PAGE_BYTES)} per page ·{" "}
            <strong>
              {remaining} of {MAX_CHAPTER_PAGES} pages left
            </strong>{" "}
            · {formatMB(MAX_CHAPTER_BYTES)} per chapter · every page is kept at full
            resolution and converted losslessly to PNG
          </p>
        </>
      )}
    </div>
  );
}
