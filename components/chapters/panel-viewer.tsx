"use client";

import { useEffect, useState } from "react";
import type { Panel, TextBlock } from "@/lib/chapters";
import type { RunState } from "@/lib/pipeline";
import { useDialogA11y } from "@/lib/use-dialog";
import {
  ArrowLeft,
  ArrowRight,
  ScanText,
  Wand,
  X,
} from "../icons";
import { PanelDropzone, type UploadProgress } from "./panel-dropzone";
import { RunProgress } from "./run-progress";
import { Tooltip } from "../tooltip";

type PanelViewerProps = {
  panel: Panel | null;
  panelIndex: number;
  panelCount: number;
  blocks: TextBlock[];
  activeBlockId: string | null;
  run: RunState;
  canRun: boolean;
  canRunReason: string | null;
  onRun: () => void;
  onCancel: () => void;
  onRetry: () => void;
  onUpload: (files: File[]) => void;
  uploadBusy: boolean;
  uploadProgress: UploadProgress;
  showBoxes: boolean;
  onToggleBoxes: (next: boolean) => void;
  onPrevPanel: () => void;
  onNextPanel: () => void;
};

/**
 * Right column: the raw art, the boxes that link it to the bubble list, and the
 * one control that starts work — `Run translation`.
 *
 * Boxes are decorative (`aria-hidden`, `pointer-events: none`). They can never
 * intercept a click meant for the image or the lightbox.
 */
