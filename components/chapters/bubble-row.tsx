"use client";

import { useEffect, useRef, useState } from "react";
import type { TextBlock } from "@/lib/chapters";

type BubbleRowProps = {
  block: TextBlock;
  /** 1-based position within the panel. */
  position: number;
  /** BCP-47 source language code for screen readers. */
  sourceLang?: string;
  editable: boolean;
  active: boolean;
  onActivate: () => void;
  onDeactivate: () => void;
  onPin: () => void;
  /**
   * Resolves `true` only when the text was persisted. The chip must not say
   * "Saved" for a write that failed — a translator who sees it will navigate
   * away believing the line is stored.
   */
  onSave: (text: string) => Promise<boolean>;
};

/**
 * One bubble: English first and editable, the original CJK muted underneath.
 * That order is deliberate — translators read the line they are fixing, not the
 * line they can't type.
 *
 * Saves on blur and Cmd/Ctrl+Enter; Enter inserts a newline; Escape reverts.
 */
export function BubbleRow({
  block,
  position,
  sourceLang = "und",
  editable,
  active,
  onActivate,
  onDeactivate,
  onPin,
  onSave,
}: BubbleRowProps) {
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const savedTimer = useRef<number | null>(null);
  const [draft, setDraft] = useState(block.finalText);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setDraft(block.finalText);
  }, [block.finalText, block.id]);

  useEffect(() => {
    const element = areaRef.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${element.scrollHeight}px`;
  }, [draft]);

  useEffect(() => {
    return () => {
      if (savedTimer.current) window.clearTimeout(savedTimer.current);
    };
  }, []);

  const flashSaved = () => {
    setSaved(true);
    if (savedTimer.current) window.clearTimeout(savedTimer.current);
    savedTimer.current = window.setTimeout(() => setSaved(false), 1500);
  };

  const commit = async () => {
    const next = draft.trim();
    if (next === block.finalText) return;
    const stored = await onSave(next);
    if (stored) {
      flashSaved();
    } else {
      // The write failed; put the editor back on the value the server holds so
      // the textarea cannot disagree with the database.
      setDraft(block.finalText);
    }
  };

  const lowConfidence =
    block.confidence !== null && block.confidence < 0.5;

  if (!editable) {
    return (
      <div
        className="ch-bubble"
        data-active={active ? "true" : "false"}
        data-low={lowConfidence ? "true" : "false"}
        onMouseEnter={onActivate}
        onMouseLeave={onDeactivate}
      >
        <span className="ch-bubble-index" aria-hidden="true">
          {position}
        </span>
        <div className="ch-bubble-body">
          <p className="ch-bubble-text">
            {block.finalText || (
              <span className="ch-bubble-placeholder">
                Type the English for this bubble…
              </span>
            )}
          </p>
          <p className="ch-bubble-source" lang={sourceLang}>
            {block.sourceText}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="ch-bubble"
      data-active={active ? "true" : "false"}
      data-low={lowConfidence ? "true" : "false"}
      title={
        lowConfidence
          ? "Low OCR confidence — check against the raw panel."
          : undefined
      }
      onMouseEnter={onActivate}
      onMouseLeave={onDeactivate}
      onClick={onPin}
    >
      <span className="ch-bubble-index" aria-hidden="true">
        {position}
      </span>
      <div className="ch-bubble-body">
        <textarea
          ref={areaRef}
          className="ch-bubble-field"
          value={draft}
          rows={1}
          spellCheck
          aria-label={`English for bubble ${position}`}
          placeholder="Type the English for this bubble…"
          onFocus={onActivate}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => {
            void commit();
            onDeactivate();
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              setDraft(block.finalText);
              event.currentTarget.blur();
              return;
            }
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              void commit();
            }
          }}
        />
        <p className="ch-bubble-source" lang={sourceLang}>
          {block.sourceText}
        </p>
        <div className="ch-bubble-meta">
          {block.isEdited ? <span className="chip">Edited</span> : null}
          {saved ? (
            <span className="ch-bubble-saved" role="status">
              Saved
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
