"use client";

import { useRef, useState } from "react";
import {
  MAX_SERIES_COVER_SOURCE_BYTES,
  SeriesCoverError,
  uploadSeriesCover,
} from "@/lib/series-cover";
import { UploadCloud, X } from "../icons";
import { SeriesCover } from "./series-cover";

type SeriesCoverFieldProps = {
  value: string | null;
  title: string;
  onChange: (value: string | null) => void;
  disabled?: boolean;
  onBusyChange?: (busy: boolean) => void;
};

export function SeriesCoverField({
  value,
  title,
  onChange,
  disabled = false,
  onBusyChange,
}: SeriesCoverFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateBusy = (next: boolean) => {
    setBusy(next);
    onBusyChange?.(next);
  };

  const handleFile = async (file: File) => {
    if (disabled || busy) return;
    setError(null);

    if (!file.type.startsWith("image/")) {
      setError("Pick an image file — PNG, JPG, or WebP.");
      return;
    }
    if (file.size > MAX_SERIES_COVER_SOURCE_BYTES) {
      setError("That image is over 5 MB. Pick a smaller file.");
      return;
    }

    updateBusy(true);
    try {
      const dataUrl = await uploadSeriesCover(file);
      onChange(dataUrl);
    } catch (caught) {
      setError(
        caught instanceof SeriesCoverError
          ? caught.message
          : "We couldn't read that image. Try another file."
      );
    } finally {
      updateBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div
      className="grp-cover-field"
      data-dragging={dragging ? "true" : "false"}
      onDragOver={(event) => {
        event.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        const file = event.dataTransfer.files?.[0];
        if (file) void handleFile(file);
      }}
    >
      <div className="grp-cover-preview">
        <SeriesCover
          title={title.trim() || "New series"}
          coverDataUrl={value}
          size="md"
        />
      </div>

      <div className="grp-cover-copy">
        <span className="grp-field-label">
          Cover <span className="grp-field-optional">optional</span>
        </span>
        <p className="grp-field-hint">
          Portrait works best. We crop to 2:3 and compress the file. Without a
          cover we use a generated pastel one from the title.
        </p>

        <div className="grp-cover-actions">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => inputRef.current?.click()}
            disabled={disabled || busy}
          >
            <UploadCloud className="h-3.5 w-3.5" />
            {busy ? "Preparing cover…" : value ? "Replace cover" : "Upload cover"}
          </button>

          {value ? (
            <button
              type="button"
              className="grp-text-btn"
              onClick={() => {
                setError(null);
                onChange(null);
              }}
              disabled={disabled || busy}
            >
              <X className="h-3.5 w-3.5" />
              Remove
            </button>
          ) : null}
        </div>

        {busy ? (
          <p className="grp-field-hint" aria-live="polite">
            Compressing the cover…
          </p>
        ) : null}
        {error ? (
          <p className="grp-field-error" role="alert">
            {error}
          </p>
        ) : null}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="grp-visually-hidden"
        tabIndex={-1}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void handleFile(file);
        }}
      />
    </div>
  );
}