export function PanelViewer({
  panel,
  panelIndex,
  panelCount,
  blocks,
  activeBlockId,
  run,
  canRun,
  canRunReason,
  onRun,
  onCancel,
  onRetry,
  onUpload,
  uploadBusy,
  uploadProgress,
  showBoxes,
  onToggleBoxes,
  onPrevPanel,
  onNextPanel,
}: PanelViewerProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const [lightbox, setLightbox] = useState(false);
  const [flashBoxes, setFlashBoxes] = useState(false);
  const lightboxRef = useDialogA11y(lightbox, () => setLightbox(false));

  // When a run finishes, every box shows for half a second — enough to check
  // the reading order, then it settles back to invisible.
  useEffect(() => {
    if (run.stage !== "done" || run.running) return;
    setFlashBoxes(true);
    const timer = window.setTimeout(() => setFlashBoxes(false), 520);
    return () => window.clearTimeout(timer);
  }, [run.stage, run.running]);

  useEffect(() => {
    setImageUrl(null);
    setMissing(false);
    if (!panel) return;

    // The engine's finished page wins; the raw upload is the fallback. A purged
    // original still has a render, so the panel stays visible.
    const url = panel.previewUrl ?? panel.imageUrl;

    if (!url) {
      setMissing(panel.storageState !== "purged");
      return;
    }

    setImageUrl(url);
  }, [panel?.id, panel?.imageUrl, panel?.previewUrl, panel?.storageState]);

  useEffect(() => {
    if (!lightbox) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") onPrevPanel();
      if (event.key === "ArrowRight") onNextPanel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [lightbox, onPrevPanel, onNextPanel]);

  const done = Object.values(run.panels).filter(
    (state) => state === "done"
  ).length;

  const runLabel = run.running
    ? `Translating… ${done}/${run.totalPanels}`
    : "Run translation";

  return (
    <div className="ch-viewer">
      <div className="ch-viewer-head">
        <div className="ch-viewer-heading">
          <p className="eyebrow">Raw panel</p>
          <p className="ch-viewer-count">
            {panelCount > 0
              ? `Panel ${panelIndex + 1} of ${panelCount}`
              : "No panels yet"}
          </p>
        </div>

        <div className="ch-viewer-actions">
          {panelCount > 0 ? (
            <>
              <Tooltip label="Show every bubble box at once">
                <button
                  type="button"
                  className="ch-toggle"
                  aria-pressed={showBoxes}
                  onClick={() => onToggleBoxes(!showBoxes)}
                >
                  <ScanText className="h-3.5 w-3.5" aria-hidden="true" />
                  Boxes
                </button>
              </Tooltip>
              <PanelDropzone
                variant="button"
                onFiles={onUpload}
                busy={uploadBusy}
                progress={uploadProgress}
              />
            </>
          ) : null}

          <button
            type="button"
            className="btn btn-primary btn-sm ch-run"
            onClick={onRun}
            disabled={run.running || !canRun}
            title={
              run.running
                ? "A run is already in progress."
                : (canRunReason ?? "Read, translate and proofread every panel")
            }
          >
            <Wand className="h-3.5 w-3.5" />
            {runLabel}
          </button>

          {run.running ? (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={onCancel}
            >
              Cancel
            </button>
          ) : null}
        </div>
      </div>

      <div className="ch-viewer-body">
        {!panel ? (
          <div className="ch-viewer-empty">
            <PanelDropzone
              onFiles={onUpload}
              busy={uploadBusy}
              progress={uploadProgress}
            />
            <p className="ch-viewer-empty-copy">
              Upload raw panels to start this chapter.
            </p>
          </div>
        ) : (
          <>
            <div
              className="ch-panel-frame"
              style={{
                aspectRatio:
                  panel.width > 0 && panel.height > 0
                    ? `${panel.width} / ${panel.height}`
                    : "3 / 4",
              }}
              data-visible={showBoxes ? "true" : "false"}
              data-flash={flashBoxes ? "true" : "false"}
            >
              {imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  className="ch-panel-image"
                  src={imageUrl}
                  alt={`Raw panel ${panelIndex + 1}`}
                  // An expired signed URL fails as a broken image, not a throw.
                  onError={() => setImageUrl(null)}
                />
              ) : (
                <div
                  className="ch-panel-skeleton"
                  role="status"
                  aria-label={
                    missing
                      ? "Panel image unavailable"
                      : "Loading panel image"
                  }
                >
                  {missing ? (
                    <p>
                      This panel image isn&apos;t available. Re-upload it to
                      continue.
                    </p>
                  ) : (
                    <span className="dash-spinner" aria-hidden="true" />
                  )}
                </div>
              )}

              {imageUrl
                ? blocks.map((block) =>
                    block.bbox ? (
                      <span
                        key={block.id}
                        className="ch-bbox"
                        aria-hidden="true"
                        data-active={
                          activeBlockId === block.id ? "true" : "false"
                        }
                        style={{
                          left: `${block.bbox.x * 100}%`,
                          top: `${block.bbox.y * 100}%`,
                          width: `${block.bbox.w * 100}%`,
                          height: `${block.bbox.h * 100}%`,
                        }}
                      />
                    ) : null
                  )
                : null}
            </div>

            <div className="ch-viewer-caption">
              <span>Panel {panelIndex + 1}</span>
              <button
                type="button"
                className="ch-zoom"
                onClick={() => setLightbox(true)}
                disabled={!imageUrl}
              >
                Zoom
              </button>
            </div>

            <RunProgress run={run} onRetry={onRetry} />
          </>
        )}
      </div>

      {lightbox ? (
        <div className="ch-lightbox-layer" role="presentation">
          <div
            className="ch-lightbox"
            role="dialog"
            aria-modal="true"
            aria-label={`Raw panel ${panelIndex + 1}, full size`}
            ref={lightboxRef}
            tabIndex={-1}
          >
            <button
              type="button"
              className="ch-lightbox-close"
              onClick={() => setLightbox(false)}
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
            <button
              type="button"
              className="ch-lightbox-arrow ch-lightbox-arrow--prev"
              onClick={onPrevPanel}
              disabled={panelIndex <= 0}
              aria-label="Previous panel"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {imageUrl ? (
              <img
                className="ch-lightbox-image"
                src={imageUrl}
                alt={`Raw panel ${panelIndex + 1}`}
              />
            ) : (
              <div className="ch-lightbox-image ch-panel-skeleton">
                <span className="dash-spinner" aria-hidden="true" />
              </div>
            )}
            <button
              type="button"
              className="ch-lightbox-arrow ch-lightbox-arrow--next"
              onClick={onNextPanel}
              disabled={panelIndex >= panelCount - 1}
              aria-label="Next panel"
            >
              <ArrowRight className="h-5 w-5" />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
