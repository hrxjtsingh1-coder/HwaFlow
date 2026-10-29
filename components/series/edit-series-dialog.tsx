"use client";

import { useRef, useState, type FormEvent } from "react";
import type { Group } from "@/lib/groups";
import {
  SOURCE_LANGUAGES,
  SOURCE_LANGUAGE_LABELS,
  type SourceLanguage,
} from "@/lib/source-language";
import {
  MAX_SERIES_DESCRIPTION,
  MAX_SERIES_GENRE,
  MAX_SERIES_RATE,
  MAX_SERIES_TITLE,
  RELEASE_DAY_SHORT,
  validateSeriesTitle,
  type Series,
} from "@/lib/series";
import { updateSeriesAction } from "@/lib/series-actions";
import { useDialogA11y } from "@/lib/use-dialog";
import { AlertCircle, Settings, X } from "../icons";
import { SeriesCoverField } from "../groups/series-cover-field";

const GENRE_SUGGESTIONS = [
  "Action",
  "Adventure",
  "Comedy",
  "Drama",
  "Fantasy",
  "Horror",
  "Isekai",
  "Mystery",
  "Romance",
  "Sci-Fi",
  "Slice of Life",
  "Thriller",
];

type EditSeriesDialogProps = {
  series: Series;
  group: Group;
  onClose: () => void;
  onSaved: (series: Series) => void;
};

/**
 * Owner/Manager edit surface. The rate lives here as well as on create, because
 * a rate that can only be set once is a rate nobody sets.
 */
