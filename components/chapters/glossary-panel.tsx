"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  GLOSSARY_CATEGORIES,
  GLOSSARY_CATEGORY_LABEL,
  GlossaryError,
  MAX_TERM_LENGTH,
  addManualTerm,
  dismissTerm,
  restoreTerm,
  updateTerm,
  type GlossaryCategory,
  type GlossaryTerm,
} from "@/lib/glossary";
import { AlertCircle, Plus, X } from "../icons";

type Filter = "all" | "auto" | "manual";

type GlossaryPanelProps = {
  seriesId: string;
  /** Active terms only — dismissed ones are filtered by the parent store read. */
  terms: GlossaryTerm[];
  canEdit: boolean;
  actor: string;
  onNotice: (tone: "success" | "error", text: string) => void;
};

/**
 * Glossary tab of the chapter rail.
 *
 * Provenance is visible on every row: `Auto` is muted, `Manual` is accent. The
 * pipeline may never overwrite a manual term, and an auto term only stays auto
 * until a person edits it.
 */
export function GlossaryPanel({
  seriesId,
  terms,
  canEdit,
  actor,
  onNotice,
}: GlossaryPanelProps) {
  const [filter, setFilter] = useState<Filter>("all");
  const [adding, setAdding] = useState(false);
  const [source, setSource] = useState("");
  const [target, setTarget] = useState("");
  const [category, setCategory] = useState<GlossaryCategory>("character");
  const [formError, setFormError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [undo, setUndo] = useState<{ id: string; term: string } | null>(null);
  const undoTimer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (undoTimer.current) window.clearTimeout(undoTimer.current);
    };
  }, []);

  const visible = terms.filter((term) =>
    filter === "all" ? true : term.origin === filter
  );

  const resetForm = () => {
    setSource("");
    setTarget("");
    setCategory("character");
    setFormError(null);
    setAdding(false);
  };

  const handleAdd = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);
    try {
      const created = addManualTerm({
        seriesId,
        sourceTerm: source,
        targetTerm: target,
        category,
        actor,
      });
      resetForm();
      onNotice("success", `${created.sourceTerm} added to the glossary.`);
    } catch (error) {
      setFormError(
        error instanceof GlossaryError
          ? error.message
          : "Something went wrong. Try again."
      );
    }
  };

  const commitEdit = (term: GlossaryTerm) => {
    const next = editDraft.trim();
    setEditingId(null);
    if (!next || next === term.targetTerm) return;
    try {
      updateTerm({ termId: term.id, targetTerm: next, actor });
      onNotice("success", "Term updated.");
    } catch (error) {
      onNotice(
        "error",
        error instanceof GlossaryError
          ? error.message
          : "Something went wrong. Try again."
      );
    }
  };

  const handleDismiss = (term: GlossaryTerm) => {
    try {
      dismissTerm(term.id, actor);
      setUndo({ id: term.id, term: term.sourceTerm });
      if (undoTimer.current) window.clearTimeout(undoTimer.current);
      undoTimer.current = window.setTimeout(() => setUndo(null), 5000);
    } catch (error) {
      onNotice(
        "error",
        error instanceof GlossaryError
          ? error.message
          : "Something went wrong. Try again."
      );
    }
  };

  const handleUndo = () => {
    if (!undo) return;
    try {
      restoreTerm(undo.id, actor);
      onNotice("success", `${undo.term} restored.`);
    } catch {
      onNotice("error", "Couldn't restore that term.");
    }
    setUndo(null);
    if (undoTimer.current) window.clearTimeout(undoTimer.current);
  };

  return (
    <div className="ch-glossary">
      <div className="ch-glossary-head">
        <div className="ch-filter" role="group" aria-label="Filter glossary terms">
          {(["all", "auto", "manual"] as Filter[]).map((value) => (
            <button
              key={value}
              type="button"
              className="ch-filter-chip"
              data-active={filter === value ? "true" : "false"}
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
            >
              {value === "all" ? "All" : value === "auto" ? "Auto" : "Manual"}
            </button>
          ))}
        </div>

        {canEdit ? (
          <button
            type="button"
            className="btn btn-ghost btn-sm ch-glossary-add"
            onClick={() => setAdding((open) => !open)}
            aria-expanded={adding}
          >
            <Plus className="h-3.5 w-3.5" />
            Add term
          </button>
        ) : null}
      </div>

      {adding ? (
        <form className="ch-term-form" onSubmit={handleAdd}>
          <label className="ch-field">
            <span className="ch-field-label">Source term</span>
            <input
              className="grp-input"
              value={source}
              onChange={(event) => setSource(event.target.value)}
              maxLength={MAX_TERM_LENGTH}
              placeholder="지훈"
              data-autofocus
              autoComplete="off"
            />
          </label>
          <label className="ch-field">
            <span className="ch-field-label">English</span>
            <input
              className="grp-input"
              value={target}
              onChange={(event) => setTarget(event.target.value)}
              maxLength={MAX_TERM_LENGTH}
              placeholder="Jihun"
              autoComplete="off"
            />
          </label>
          <label className="ch-field">
            <span className="ch-field-label">Category</span>
            <select
              className="grp-input"
              value={category}
              onChange={(event) =>
                setCategory(event.target.value as GlossaryCategory)
              }
            >
              {GLOSSARY_CATEGORIES.map((value) => (
                <option key={value} value={value}>
                  {GLOSSARY_CATEGORY_LABEL[value]}
                </option>
              ))}
            </select>
          </label>

          {formError ? (
            <p className="grp-form-error" role="alert">
              <AlertCircle className="h-4 w-4" />
              {formError}
            </p>
          ) : null}

          <div className="ch-term-form-actions">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={resetForm}
            >
              Cancel
            </button>
            <button type="submit" className="btn btn-primary btn-sm">
              Save
            </button>
          </div>
        </form>
      ) : null}

      {visible.length === 0 ? (
        <p className="ch-glossary-empty">
          {terms.length === 0
            ? "No glossary terms yet. Run the translation tool and they'll appear here, or add one by hand."
            : `No ${filter} terms.`}
        </p>
      ) : (
        <ul className="ch-term-list">
          {visible.map((term) => (
            <li className="ch-term" key={term.id}>
              <span className="chip ch-term-cat">
                {GLOSSARY_CATEGORY_LABEL[term.category]}
              </span>

              {editingId === term.id ? (
                <input
                  className="ch-term-edit"
                  value={editDraft}
                  autoFocus
                  maxLength={MAX_TERM_LENGTH}
                  aria-label={`English for ${term.sourceTerm}`}
                  onChange={(event) => setEditDraft(event.target.value)}
                  onBlur={() => commitEdit(term)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      commitEdit(term);
                    }
                    if (event.key === "Escape") {
                      event.preventDefault();
                      setEditingId(null);
                    }
                  }}
                />
              ) : (
                <button
                  type="button"
                  className="ch-term-main"
                  disabled={!canEdit}
                  onClick={() => {
                    if (!canEdit) return;
                    setEditingId(term.id);
                    setEditDraft(term.targetTerm);
                  }}
                  title={
                    canEdit
                      ? "Click to edit the English term"
                      : "You can't edit this glossary"
                  }
                >
                  <span className="ch-term-source">{term.sourceTerm}</span>
                  <span className="ch-term-arrow" aria-hidden="true">
                    →
                  </span>
                  <span className="ch-term-target">{term.targetTerm}</span>
                </button>
              )}

              <span
                className={`chip ch-term-origin${
                  term.origin === "manual" ? " chip-accent" : ""
                }`}
              >
                {term.origin === "manual" ? "Manual" : "Auto"}
              </span>

              {canEdit && term.origin === "auto" ? (
                <button
                  type="button"
                  className="ch-term-dismiss"
                  onClick={() => handleDismiss(term)}
                  aria-label={`Dismiss ${term.sourceTerm}`}
                  title="Dismiss this auto term"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {undo ? (
        <div className="ch-undo" role="status">
          <span>{undo.term} dismissed</span>
          <button type="button" onClick={handleUndo}>
            Undo
          </button>
        </div>
      ) : null}
    </div>
  );
}
