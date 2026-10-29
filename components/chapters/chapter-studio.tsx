"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { MAX_CHAPTER_PAGES } from "@/lib/engine-limits";
import type { WorkspacePanel } from "@/lib/server/chapters";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Download,
  Play,
  ScanText,
} from "../icons";
import { PanelDropzone, type UploadProgress } from "./panel-dropzone";

/* ------------------------------------------------------------------ */
/* Shapes                                                              */
/* ------------------------------------------------------------------ */

type EnginePage = { index: number; status: string };

type EngineJob = {
  jobId: string;
  chapterId: string;
  status: "pending" | "working" | "done" | "failed" | "approved" | "rejected";
  pageCount: number;
  pages: EnginePage[];
  createdAt?: string | null;
  finishedAt: string | null;
};

type Mode = "empty" | "draft" | "waiting" | "saving" | "ready";

/** The two panes, which scroll as one. */
type Pane = "raw" | "translated";

type Props = {
  chapterId: string;
  initialJobId?: string | null;
  panels: WorkspacePanel[];
  panelIndex: number;
  onPanelChange: (index: number) => void;
  canEdit: boolean;
  canUpload: boolean;
  canRun: boolean;
  canRunReason: string | null;
  uploadBusy: boolean;
  uploadProgress: UploadProgress;
  /** `afterIndex` is the panel the new pages land behind (-1 = front). */
  onUpload: (files: File[], afterIndex: number) => void;
  onRemovePanel: (panel: WorkspacePanel) => void;
  removing: boolean;
};

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const pad2 = (value: number) => String(value).padStart(2, "0");

function mmss(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  return `${pad2(Math.floor(safe / 60))}:${pad2(safe % 60)}`;
}

function assetUrl(jobId: string, pageIndex: number): string {
  return `/api/engine/jobs/${encodeURIComponent(jobId)}/final/${pageIndex}`;
}

/**
 * The engine's own error strings name the batch service and leak worker
 * internals, so nothing from the backend reaches the screen. Every failure the
 * studio reports is one of these fixed, neutral lines.
 */
const NEUTRAL = {
  start: "Couldn't start translation. Try again in a moment.",
  save: "Translation finished, but the panels couldn't be saved. Run it again.",
  failed: "The last run didn't finish — your panels are unchanged.",
} as const;

/* ------------------------------------------------------------------ */
/* Press sheet — the waiting state                                     */
/* ------------------------------------------------------------------ */

/**
 * Ruled-line rhythm for the ghost sheet: 14 rules with two paragraph gaps,
 * mirroring the vertical beat of a typeset page. Built once at module scope so
 * re-renders never rebuild it.
 */
const GHOST_ROWS = (() => {
  const rows: Array<"gap" | "full" | "mid" | "short"> = [];
  for (let i = 0; i < 14; i += 1) {
    if (i === 4 || i === 9) rows.push("gap");
    rows.push(i % 5 === 2 ? "short" : i % 3 === 0 ? "mid" : "full");
  }
  return rows;
})();

function GhostRows({ className }: { className: string }) {
  return (
    <div className={className}>
      {GHOST_ROWS.map((row, index) =>
        row === "gap" ? (
          <span key={index} className="cs-ghost-gap" />
        ) : (
          <i key={index} data-short={row === "short" ? "true" : undefined} data-mid={row === "mid" ? "true" : undefined} />
        )
      )}
    </div>
  );
}

/**
 * A blank page with registration marks and an accent ink band sweeping down it.
 *
 * The band and its ink are two transforms on the same 3.6s clock: the window
 * slides while the rows inside counter-slide, so the ink appears pinned to the
 * paper. Both are `transform` only. `still` freezes the sheet for the draft
 * state, where nothing is running yet.
 */
