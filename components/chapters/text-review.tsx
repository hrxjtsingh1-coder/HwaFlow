"use client";

import type { TextBlock } from "@/lib/chapters";
import type { WorkspacePanel } from "@/lib/server/chapters";
import { Languages, ScanText } from "../icons";
import { BubbleRow } from "./bubble-row";

export function TextReview({
  panel,
  panelIndex,
  panelCount,
  blocks,
  sourceLanguage,
  editable,
  activeBlockId,
  onActiveBlock,
  onPinBlock,
  onSaveBlock,
}: {
  panel: WorkspacePanel | null;
  panelIndex: number;
  panelCount: number;
  blocks: TextBlock[];
  sourceLanguage: string;
  editable: boolean;
  activeBlockId: string | null;
  onActiveBlock: (id: string | null) => void;
  onPinBlock: (id: string) => void;
  onSaveBlock: (blockId: string, text: string) => Promise<boolean>;
}) {
  return (
    <section className="xs-text-review" aria-label="Editable imported text">
      <header className="xs-text-review-head">
        <div className="xs-text-review-title">
          <span className="xs-text-review-icon" aria-hidden="true">
            <Languages className="h-4 w-4" />
          </span>
          <div>
            <p className="xs-studio-eyebrow">HWAFlow · TEXT REVIEW</p>
            <h2>Imported lines</h2>
          </div>
        </div>
        <div className="xs-text-review-counts">
          <span>{blocks.length} line{blocks.length === 1 ? "" : "s"}</span>
          <span>{panelCount ? `Page ${panelIndex + 1} of ${panelCount}` : "No pages"}</span>
        </div>
      </header>

      <p className="xs-text-review-note">
        Translated lines stay editable here. Starting another run sends the
        original page images and series glossary only—never this text.
      </p>

      {!panel ? (
        <div className="xs-text-empty">
          <ScanText className="h-5 w-5" aria-hidden="true" />
          <p>Add a page before reviewing its text.</p>
        </div>
      ) : blocks.length === 0 ? (
        <div className="xs-text-empty">
          <ScanText className="h-5 w-5" aria-hidden="true" />
          <p>No imported lines on this page yet.</p>
          <span>Translated lines land here as soon as a run finishes. Each English line remains editable.</span>
        </div>
      ) : (
        <div className="xs-text-review-body">
          <div className="ch-bubble-list">
            {blocks.map((block, index) => (
              <BubbleRow
                key={block.id}
                block={block}
                position={index + 1}
                sourceLang={sourceLanguage}
                editable={editable}
                active={activeBlockId === block.id}
                onActivate={() => onActiveBlock(block.id)}
                onDeactivate={() => onActiveBlock(null)}
                onPin={() => onPinBlock(block.id)}
                onSave={(text) => onSaveBlock(block.id, text)}
              />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
