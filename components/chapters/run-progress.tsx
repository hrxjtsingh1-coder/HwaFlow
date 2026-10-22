"use client";

import type { RunState } from "@/lib/pipeline";

/**
 * The stage strip under the raw panel. The viewer only ever shows the panel you
 * are on; this strip is the only place the whole run's progress is visible.
 *
 *   Reading panels 12 / 40 · batch 2 of 4
 *   Translating chapter
 *   Proofreading chapter
 */
export function RunProgress({
  run,
  onRetry,
}: {
  run: RunState;
  onRetry: () => void;
}) {
  const failed = Object.values(run.panels).filter(
    (state) => state === "failed"
  ).length;

  const visible = run.running || run.error !== null || failed > 0;
  if (!visible) return null;

  let label: string;
  let detail: string | null = null;
  let percent = 0;

  if (run.stage === "extract" || run.stage === "done") {
    label = `Reading panels ${run.extracted} / ${run.totalPanels}`;
    if (run.stage === "extract" && run.batchCount > 0) {
      detail = `batch ${run.batchIndex} of ${run.batchCount}`;
    }
    percent =
      run.totalPanels > 0
        ? Math.round((run.extracted / run.totalPanels) * 70)
        : 0;
  } else if (run.stage === "translate") {
    label = "Translating chapter";
    percent = 80;
  } else {
    label = "Proofreading chapter";
    percent = 92;
  }

  if (run.stage === "done" && failed === 0) {
    label = "Chapter translated";
    percent = 100;
  }

  const failedLabel =
    failed > 0
      ? `${failed} panel${failed === 1 ? "" : "s"} failed`
      : null;

  return (
    <div
      className="ch-stage"
      data-tone={run.error || failed > 0 ? "error" : "active"}
      role="status"
      aria-live="polite"
    >
      <div className="ch-stage-top">
        <p className="ch-stage-label">
          {label}
          {detail ? <span className="ch-stage-detail"> · {detail}</span> : null}
        </p>
        {run.running ? (
          <span className="ch-stage-percent" aria-hidden="true">
            {percent}%
          </span>
        ) : null}
      </div>

      <div
        className="ch-stage-track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-label="Translation progress"
      >
        <span className="ch-stage-fill" style={{ width: `${percent}%` }} />
      </div>

      {run.error ? (
        <div className="ch-stage-error">
          <p>{run.error.message}</p>
          {failedLabel ? <p className="ch-stage-failed">{failedLabel}</p> : null}
          {!run.running ? (
            <button type="button" className="btn btn-ghost btn-sm" onClick={onRetry}>
              Retry
            </button>
          ) : null}
        </div>
      ) : failedLabel ? (
        <p className="ch-stage-failed">{failedLabel}</p>
      ) : null}
    </div>
  );
}
