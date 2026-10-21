"use client";

import { useRef, useState, type DragEvent } from "react";
import { GroupIconError, uploadGroupIcon } from "@/lib/group-icon";
import { groupAccent, groupMonogram } from "@/lib/groups";
import { UploadCloud, X } from "../icons";

type GroupIconFieldProps = {
  id: string;
  /** Used for the monogram fallback preview. */
  name: string;
  value: string | null;
  onChange: (value: string | null) => void;
  disabled?: boolean;
};

export function GroupIconField({
  id,
  name,
  value,
  onChange,
  disabled,
}: GroupIconFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const readFile = async (file: File | undefined) => {
    if (!file || disabled) return;
    setError(null);
    setBusy(true);
    try {
      const dataUrl = await uploadGroupIcon(file);
      onChange(dataUrl);
    } catch (caught) {
      setError(
        caught instanceof GroupIconError
          ? caught.message
          : "We couldn't process that image. Try another file."
      );
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    void readFile(event.dataTransfer.files[0]);
  };

  return (
    <div className="admin-field">
      <span className="admin-field-label" id={`${id}-label`}>
        Group icon <span className="admin-field-optional">optional</span>
      </span>

      <div
        className="admin-icon-row"
        data-dragging={dragging ? "true" : "false"}
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <button
          type="button"
          className="admin-icon-drop"
          onClick={() => inputRef.current?.click()}
          disabled={disabled || busy}
          aria-labelledby={`${id}-label`}
          aria-describedby={`${id}-hint`}
        >
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt="Selected group icon preview" />
          ) : (
            <span
              className="admin-icon-monogram"
              data-accent={groupAccent(name || "Group")}
            >
              {groupMonogram(name || "Group")}
            </span>
          )}
          {busy ? (
            <span className="admin-icon-busy" aria-hidden="true">
              <span className="admin-spinner" />
            </span>
          ) : null}
        </button>

        <div className="admin-icon-copy">
          <div className="admin-icon-actions">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => inputRef.current?.click()}
              disabled={disabled || busy}
            >
              <UploadCloud className="h-3.5 w-3.5" />
              {value ? "Replace" : "Upload image"}
            </button>
            {value ? (
              <button
                type="button"
                className="admin-link-btn admin-link-btn--quiet"
                onClick={() => {
                  setError(null);
                  onChange(null);
                }}
                disabled={disabled || busy}
              >
                <X className="h-3 w-3" />
                Remove
              </button>
            ) : null}
          </div>
          <p className="admin-field-hint" id={`${id}-hint`}>
            {busy
              ? "Compressing…"
              : "PNG, JPG or WebP, up to 5 MB. We crop it square and store a 256×256 version."}
          </p>
        </div>
      </div>

      <input
        ref={inputRef}
        id={id}
        type="file"
        accept="image/*"
        className="admin-visually-hidden"
        onChange={(event) => void readFile(event.target.files?.[0])}
        disabled={disabled}
        tabIndex={-1}
      />

      {error ? (
        <p className="admin-field-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
