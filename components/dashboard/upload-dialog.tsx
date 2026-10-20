"use client";

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type MouseEvent,
} from "react";
import { seriesList, type SourceLanguage } from "@/lib/dashboard-data";
import {
  ArrowRight,
  ChevronDown,
  Sparkles,
  UploadCloud,
  X,
} from "../icons";

export type UploadInput = {
  series: string;
  chapter: number;
  language: SourceLanguage;
  pages: number;
};

type UploadDialogProps = {
  open: boolean;
  onClose: () => void;
  onSubmit: (input: UploadInput) => void;
};

export function UploadDialog({ open, onClose, onSubmit }: UploadDialogProps) {
  const [series, setSeries] = useState(seriesList[0]?.title ?? "");
  const [chapter, setChapter] = useState("");
  const [language, setLanguage] = useState<SourceLanguage>(
    seriesList[0]?.source ?? "Korean"
  );
  const [files, setFiles] = useState<File[]>([]);

  const firstFieldRef = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    if (!open) return;

    setSeries(seriesList[0]?.title ?? "");
    setChapter("");
    setLanguage(seriesList[0]?.source ?? "Korean");
    setFiles([]);

    const timer = window.setTimeout(() => firstFieldRef.current?.focus(), 60);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const chapterNumber = Number(chapter);
  const canSubmit =
    Boolean(series) &&
    Number.isFinite(chapterNumber) &&
    chapterNumber > 0 &&
    files.length > 0;

  const handleSeriesChange = (value: string) => {
    setSeries(value);
    const match = seriesList.find((item) => item.title === value);
    if (match) setLanguage(match.source);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit) return;

    onSubmit({
      series,
      chapter: chapterNumber,
      language,
      pages: Math.max(files.length, 1),
    });
  };

  const handleBackdrop = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) onClose();
  };

  return (
    <div className="dash-modal-overlay" onMouseDown={handleBackdrop}>
      <div
        className="dash-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="upload-title"
      >
        <div className="dash-modal-head">
          <div className="dash-modal-heading">
            <span className="dash-modal-icon" aria-hidden="true">
              <UploadCloud className="h-[18px] w-[18px]" />
            </span>
            <div>
              <p className="eyebrow">New chapter</p>
              <h2 className="dash-modal-title" id="upload-title">
                Upload a chapter
              </h2>
            </div>
          </div>
          <button
            type="button"
            className="dash-icon-btn"
            onClick={onClose}
            aria-label="Close upload dialog"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="dash-modal-copy">
          Drop in the raw pages. HwaFlow reads the panels, translates them, and
          puts the chapter in your review queue.
        </p>

        <form className="dash-form" onSubmit={handleSubmit}>
          <div className="dash-form-grid">
            <label className="dash-field">
              <span>Series</span>
              <span className="dash-select-wrap">
                <select
                  ref={firstFieldRef}
                  className="dash-select"
                  value={series}
                  onChange={(event) => handleSeriesChange(event.target.value)}
                >
                  {seriesList.map((item) => (
                    <option key={item.id} value={item.title}>
                      {item.title}
                    </option>
                  ))}
                </select>
                <ChevronDown className="dash-select-icon h-3.5 w-3.5" />
              </span>
            </label>

            <label className="dash-field">
              <span>Chapter</span>
              <input
                className="dash-input"
                type="number"
                min={1}
                inputMode="numeric"
                placeholder="42"
                value={chapter}
                onChange={(event) => setChapter(event.target.value)}
              />
            </label>
          </div>

          <label className="dash-field">
            <span>Source language</span>
            <span className="dash-select-wrap">
              <select
                className="dash-select"
                value={language}
                onChange={(event) =>
                  setLanguage(event.target.value as SourceLanguage)
                }
              >
                <option value="Korean">Korean</option>
                <option value="Japanese">Japanese</option>
                <option value="Chinese">Chinese</option>
              </select>
              <ChevronDown className="dash-select-icon h-3.5 w-3.5" />
            </span>
          </label>

          <label
            className="dash-drop"
            data-has-files={files.length > 0 ? "true" : "false"}
          >
            <input
              className="dash-drop-input"
              type="file"
              accept="image/*,.pdf,.zip,.cbz"
              multiple
              onChange={(event) =>
                setFiles(Array.from(event.target.files ?? []))
              }
            />
            <span className="dash-drop-icon" aria-hidden="true">
              <UploadCloud className="h-5 w-5" />
            </span>
            <span className="dash-drop-title">
              {files.length > 0
                ? `${files.length} file${files.length === 1 ? "" : "s"} ready`
                : "Drop pages here, or choose files"}
            </span>
            <span className="dash-drop-hint">
              {files.length > 0
                ? files
                    .slice(0, 3)
                    .map((file) => file.name)
                    .join(" · ")
                : "PNG, JPG, PDF, or CBZ · up to 80 pages"}
            </span>
          </label>

          <div className="dash-modal-actions">
            <p className="dash-modal-note">
              <Sparkles className="h-3.5 w-3.5" />
              Runs in the background — close the tab if you need to.
            </p>
            <div className="dash-modal-buttons">
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
                disabled={!canSubmit}
              >
                Queue chapter
                <ArrowRight className="btn-icon h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