function GhostSheet({
  still,
  label,
  ratio,
}: {
  still: boolean;
  label: string;
  ratio: string;
}) {
  return (
    <div className="cs-sheet" style={{ aspectRatio: ratio }}>
      <div className="cs-ghost" data-still={still ? "true" : "false"}>
        <GhostRows className="cs-ghost-ruled" />
        <div className="cs-ghost-ink">
          <GhostRows className="cs-ghost-ink-rows" />
        </div>
        <div className="cs-ghost-band" />
        <svg className="cs-ghost-reg" viewBox="0 0 340 510" preserveAspectRatio="none" aria-hidden="true">
          <path d="M14 30 V14 H30" />
          <path d="M310 14 H326 V30" />
          <path d="M14 480 V496 H30" />
          <path d="M326 480 V496 H310" />
        </svg>
        <span className="cs-ghost-label">{label}</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Pane image                                                          */
/* ------------------------------------------------------------------ */

/**
 * Full-resolution page, fitted to the pane. Clicking opens the original file in
 * a new tab, which is why there is no zoom control: the browser already has a
 * better one.
 */
function PageImage({
  src,
  alt,
  ratio,
  children,
}: {
  src: string;
  alt: string;
  ratio: string;
  children?: ReactNode;
}) {
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    setFailed(false);
    setAttempt(0);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [src]);

  // A signed URL can expire mid-view or a render can land a beat after the row.
  // One quiet retry covers both; a second failure is real.
  const handleError = () => {
    if (attempt === 0) {
      timer.current = window.setTimeout(() => setAttempt(1), 900);
      return;
    }
    setFailed(true);
  };

  if (failed) {
    return (
      <div className="cs-stub" role="status">
        <AlertCircle className="h-4 w-4" aria-hidden="true" />
        <p>This page couldn&apos;t be loaded.</p>
        <button
          type="button"
          className="cs-btn"
          onClick={() => {
            setFailed(false);
            setAttempt(0);
          }}
        >
          Try again
        </button>
      </div>
    );
  }

  const url = attempt > 0 ? `${src}${src.includes("?") ? "&" : "?"}retry=${attempt}` : src;

  return (
    <a
      className="cs-frame"
      style={{ aspectRatio: ratio }}
      href={src}
      target="_blank"
      rel="noreferrer"
      title="Open this panel at full resolution"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="cs-page" src={url} alt={alt} onError={handleError} />
      {children}
    </a>
  );
}

/* ------------------------------------------------------------------ */
/* Studio                                                              */
/* ------------------------------------------------------------------ */

export function ChapterStudio({
  chapterId,
  initialJobId = null,
  panels,
  panelIndex,
  onPanelChange,
  canEdit,
  canUpload,
  canRun,
  canRunReason,
  uploadBusy,
  uploadProgress,
  onUpload,
  onRemovePanel,
  removing,
}: Props) {
  const router = useRouter();
  const [jobId, setJobId] = useState<string | null>(initialJobId);
  const [job, setJob] = useState<EngineJob | null>(null);
  const [starting, setStarting] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const stripRef = useRef<HTMLDivElement | null>(null);
  const rawStage = useRef<HTMLDivElement | null>(null);
  const translatedStage = useRef<HTMLDivElement | null>(null);
  const scrollLock = useRef<Pane | null>(null);
  const finalizedFor = useRef<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const readJob = useCallback(async (id: string) => {
    try {
      const response = await fetch(`/api/engine/jobs/${encodeURIComponent(id)}`, {
        cache: "no-store",
      });
      if (!response.ok) return null;
      const next = (await response.json()) as EngineJob;
      setJob(next);
      return next;
    } catch {
      // Polling is best-effort; the next tick tries again.
      return null;
    }
  }, []);

  // The chapter row is the only source of truth for which run belongs here.
  useEffect(() => {
    if (!initialJobId) return;
    setJobId(initialJobId);
    void readJob(initialJobId);
  }, [initialJobId, readJob]);

  const current = panels[panelIndex] ?? null;
  const pageDone = job?.pages.filter((page) => page.status === "done").length ?? 0;
  const jobActive = job?.status === "pending" || job?.status === "working";
  const aligned = Boolean(job && job.pageCount === panels.length);
  const jobComplete = Boolean(job && aligned && job.status === "done");
  const savedAny = panels.some((panel) => panel.hasRender);

  let mode: Mode = "draft";
  if (panels.length === 0) mode = "empty";
  else if (jobActive) mode = "waiting";
  else if (finalizing) mode = "saving";
  else if (jobComplete || savedAny || job?.status === "approved") mode = "ready";

  /* ---- polling -------------------------------------------------- */

  useEffect(() => {
    if (!jobId || !jobActive) return;
    const id = window.setInterval(() => void readJob(jobId), 2500);
    return () => window.clearInterval(id);
  }, [jobId, jobActive, readJob]);

  useEffect(() => {
    if (!jobActive && !finalizing) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [jobActive, finalizing]);

  /* ---- finalise a finished run without asking ------------------- */

  /**
   * A finished run is only useful once its text blocks and page renders are
   * saved, and the database refuses a Submit on a chapter with no text — so
   * both writes happen here, once per run, without a prompt.
   */
  useEffect(() => {
    if (!jobId || !job) return;
    if (job.status !== "done" || job.pageCount !== panels.length) return;
    if (finalizedFor.current === jobId) return;

    finalizedFor.current = jobId;

    if (panels.length > 0 && panels.every((panel) => panel.hasRender)) return;

    setFinalizing(true);
    setError(null);

    void (async () => {
      try {
        await fetch(`/api/engine/jobs/${encodeURIComponent(jobId)}/import`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{}",
        });
        const rendered = await fetch(`/api/engine/jobs/${encodeURIComponent(jobId)}/render`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{}",
        });
        if (!rendered.ok && mounted.current) setError(NEUTRAL.save);
        router.refresh();
      } catch {
        if (mounted.current) setError(NEUTRAL.save);
      } finally {
        if (mounted.current) setFinalizing(false);
      }
    })();
  }, [jobId, job, panels, router]);

  /* ---- filmstrip keeps the selection in view --------------------- */

  useEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;
    const selected = strip.querySelector<HTMLElement>('[data-selected="true"]');
    if (!selected) return;
    const bounds = strip.getBoundingClientRect();
    const box = selected.getBoundingClientRect();
    if (box.left < bounds.left) strip.scrollLeft -= bounds.left - box.left + 8;
    else if (box.right > bounds.right) strip.scrollLeft += box.right - bounds.right + 8;
  }, [panelIndex, panels.length]);

  /* ---- the two panes scroll as one -------------------------------- */

  /**
   * Both panes show the same page at the same fit, so one scrollbar drives the
   * other by the same amount. The two images can differ by a few pixels in
   * height (a saved render vs. the original), so the offset is scaled by the
   * scrollable ranges, which is a no-op while they match.
   */
  function syncScroll(side: Pane) {
    const from = side === "raw" ? rawStage.current : translatedStage.current;
    const to = side === "raw" ? translatedStage.current : rawStage.current;
    if (!from || !to || from === to) return;
    // This event is the echo of our own write to the pane being scrolled.
    if (scrollLock.current === (side === "raw" ? "translated" : "raw")) return;

    scrollLock.current = side;
    const fromRange = from.scrollHeight - from.clientHeight;
    const toRange = to.scrollHeight - to.clientHeight;
    const next =
      fromRange > 0 && toRange > 0
        ? (from.scrollTop / fromRange) * toRange
        : 0;
    if (Math.abs(to.scrollTop - next) > 0.5) to.scrollTop = next;

    requestAnimationFrame(() => {
      if (scrollLock.current === side) scrollLock.current = null;
    });
  }

  /* ---- actions --------------------------------------------------- */

  async function startRun() {
    if (starting || jobActive || finalizing || !canRun) return;
    setStarting(true);
    setError(null);
    try {
      const response = await fetch("/api/engine/jobs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chapterId }),
      });
      if (!response.ok) throw new Error("start");
      const data = (await response.json()) as { jobId?: string };
      if (!data?.jobId) throw new Error("start");

      finalizedFor.current = null;
      setJobId(data.jobId);
      onPanelChange(0);
      await readJob(data.jobId);
      router.refresh();
    } catch {
      setError(NEUTRAL.start);
    } finally {
      setStarting(false);
    }
  }

  /* ---- derived copy ---------------------------------------------- */

  const locked = jobActive || finalizing;
  const atCapacity = panels.length >= MAX_CHAPTER_PAGES;
  const runDisabled = starting || locked || !canRun;
  const removeDisabled = removing || locked || !canUpload || !current;
  const addDisabled = !canUpload || uploadBusy || locked;

  const rawDims =
    current && current.width && current.height
      ? `${current.width.toLocaleString()} × ${current.height.toLocaleString()}`
      : "Full resolution";
  const ratio =
    current && current.width && current.height
      ? `${current.width} / ${current.height}`
      : "600 / 900";

  const savedRender = current?.hasRender ? current.previewUrl : null;
  const engineFinal = job && jobComplete ? assetUrl(job.jobId, panelIndex) : null;
  const translatedUrl = savedRender ?? engineFinal;

  // A new page starts at its top, in both panes.
  useEffect(() => {
    if (rawStage.current) rawStage.current.scrollTop = 0;
    if (translatedStage.current) translatedStage.current.scrollTop = 0;
  }, [panelIndex, translatedUrl]);

  const elapsedSeconds = (() => {
    if (!job?.createdAt) return 0;
    const start = Date.parse(job.createdAt);
    if (Number.isNaN(start)) return 0;
    const end = job.finishedAt ? Date.parse(job.finishedAt) : now;
    if (Number.isNaN(end)) return 0;
    return (end - start) / 1000;
  })();

  const progress =
    mode === "ready" ? 100 : panels.length ? Math.round((pageDone / panels.length) * 100) : 0;

  let statusCopy: string;
  let statusMeta: string;
  if (mode === "empty") {
    statusCopy = "No panels yet — add pages to begin";
    statusMeta = `0 of ${MAX_CHAPTER_PAGES} panels`;
  } else if (mode === "waiting" || mode === "saving") {
    statusCopy = "Working — this usually takes a few minutes";
    statusMeta = `${mode === "saving" ? panels.length : pageDone} of ${panels.length} panels typeset`;
  } else if (mode === "ready") {
    statusCopy = `Chapter ready — ${panels.length} panel${panels.length === 1 ? "" : "s"} translated and saved`;
    statusMeta = job?.finishedAt ? `Finished in ${mmss(elapsedSeconds)}` : `${panels.length} panels`;
  } else if (job?.status === "failed") {
    statusCopy = NEUTRAL.failed;
    statusMeta = "Not started";
  } else {
    statusCopy = `${panels.length} panel${panels.length === 1 ? "" : "s"} ready — nothing translated yet`;
    statusMeta = "Not started";
  }

  const translatedTitle =
    mode === "ready"
      ? "Finished page"
      : mode === "waiting"
        ? "Typesetting…"
        : mode === "saving"
          ? "Saving…"
          : mode === "draft"
            ? "Nothing typeset yet"
            : "Waiting for panels";

  const translatedTag =
    mode === "ready"
      ? "Ready"
      : mode === "waiting" || mode === "saving"
        ? "Working"
        : mode === "draft"
          ? "Not started"
          : "Idle";

  const translatedFoot = !panels.length
    ? "No panels yet"
    : `Panel ${pad2(panelIndex + 1)} · ${
        mode === "ready" ? "saved" : mode === "waiting" || mode === "saving" ? "typesetting" : "not translated"
      }`;

  return (
    <section className="cs-studio" data-mode={mode} aria-label="Chapter studio">
      {/* ---- top bar: navigation and every control ---- */}
      <div className="cs-bar">
        <div className="cs-pager">
          <button
            type="button"
            className="cs-icon"
            onClick={() => onPanelChange(Math.max(0, panelIndex - 1))}
            disabled={panelIndex <= 0}
            aria-label="Previous panel"
            title="Previous panel"
          >
            <ArrowLeft className="h-3 w-3" />
          </button>
          <span className="cs-page-num">
            {panels.length ? (
              <>
                Panel <b>{pad2(panelIndex + 1)}</b> / {pad2(panels.length)}
              </>
            ) : (
              "No panels"
            )}
          </span>
          <button
            type="button"
            className="cs-icon"
            onClick={() => onPanelChange(Math.min(panels.length - 1, panelIndex + 1))}
            disabled={panelIndex >= panels.length - 1}
            aria-label="Next panel"
            title="Next panel"
          >
            <ArrowRight className="h-3 w-3" />
          </button>
        </div>

        <span className="cs-divider" aria-hidden="true" />

        <PanelDropzone
          variant="button"
          onFiles={(files) => onUpload(files, panels.length === 0 ? -1 : panelIndex)}
          busy={uploadBusy}
          progress={uploadProgress}
          disabled={addDisabled}
          remaining={MAX_CHAPTER_PAGES - panels.length}
        />

        <button
          type="button"
          className="cs-btn"
          onClick={() => current && onRemovePanel(current)}
          disabled={removeDisabled}
          title={locked ? "Panels lock while translation is running" : "Remove the panel you are looking at"}
        >
          {removing ? "Removing…" : "Remove"}
        </button>

        <span className="cs-grow" />

        <a
          className="cs-btn"
          href={savedAny ? `/api/chapters/${chapterId}/download` : undefined}
          download
          aria-disabled={savedAny ? undefined : "true"}
          data-disabled={savedAny ? undefined : "true"}
          title={savedAny ? "Download every saved panel as one ZIP" : "Nothing saved to download yet"}
        >
          <Download className="h-3 w-3" />
          Download ZIP
        </a>

        <button
          type="button"
          className="cs-btn"
          data-primary="true"
          onClick={() => void startRun()}
          disabled={runDisabled}
          title={locked ? "Translation is already running" : (canRunReason ?? "Translate and typeset every panel")}
        >
          <Play className="h-3 w-3" />
          {jobActive ? "Working" : mode === "ready" ? "Translate again" : "Run translation"}
        </button>
      </div>

      {/* ---- status strip ---- */}
      <div
        className="cs-status"
        data-live={mode === "waiting" || mode === "saving" ? "true" : mode === "ready" ? "done" : "false"}
        role="status"
      >
        <span className="cs-status-dot" aria-hidden="true" />
        <span className="cs-status-copy">{statusCopy}</span>
        <span className="cs-grow" />
        <span className="cs-status-meta">{statusMeta}</span>
        <span className="cs-status-track" aria-hidden="true">
          <i style={{ transform: `scaleX(${progress / 100})` }} />
        </span>
        {mode === "waiting" || mode === "saving" ? (
          <span className="cs-status-meta">{mmss(elapsedSeconds)}</span>
        ) : null}
      </div>

      {error ? (
        <div className="cs-alert" role="alert">
          <AlertCircle className="h-4 w-4" aria-hidden="true" />
          <span>{error}</span>
        </div>
      ) : null}

      {/* ---- split view ---- */}
      <div className="cs-split">
        <figure className="cs-pane">
          <div className="cs-pane-head">
            <span className="cs-pane-label">
              <span className="cs-kicker">Original</span>
              <span className="cs-title">Raw page</span>
            </span>
            <span className="cs-tag">Full res</span>
            <span className="cs-dims">{current ? rawDims : "—"}</span>
          </div>

          <div
            className="cs-stage"
            ref={rawStage}
            onScroll={() => syncScroll("raw")}
            data-pane="raw"
          >
            {current?.imageUrl ? (
              <PageImage
                src={current.imageUrl}
                alt={`Original page ${panelIndex + 1} at full resolution`}
                ratio={ratio}
              />
            ) : mode === "empty" ? (
              <div className="cs-drop-wrap">
                <PanelDropzone
                  onFiles={(files) => onUpload(files, -1)}
                  busy={uploadBusy}
                  progress={uploadProgress}
                  disabled={!canUpload}
                  remaining={MAX_CHAPTER_PAGES - panels.length}
                />
              </div>
            ) : (
              <div className="cs-stub" role="status">
                <ScanText className="h-5 w-5" aria-hidden="true" />
                <p>
                  {current?.storageState === "purged"
                    ? "The original page is no longer stored in this chapter."
                    : "This original page couldn't be loaded."}
                </p>
              </div>
            )}
          </div>

          <div className="cs-pane-foot">
            <span className="cs-cap" data-full={atCapacity ? "true" : "false"}>
              <span className="cs-cap-cells" aria-hidden="true">
                {Array.from({ length: MAX_CHAPTER_PAGES }, (_, index) => (
                  <i key={index} data-on={index < panels.length ? "true" : undefined} />
                ))}
              </span>
              <span className="cs-cap-num">
                {panels.length} / {MAX_CHAPTER_PAGES}
              </span>
              <span>panels</span>
            </span>
            <span className="cs-grow" />
            <span>
              {panels.length ? `Page ${pad2(panelIndex + 1)} of ${pad2(panels.length)}` : "No pages"}
            </span>
          </div>
        </figure>

        <figure className="cs-pane">
          <div className="cs-pane-head">
            <span className="cs-pane-label">
              <span className="cs-kicker">Translated</span>
              <span className="cs-title">{translatedTitle}</span>
            </span>
            <span className="cs-tag" data-tone={mode === "ready" ? "ready" : undefined}>
              {translatedTag}
            </span>
            <span className="cs-dims">{mode === "ready" && current ? rawDims : "—"}</span>
          </div>

          <div
            className="cs-stage"
            ref={translatedStage}
            onScroll={() => syncScroll("translated")}
            data-pane="translated"
          >
            {mode === "empty" ? (
              <div className="cs-stub" role="status">
                <p>Add panels, then run translation. The finished pages appear here.</p>
              </div>
            ) : mode === "waiting" || mode === "saving" ? (
              <GhostSheet
                still={false}
                label={mode === "saving" ? "saving" : "typesetting"}
                ratio={ratio}
              />
            ) : mode === "draft" ? (
              <GhostSheet still label="not translated yet" ratio={ratio} />
            ) : translatedUrl ? (
              <PageImage
                src={translatedUrl}
                alt={`Translated page ${panelIndex + 1}`}
                ratio={ratio}
              >
                <span className="cs-stamp">Ready</span>
              </PageImage>
            ) : (
              <div className="cs-stub" role="status">
                <p>This panel hasn&apos;t been typeset yet. Run translation to fill it in.</p>
              </div>
            )}
          </div>

          <div className="cs-pane-foot">
            <span>{translatedFoot}</span>
            <span className="cs-grow" />
            <span>Full resolution</span>
          </div>
        </figure>
      </div>

      {/* ---- filmstrip ---- */}
      {panels.length > 0 ? (
        <div className="cs-strip" ref={stripRef} role="tablist" aria-label="Chapter panels">
          {panels.map((panel, index) => {
            const thumb = panel.hasRender ? panel.previewUrl : panel.imageUrl;
            const state =
              mode === "ready"
                ? "done"
                : mode === "waiting"
                  ? index < pageDone
                    ? "done"
                    : index === pageDone
                      ? "live"
                      : "queued"
                  : "queued";
            return (
              <button
                key={panel.id}
                type="button"
                className="cs-thumb"
                role="tab"
                aria-selected={index === panelIndex}
                aria-label={`Panel ${index + 1}`}
                data-selected={index === panelIndex ? "true" : "false"}
                data-state={state}
                onClick={() => onPanelChange(index)}
              >
                <span className="cs-thumb-box">
                  {thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={thumb} alt="" loading="lazy" />
                  ) : (
                    <ScanText className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  <span className="cs-thumb-dot" aria-hidden="true" />
                </span>
                <span className="cs-thumb-n">{pad2(index + 1)}</span>
              </button>
            );
          })}
        </div>
      ) : null}

      {canEdit && !canRun && canRunReason && panels.length > 0 ? (
        <p className="cs-hint">{canRunReason}</p>
      ) : null}
    </section>
  );
}
