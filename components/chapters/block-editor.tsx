"use client";

import { useEffect, useRef } from "react";
import type { Panel, TextBlock } from "@/lib/chapters";
import { ArrowLeft, ArrowRight, Languages } from "../icons";
import { BubbleRow } from "./bubble-row";

type BlockEditorProps = {
  panel: Panel | null;
  panelIndex: number;
  panelCount: number;
  blocks: TextBlock[];
  editable: boolean;
  activeBlockId: string | null;
  onActiveBlock: (id: string | null) => void;
  onPinBlock: (id: string) => void;
  onSaveBlock: (blockId: string, text: string) => void;
  onPrev: () => void;
  onNext: () => void;
  running: boolean;
  stageHint: string | null;
  hasPanels: boolean;
  /** This panel's state in the current run — "failed" turns the column red. */
  panelState?: string;
  onRetry?: () => void;
};

/**
 * Centre column: the panel heading, the bubbles for the current panel only, and
 * the two panel arrows.
 *
 * The arrows are discrete — no wrap, disabled at the ends — and `[` / `]` do the
 * same thing, documented in each button's title.
 */
export function BlockEditor({
  panel,
  panelIndex,
  panelCount,
  blocks,
  editable,
  activeBlockId,
  onActiveBlock,
  onPinBlock,
  onSaveBlock,
  onPrev,
  onNext,
  running,
  stageHint,
  hasPanels,
  panelState,
  onRetry,
}: BlockEditorProps) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = 0;
  }, [panel?.id]);

  const atStart = panelIndex <= 0;
  const atEnd = panelIndex >= panelCount - 1;
  const failed = panelState === "failed";

  return (
    <div className="ch-editor" data-failed={failed ? "true" : "false"}>
      <div className="ch-editor-head">
        <p className="ch-editor-title">
          {hasPanels ? `Panel ${panelIndex + 1} of ${panelCount}` : "Panels"}
        </p>
        {running && stageHint ? (
          <span className="ch-editor-stage">
            <Languages className="h-3.5 w-3.5" aria-hidden="true" />
            {stageHint}
          </span>
        ) : null}
      </div>

      <div className="ch-editor-body" ref={listRef}>
        {failed ? (
          <div className="ch-editor-failed" role="alert">
            <p>
              This panel couldn&apos;t be read. The rest of the chapter is
              untouched — retry the failed group to try again.
            </p>
            {onRetry ? (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={onRetry}
              >
                Retry
              </button>
            ) : null}
          </div>
        ) : null}

        {!hasPanels ? (
          <div className="ch-editor-empty">
            <p>Upload raw panels to start this chapter.</p>
          </div>
        ) : blocks.length === 0 ? (
          <div className="ch-editor-empty">
            <p>No text yet. Hit Run translation above the raw panel.</p>
          </div>
        ) : (
          <div className="ch-bubble-list">
            {blocks.map((block, index) => (
              <BubbleRow
                key={block.id}
                block={block}
                position={index + 1}
                editable={editable}
                active={activeBlockId === block.id}
                onActivate={() => onActiveBlock(block.id)}
                onDeactivate={() => onActiveBlock(null)}
                onPin={() => onPinBlock(block.id)}
                onSave={(text) => onSaveBlock(block.id, text)}
              />
            ))}
          </div>
        )}
      </div>

      {hasPanels ? (
        <>
          <button
            type="button"
            className="ch-panel-arrow ch-panel-arrow--prev"
            onClick={onPrev}
            disabled={atStart}
            aria-label="Previous panel"
            title="Previous panel ( [ )"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="ch-panel-arrow ch-panel-arrow--next"
            onClick={onNext}
            disabled={atEnd}
            aria-label="Next panel"
            title="Next panel ( ] )"
          >
            <ArrowRight className="h-4 w-4" />
          </button>
        </>
      ) : null}
    </div>
  );
}
