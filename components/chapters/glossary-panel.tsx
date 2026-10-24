"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  addGlossaryTermAction,
  setGlossaryStatusAction,
  updateGlossaryTermAction,
} from "@/lib/glossary-actions";
import {
  GLOSSARY_CATEGORIES,
  GLOSSARY_CATEGORY_LABEL,
  MAX_TERM_LENGTH,
  type GlossaryCategory,
  type GlossaryTerm,
} from "@/lib/glossary";
import { AlertCircle, Plus, X } from "../icons";
import { Tooltip } from "../tooltip";

type Filter = "all" | "auto" | "manual";

type GlossaryPanelProps = {
  seriesId: string;
  /** Active terms only — dismissed ones are filtered by the server read. */
  terms: GlossaryTerm[];
  canEdit: boolean;
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
  onNotice,
}: GlossaryPanelProps) {
  const router = useRouter();
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

  const handleAdd = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);

    const result = await addGlossaryTermAction({
      seriesId,
      sourceTerm: source,
      targetTerm: target,
      category,
    });

    if (!result.ok) {
      setFormError(result.message);
      return;
    }

    resetForm();
    onNotice("success", `${result.data.sourceTerm} added to the glossary.`);
    router.refresh();
  };

  const commitEdit = async (term: GlossaryTerm) => {
    const next = editDraft.trim();
    setEditingId(null);
    if (!next || next === term.targetTerm) return;

    const result = await updateGlossaryTermAction({
      termId: term.id,
      targetTerm: next,
      category: term.category,
    });

    if (!result.ok) {
      onNotice("error", result.message);
      return;
    }

    onNotice("success", "Term updated.");
    router.refresh();
  };

  const handleDismiss = async (term: GlossaryTerm) => {
    const result = await setGlossaryStatusAction({
      termId: term.id,
      status: "dismissed",
    });

    if (!result.ok) {
      onNotice("error", result.message);
      return;
    }

    setUndo({ id: term.id, term: term.sourceTerm });
    if (undoTimer.current) window.clearTimeout(undoTimer.current);
    undoTimer.current = window.setTimeout(() => setUndo(null), 5000);
    router.refresh();
  };

  const handleUndo = async () => {
    if (!undo) return;

    const result = await setGlossaryStatusAction({
      termId: undo.id,
      status: "active",
    });

    if (!result.ok) {
      onNotice("error", result.message);
    } else {
      onNotice("success", `${undo.term} restored.`);
      router.refresh();
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
                <Tooltip label="Dismiss this auto term">
                  <button
                    type="button"
                    className="ch-term-dismiss"
                    onClick={() => handleDismiss(term)}
                    aria-label={`Dismiss ${term.sourceTerm}`}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </Tooltip>
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