export function EditSeriesDialog({
  series,
  group,
  onClose,
  onSaved,
}: EditSeriesDialogProps) {
  const panelRef = useDialogA11y(true, onClose);
  const titleRef = useRef<HTMLInputElement>(null);
  const firstDayRef = useRef<HTMLButtonElement>(null);

  const [title, setTitle] = useState(series.title);
  const [coverDataUrl, setCoverDataUrl] = useState<string | null>(
    series.coverDataUrl
  );
  const [genre, setGenre] = useState(series.genre ?? "");
  const [description, setDescription] = useState(series.description ?? "");
  const [language, setLanguage] = useState<SourceLanguage>(series.language);
  const [releaseDays, setReleaseDays] = useState<number[]>(
    series.releaseDays
  );
  const [rate, setRate] = useState(
    series.rateAmount > 0 ? String(series.rateAmount) : ""
  );
  const [coverBusy, setCoverBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || coverBusy) return;
    setError(null);

    const titleError = validateSeriesTitle(title);
    if (titleError) {
      setError(titleError);
      titleRef.current?.focus();
      return;
    }
    if (releaseDays.length === 0) {
      setError("Pick at least one release day.");
      firstDayRef.current?.focus();
      return;
    }

    setBusy(true);
    try {
      const result = await updateSeriesAction({
        seriesId: series.id,
        title,
        genre,
        description,
        coverDataUrl,
        releaseDays,
        language,
        rateAmount: rate.trim() === "" ? 0 : Number(rate),
      });

      if (!result.ok) {
        setError(result.message);
        return;
      }

      onSaved(result.data);
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grp-dialog-layer">
      <div className="grp-dialog-backdrop" onClick={onClose} aria-hidden="true" />
      <div
        className="grp-dialog grp-dialog--series"
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-series-title"
        ref={panelRef}
        tabIndex={-1}
      >
        <header className="grp-dialog-head">
          <span className="grp-dialog-icon" aria-hidden="true">
            <Settings className="h-4 w-4" />
          </span>
          <div className="grp-dialog-heading">
            <p className="eyebrow">Edit series</p>
            <h2 className="grp-dialog-title" id="edit-series-title">
              {series.title}
            </h2>
            <p className="grp-dialog-sub">
              {group.name} · new rates apply to chapters submitted from now on.
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

        <form className="grp-form" onSubmit={handleSubmit}>
          <div className="grp-form-body">
            <label className="grp-field">
              <span className="grp-field-label">
                Title <span className="grp-field-required">required</span>
              </span>
              <input
                className="grp-input"
                data-autofocus
                ref={titleRef}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                maxLength={MAX_SERIES_TITLE}
                autoComplete="off"
              />
            </label>

            <SeriesCoverField
              value={coverDataUrl}
              title={title}
              onChange={setCoverDataUrl}
              onBusyChange={setCoverBusy}
              disabled={busy}
            />

            <label className="grp-field">
              <span className="grp-field-label">
                Genre <span className="grp-field-optional">optional</span>
              </span>
              <input
                className="grp-input"
                list="edit-series-genre-suggestions"
                value={genre}
                onChange={(event) => setGenre(event.target.value)}
                maxLength={MAX_SERIES_GENRE}
                autoComplete="off"
              />
              <datalist id="edit-series-genre-suggestions">
                {GENRE_SUGGESTIONS.map((option) => (
                  <option value={option} key={option} />
                ))}
              </datalist>
            </label>

            <label className="grp-field">
              <span className="grp-field-label">
                Description{" "}
                <span className="grp-field-optional">optional</span>
              </span>
              <textarea
                className="grp-textarea"
                rows={4}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                maxLength={MAX_SERIES_DESCRIPTION}
              />
              <span className="grp-field-count">
                {description.length}/{MAX_SERIES_DESCRIPTION}
              </span>
            </label>

            <label className="grp-field">
              <span className="grp-field-label">
                Source language <span className="grp-field-required">required</span>
              </span>
              <select
                className="grp-input"
                value={language}
                onChange={(event) =>
                  setLanguage(event.target.value as SourceLanguage)
                }
                disabled={busy}
              >
                {SOURCE_LANGUAGES.map((code) => (
                  <option key={code} value={code}>
                    {SOURCE_LANGUAGE_LABELS[code]}
                  </option>
                ))}
              </select>
              <span className="grp-field-count">
                Changing this applies to the next XianScan run, not to imported
                text already in a chapter.
              </span>
            </label>

            <div className="grp-field">
              <span className="grp-field-label" id="edit-release-day-label">
                Release days <span className="grp-field-required">required</span>
              </span>
              <div
                className="grp-day-picker"
                role="group"
                aria-labelledby="edit-release-day-label"
              >
                {RELEASE_DAY_SHORT.map((label, index) => {
                  const active = releaseDays.includes(index);
                  return (
                    <button
                      type="button"
                      key={label}
                      ref={index === 0 ? firstDayRef : undefined}
                      aria-pressed={active}
                      data-active={active ? "true" : "false"}
                      className="grp-day-option"
                      onClick={() =>
                        setReleaseDays((current) =>
                          current.includes(index)
                            ? current.filter((day) => day !== index)
                            : [...current, index].sort((a, b) => a - b)
                        )
                      }
                      disabled={busy}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              <span className="grp-field-count">
                Pick every day it releases. A series appears in each matching
                lane.
              </span>
            </div>

            <label className="grp-field">
              <span className="grp-field-label">
                Rate per approved chapter{" "}
                <span className="grp-field-optional">optional</span>
              </span>
              <span className="ch-rate-field">
                <span className="ch-rate-currency" aria-hidden="true">
                  {group.currency}
                </span>
                <input
                  className="grp-input ch-rate-input"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={MAX_SERIES_RATE}
                  step="0.01"
                  value={rate}
                  onChange={(event) => setRate(event.target.value)}
                  placeholder="0.00"
                  disabled={busy}
                />
              </span>
              <span className="grp-field-count">
                Snapshotted when a chapter is submitted, so editing it never
                rewrites approved earnings.
              </span>
            </label>

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
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary btn-sm"
              disabled={busy || coverBusy}
            >
              {busy
                ? "Saving…"
                : coverBusy
                  ? "Preparing cover…"
                  : "Save changes"}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
