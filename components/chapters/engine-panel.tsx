"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { TextBlock } from "@/lib/chapters";
import {
  formatMB,
  MAX_CHAPTER_BYTES,
  MAX_CHAPTER_PAGES,
} from "@/lib/engine-limits";
import type { WorkspacePanel } from "@/lib/server/chapters";
import { useDialogA11y } from "@/lib/use-dialog";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  Download,
  ScanText,
  Wand,
  X,
} from "../icons";
import { PanelDropzone, type UploadProgress } from "./panel-dropzone";

type EnginePage = { index: number; status: string; error?: string };
type EngineJob = {
  jobId: string;
  chapterId: string;
  status: "pending" | "working" | "done" | "failed" | "approved" | "rejected";
  pageCount: number;
  pages: EnginePage[];
  error: string | null;
  finishedAt: string | null;
  approvedAt: string | null;
  kaggle?: {
    mode: string;
    status: string;
    ref: string | null;
    message: string | null;
    lastError?: string | null;
  } | null;
  urls: Array<{ index: number; raw: string; final: string; approved: string; regions: string }>;
};

type ImportSummary = {
  pages: number;
  blocks: number;
  skipped: Array<{ page: number; reason: string }>;
};

type RenderSummary = {
  pages: number;
  skipped: Array<{ page: number; reason: string }>;
};

type Props = {
  chapterId: string;
  initialJobId?: string | null;
  panels: WorkspacePanel[];
  pageIndex: number;
  onPageChange: (index: number) => void;
  blocks: TextBlock[];
  activeBlockId: string | null;
  canEdit: boolean;
  canUpload: boolean;
  canRun: boolean;
  canRunReason: string | null;
  canApprove: boolean;
  onUpload: (files: File[]) => void;
  uploadBusy: boolean;
  uploadProgress: UploadProgress;
  showBoxes: boolean;
  onToggleBoxes: (next: boolean) => void;
};

type ViewMode = "split" | "before" | "after";
type ConfirmAction = "approve" | "reject";

const STATUS_COPY: Record<EngineJob["status"], string> = {
  pending: "Queued for XianScan. This view will update automatically.",
  working: "XianScan is cleaning, translating, and typesetting the pages.",
  done: "Ready to review. Import the text or save the finished pages to HwaFlow.",
  failed: "XianScan could not finish this run. Your chapter pages are unchanged.",
  approved: "Approved. Engine-side originals and intermediate files were cleared; finals are retained for 7 days.",
  rejected: "This engine run was discarded. The chapter's stored pages were not changed.",
};

async function responseJson<T>(response: Response, fallback: string): Promise<T> {
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // Keep the safe fallback for non-JSON upstream errors.
  }
  if (!response.ok) {
    const message =
      typeof body === "object" && body !== null && "message" in body &&
      typeof (body as { message?: unknown }).message === "string"
        ? (body as { message: string }).message
        : fallback;
    throw new Error(message);
  }
  return body as T;
}

function assetUrl(jobId: string, kind: "raw" | "final" | "approved", pageIndex: number): string {
  return `/api/engine/jobs/${encodeURIComponent(jobId)}/${kind}/${pageIndex}`;
}

/**
 * How many times one pane retries the *same* URL before it shows an error.
 * A page that is still being written, or a proxy that lost one connection, is
 * transient; a genuinely missing object is not, so we stop at three.
 */
const IMAGE_RETRIES = 3;
const IMAGE_RETRY_MS = 1200;

function withRetryParam(url: string, attempt: number): string {
  if (attempt === 0) return url;
  return `${url}${url.includes("?") ? "&" : "?"}retry=${attempt}`;
}

function ImagePane({
  side,
  label,
  imageUrl,
  fallbackUrl,
  placeholder,
  panel,
  blocks,
  activeBlockId,
  showBoxes,
  zoom,
  onExpand,
}: {
  side: "before" | "after";
  label: string;
  imageUrl: string | null;
  fallbackUrl?: string | null;
  placeholder: string;
  panel: WorkspacePanel | null;
  blocks: TextBlock[];
  activeBlockId: string | null;
  showBoxes: boolean;
  zoom: number;
  onExpand: () => void;
}) {
  const [useFallback, setUseFallback] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const retryTimer = useRef<number | null>(null);

  useEffect(() => {
    setUseFallback(false);
    setFailed(false);
    setAttempt(0);
    if (retryTimer.current) {
      window.clearTimeout(retryTimer.current);
      retryTimer.current = null;
    }
  }, [imageUrl, fallbackUrl]);

  useEffect(() => {
    return () => {
      if (retryTimer.current) window.clearTimeout(retryTimer.current);
    };
  }, []);

  const baseSrc = useFallback && fallbackUrl ? fallbackUrl : imageUrl;
  const src = baseSrc ? withRetryParam(baseSrc, attempt) : null;

  /**
   * One failed load is usually a race, not a missing file: the engine may still
   * be writing this page, or the proxy dropped a connection mid-stream. Retry
   * the same URL with a cache-busting counter, then fall back to the other
   * source, and only then report a real error.
   */
  const handleImageError = () => {
    if (retryTimer.current) window.clearTimeout(retryTimer.current);
    if (attempt < IMAGE_RETRIES) {
      setAttempt((current) => current + 1);
      retryTimer.current = window.setTimeout(() => {
        setAttempt((current) => current + 1);
      }, IMAGE_RETRY_MS);
      return;
    }
    if (!useFallback && fallbackUrl) {
      setUseFallback(true);
      setAttempt(0);
      return;
    }
    setFailed(true);
  };
  const dimensions = panel?.width && panel.height
    ? `${panel.width.toLocaleString()} × ${panel.height.toLocaleString()} px`
    : "Full resolution";

  return (
    <figure className="xs-image-pane" data-side={side}>
      <div className="xs-image-pane-head">
        <div>
          <span className="xs-image-pane-kicker">{side === "before" ? "BEFORE" : "AFTER"}</span>
          <strong>{label}</strong>
        </div>
        <span className="xs-image-dimensions">{dimensions}</span>
      </div>

      {src && !failed ? (
        <button
          type="button"
          className="xs-image-open"
          onClick={onExpand}
          aria-label={`Open ${label.toLowerCase()} image in the large viewer`}
          title="Open larger preview"
        >
          <div className="xs-image-scroll" data-zoom-scroll="true">
            <div className="xs-image-layer" style={{ width: `${zoom * 100}%` }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className="xs-preview-image"
                src={src}
                alt={`${label}, full-resolution page preview`}
                onError={handleImageError}
              />
              {side === "before" && showBoxes
                ? blocks.map((block) =>
                    block.bbox ? (
                      <span
                        key={block.id}
                        className="xs-preview-box"
                        data-active={activeBlockId === block.id ? "true" : "false"}
                        aria-hidden="true"
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
          </div>
        </button>
      ) : (
        <div className="xs-image-placeholder" role="status">
          <span className="xs-image-placeholder-mark" aria-hidden="true">
            {failed ? <AlertCircle className="h-5 w-5" /> : <ScanText className="h-5 w-5" />}
          </span>
          <p>{failed ? "This preview could not be loaded." : placeholder}</p>
          {failed ? (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setFailed(false);
                setUseFallback(false);
                setAttempt((current) => current + 1);
              }}
            >
              Try again
            </button>
          ) : null}
        </div>
      )}

      <figcaption className="xs-image-pane-foot">
        {side === "before"
          ? "Original page · never resized for the engine"
          : "XianScan output · saved separately from the original"}
      </figcaption>
    </figure>
  );
}

export function EnginePanel({
  chapterId,
  initialJobId = null,
  panels,
  pageIndex,
  onPageChange,
  blocks,
  activeBlockId,
  canEdit,
  canUpload,
  canRun,
  canRunReason,
  canApprove,
  onUpload,
  uploadBusy,
  uploadProgress,
  showBoxes,
  onToggleBoxes,
}: Props) {
  const router = useRouter();
  const storageKey = `hwaflow.engineJob.${chapterId}`;
  const [jobId, setJobId] = useState<string | null>(initialJobId);
  const [job, setJob] = useState<EngineJob | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imported, setImported] = useState<ImportSummary | null>(null);
  const [rendered, setRendered] = useState<RenderSummary | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("split");
  const [zoom, setZoom] = useState(1);

  /** Centre the stage scroll box after a zoom change, so zooming never strands you at a corner. */
  const applyZoom = useCallback((next: number) => {
    const clamped = Math.min(2.5, Math.max(0.5, Number(next.toFixed(2))));
    setZoom(clamped);
    if (typeof document === "undefined") return;
    requestAnimationFrame(() => {
      document.querySelectorAll<HTMLElement>(".xs-image-scroll").forEach((box) => {
        box.scrollTop = (box.scrollHeight - box.clientHeight) / 2;
        box.scrollLeft = (box.scrollWidth - box.clientWidth) / 2;
      });
    });
  }, []);
  const [lightbox, setLightbox] = useState(false);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const timer = useRef<number | null>(null);
  const lightboxRef = useDialogA11y(lightbox, () => setLightbox(false));
  const confirmationRef = useDialogA11y(Boolean(confirmAction), () => setConfirmAction(null));

  const readJob = useCallback(async (id: string) => {
    try {
      const response = await fetch(`/api/engine/jobs/${encodeURIComponent(id)}`, {
        cache: "no-store",
      });
      const next = await responseJson<EngineJob>(response, "Could not read the XianScan run.");
      setJob(next);
      setError(null);
      return next;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not read the XianScan run.");
      return null;
    }
  }, []);

  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = window.localStorage.getItem(storageKey);
    } catch {
      // localStorage is only a fallback; the chapter row is authoritative.
    }
    const remembered = initialJobId ?? saved;
    setJobId(remembered);
    setJob(null);
    setError(null);
    setImported(null);
    setRendered(null);
    if (remembered) {
      try {
        window.localStorage.setItem(storageKey, remembered);
      } catch {
        // The server-side chapter link still preserves the job.
      }
      void readJob(remembered);
    }
    return () => {
      if (timer.current) {
        window.clearInterval(timer.current);
        timer.current = null;
      }
    };
  }, [storageKey, initialJobId, readJob]);

  useEffect(() => {
    if (timer.current) {
      window.clearInterval(timer.current);
      timer.current = null;
    }
    if (!jobId || !job || !["pending", "working"].includes(job.status)) return;
    timer.current = window.setInterval(() => void readJob(jobId), 2500);
    return () => {
      if (timer.current) {
        window.clearInterval(timer.current);
        timer.current = null;
      }
    };
  }, [jobId, job?.status, readJob]);

  useEffect(() => {
    if (!lightbox) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") onPageChange(Math.max(0, pageIndex - 1));
      if (event.key === "ArrowRight") onPageChange(Math.min(panels.length - 1, pageIndex + 1));
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [lightbox, onPageChange, pageIndex, panels.length]);

  const current = panels[pageIndex] ?? null;
  const currentPage = job?.pages.find((page) => page.index === pageIndex);
  const aligned = Boolean(job && job.pageCount === panels.length);
  const pageDone = job?.pages.filter((page) => page.status === "done").length ?? 0;
  const isActive = Boolean(job && ["pending", "working"].includes(job.status));
  const hasOutput = Boolean(job && ["done", "approved"].includes(job.status));
  const hasStoredRenders = useMemo(() => panels.some((panel) => panel.hasRender), [panels]);

  const engineRawUrl = job && job.status !== "approved" && aligned
    ? assetUrl(job.jobId, "raw", pageIndex)
    : null;
  const rawUrl = current?.imageUrl ?? engineRawUrl;
  const rawFallback = current?.imageUrl && engineRawUrl ? engineRawUrl : null;

  let finalUrl: string | null = current?.previewUrl ?? null;
  let finalFallback: string | null = null;
  if (job && aligned && (job.status === "done" || job.status === "approved" || currentPage?.status === "done")) {
    const engineFinal = assetUrl(job.jobId, job.status === "approved" ? "approved" : "final", pageIndex);
    if (job.status === "approved" && current?.previewUrl) {
      finalUrl = current.previewUrl;
      finalFallback = engineFinal;
    } else {
      finalUrl = engineFinal;
      finalFallback = current?.previewUrl ?? null;
    }
  }

  const runDisabled = busy || isActive || !canRun;
  const canImport = canEdit && job?.status === "done" && aligned;
  const canSavePages = canEdit && hasOutput && aligned;
  const pageStateLabel = currentPage?.status
    ? currentPage.status.replaceAll("_", " ")
    : current?.hasRender
      ? "saved"
      : null;
  const progressPercent = job?.pageCount
    ? Math.max(0, Math.min(100, Math.round((pageDone / job.pageCount) * 100)))
    : 0;

  async function startRun() {
    if (runDisabled) return;
    setBusy(true);
    setError(null);
    setImported(null);
    setRendered(null);
    try {
      // Only the chapter id is sent: XianScan reads the original page images
      // and runs its own Gemini path. HwaFlow editor text is never run input.
      const response = await fetch("/api/engine/jobs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chapterId }),
      });
      const data = await responseJson<{ jobId: string }>(response, "Could not start XianScan.");
      if (!data.jobId) throw new Error("XianScan returned no run id.");
      try {
        window.localStorage.setItem(storageKey, data.jobId);
      } catch {
        // The chapter row link remains the durable source of truth.
      }
      setJobId(data.jobId);
      setJob(null);
      onPageChange(0);
      await readJob(data.jobId);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not start XianScan.");
    } finally {
      setBusy(false);
    }
  }

  async function importText() {
    if (!jobId || !canImport || busy) return;
    setBusy(true);
    setError(null);
    setImported(null);
    try {
      const response = await fetch(`/api/engine/jobs/${encodeURIComponent(jobId)}/import`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      const summary = await responseJson<ImportSummary>(response, "Could not import the XianScan text.");
      setImported(summary);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not import the XianScan text.");
    } finally {
      setBusy(false);
    }
  }

  async function savePages() {
    if (!jobId || !canSavePages || busy) return;
    setBusy(true);
    setError(null);
    setRendered(null);
    try {
      const response = await fetch(`/api/engine/jobs/${encodeURIComponent(jobId)}/render`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      const summary = await responseJson<RenderSummary>(response, "Could not save the XianScan pages.");
      setRendered(summary);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save the XianScan pages.");
    } finally {
      setBusy(false);
    }
  }

  async function decide(kind: ConfirmAction) {
    if (!jobId || !canApprove || busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/engine/jobs/${encodeURIComponent(jobId)}/${kind}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      const next = await responseJson<EngineJob>(response, "Could not update the XianScan run.");
      setJob(next);
      setConfirmAction(null);
      if (kind === "reject") {
        try {
          window.localStorage.removeItem(storageKey);
        } catch {
          // The job state remains on the chapter row.
        }
      }
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update the XianScan run.");
    } finally {
      setBusy(false);
    }
  }

  const statusCopy = job
    ? job.status === "failed" && job.error
      ? job.error
      : job.status === "working" && job.kaggle?.message
        ? job.kaggle.message
        : STATUS_COPY[job.status]
    : "Upload full-resolution pages, then run the XianScan image engine.";

  const beforePlaceholder = current
    ? current.storageState === "purged"
      ? "The original page is no longer stored in HwaFlow."
      : "The original page could not be loaded. Try refreshing the workspace."
    : "Choose a page to compare.";
  const afterPlaceholder = !job
    ? current?.hasRender
      ? "A saved XianScan render is available."
      : "Run XianScan to preview its cleaned and typeset result."
    : !aligned
      ? "This run no longer matches the chapter's current page list. Start a new run to compare safely."
      : isActive
        ? "XianScan is processing this page…"
        : job.status === "failed"
          ? "No finished image is available for this page."
          : job.status === "rejected"
            ? "This run was discarded. Start a new run for a fresh comparison."
            : "The finished page is not available yet.";

  const canUseSavedRender = Boolean(
    current?.hasRender && (!job || ["approved", "failed", "rejected"].includes(job.status))
  );
  const downloadHref = current && canUseSavedRender
    ? `/api/chapters/${chapterId}/download?page=${pageIndex + 1}`
    : current && job && hasOutput && aligned
      ? assetUrl(job.jobId, job.status === "approved" ? "approved" : "final", pageIndex)
      : null;

  return (
    <section className="xs-studio" aria-label="XianScan image studio">
      <header className="xs-studio-header">
        <div className="xs-studio-heading">
          <span className="xs-studio-mark" aria-hidden="true"><Wand className="h-5 w-5" /></span>
          <div className="xs-studio-title-copy">
            <p className="xs-studio-eyebrow">XIANSCAN · IMAGE STUDIO</p>
            <h2>Before &amp; after</h2>
            <p>Review the original art beside XianScan’s cleaned, translated page.</p>
          </div>
        </div>
        <div className="xs-studio-primary-actions">
          <PanelDropzone
            variant="button"
            onFiles={onUpload}
            busy={uploadBusy}
            progress={uploadProgress}
            disabled={!canUpload}
            pageCount={panels.length}
            remaining={MAX_CHAPTER_PAGES - panels.length}
          />
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => void startRun()}
            disabled={runDisabled}
            title={isActive ? "XianScan is already processing this chapter." : (canRunReason ?? "Run XianScan on the original pages")}
          >
            <Wand className="h-3.5 w-3.5" />
            {busy ? "Working…" : isActive ? "XianScan is running…" : job ? "Run again" : "Run XianScan"}
          </button>
        </div>
      </header>

      <div className="xs-studio-status" data-status={job?.status ?? "idle"}>
        <div className="xs-status-leading">
          <span className="xs-status-dot" aria-hidden="true" />
          <span className="xs-status-title">{job ? job.status.replaceAll("_", " ") : "Ready"}</span>
          <span className="xs-status-copy">{statusCopy}</span>
        </div>
        <div className="xs-status-trailing">
          {job ? <span className="xs-run-pages">{job.pageCount} page{job.pageCount === 1 ? "" : "s"} in run</span> : null}
          {isActive && jobId ? (
            <button type="button" className="xs-link-button" onClick={() => void readJob(jobId)} disabled={busy}>
              Refresh now
            </button>
          ) : null}
        </div>
      </div>

      {isActive && job ? (
        <div className="xs-progress" role="progressbar" aria-label="XianScan page progress" aria-valuemin={0} aria-valuemax={job.pageCount} aria-valuenow={pageDone}>
          <span className="xs-progress-fill" style={{ width: `${progressPercent}%` }} />
        </div>
      ) : null}

      {error ? (
        <div className="xs-engine-alert" role="alert">
          <AlertCircle className="h-4 w-4" />
          <span>{error}</span>
        </div>
      ) : null}

      {job && !aligned && panels.length > 0 ? (
        <div className="xs-engine-alert xs-engine-alert--warning" role="status">
          <AlertCircle className="h-4 w-4" />
          <span>This run processed {job.pageCount} pages, while the chapter now has {panels.length}. Its images can’t be safely matched to the current page order. Start a new run before importing or saving.</span>
        </div>
      ) : null}

      <div className="xs-studio-toolbar">
        <div className="xs-page-nav">
          <button type="button" className="xs-icon-button" onClick={() => onPageChange(Math.max(0, pageIndex - 1))} disabled={pageIndex <= 0} aria-label="Previous page" title="Previous page">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <strong>{panels.length ? `Page ${pageIndex + 1} / ${panels.length}` : "No pages"}</strong>
          {pageStateLabel ? <span className="xs-page-state" data-status={pageStateLabel}>{pageStateLabel}</span> : null}
          <button type="button" className="xs-icon-button" onClick={() => onPageChange(Math.min(panels.length - 1, pageIndex + 1))} disabled={pageIndex >= panels.length - 1} aria-label="Next page" title="Next page">
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>

        <div className="xs-review-controls">
          <div className="xs-view-modes" role="group" aria-label="Image comparison layout">
            <button type="button" aria-pressed={viewMode === "split"} onClick={() => setViewMode("split")}>Split</button>
            <button type="button" aria-pressed={viewMode === "before"} onClick={() => setViewMode("before")}>Before</button>
            <button type="button" aria-pressed={viewMode === "after"} onClick={() => setViewMode("after")}>After</button>
          </div>
          <button type="button" className="xs-tool-button" aria-pressed={showBoxes} onClick={() => onToggleBoxes(!showBoxes)} title="Show imported text regions on the original page">
            <ScanText className="h-3.5 w-3.5" />
            Boxes
          </button>
          <div className="xs-zoom-controls" role="group" aria-label="Preview zoom">
            <button type="button" onClick={() => applyZoom(zoom - 0.25)} disabled={zoom <= 0.5} aria-label="Zoom out" title="Zoom out">−</button>
            <span>{Math.round(zoom * 100)}%</span>
            <button type="button" onClick={() => applyZoom(zoom + 0.25)} disabled={zoom >= 2.5} aria-label="Zoom in" title="Zoom in">+</button>
            <button type="button" onClick={() => applyZoom(1)} title="Match the page to the window">Fit</button>
            <button type="button" onClick={() => applyZoom(1.5)} title="Zoom to 150% for close reading">100%+</button>
          </div>
          {downloadHref ? (
            <a className="xs-tool-button xs-download-link" href={downloadHref} download title="Download this finished page">
              <Download className="h-3.5 w-3.5" />
              Download
            </a>
          ) : null}
        </div>
      </div>

      {panels.length === 0 ? (
        <div className="xs-studio-empty">
          <PanelDropzone
            onFiles={onUpload}
            busy={uploadBusy}
            progress={uploadProgress}
            disabled={!canUpload}
            pageCount={panels.length}
            remaining={MAX_CHAPTER_PAGES - panels.length}
          />
          <div>
            <h3>Add original pages to start</h3>
            <p>Pages are kept at their original dimensions. XianScan receives the image files and series glossary—not text from the editor.</p>
          </div>
        </div>
      ) : (
        <div className="xs-compare" data-mode={viewMode}>
          <ImagePane
            side="before"
            label="Original page"
            imageUrl={rawUrl}
            fallbackUrl={rawFallback}
            placeholder={beforePlaceholder}
            panel={current}
            blocks={blocks}
            activeBlockId={activeBlockId}
            showBoxes={showBoxes}
            zoom={zoom}
            onExpand={() => setLightbox(true)}
          />
          <ImagePane
            side="after"
            label="XianScan result"
            imageUrl={finalUrl}
            fallbackUrl={finalFallback}
            placeholder={afterPlaceholder}
            panel={current}
            blocks={blocks}
            activeBlockId={activeBlockId}
            showBoxes={false}
            zoom={zoom}
            onExpand={() => setLightbox(true)}
          />
        </div>
      )}

      {panels.length > 0 ? (
        <div className="xs-filmstrip" role="tablist" aria-label="Chapter pages">
          {panels.map((panel, index) => {
            const pageStatus = job?.pages.find((page) => page.index === index)?.status;
            const thumbUrl = panel.previewUrl ?? panel.imageUrl;
            return (
              <button
                key={panel.id}
                type="button"
                className="xs-filmstrip-page"
                role="tab"
                aria-selected={index === pageIndex}
                aria-label={`Page ${index + 1}${pageStatus ? `, ${pageStatus}` : ""}`}
                onClick={() => onPageChange(index)}
              >
                <span className="xs-filmstrip-thumb">
                  {thumbUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={thumbUrl} alt="" loading="lazy" />
                  ) : <span aria-hidden="true"><ScanText className="h-4 w-4" /></span>}
                  {pageStatus ? <i className="xs-filmstrip-dot" data-status={pageStatus} aria-hidden="true" /> : null}
                </span>
                <span className="xs-filmstrip-number">{String(index + 1).padStart(2, "0")}</span>
              </button>
            );
          })}
          <span className="xs-filmstrip-budget">{panels.length}/{MAX_CHAPTER_PAGES} pages · {formatMB(MAX_CHAPTER_BYTES)} max</span>
        </div>
      ) : null}

      <div className="xs-studio-actions">
        <div className="xs-studio-action-copy">
          {imported ? (
            <span><Check className="h-3.5 w-3.5" /> Imported {imported.blocks} editable line{imported.blocks === 1 ? "" : "s"} across {imported.pages} page{imported.pages === 1 ? "" : "s"}{imported.skipped.length ? ` · ${imported.skipped.length} page${imported.skipped.length === 1 ? "" : "s"} skipped` : ""}.</span>
          ) : null}
          {rendered ? (
            <span><Check className="h-3.5 w-3.5" /> Saved {rendered.pages} finished page{rendered.pages === 1 ? "" : "s"} to this chapter{rendered.skipped.length ? ` · ${rendered.skipped.length} skipped` : ""}.</span>
          ) : null}
          {job?.status === "pending" ? <span className="xs-studio-hint">The engine is waiting for a worker to pick up this run.</span> : null}
          {hasStoredRenders && job?.status === "approved" ? <span className="xs-studio-hint">Saved page renders remain available in this chapter.</span> : null}
          {!canRun && canRunReason && panels.length > 0 ? <span className="xs-studio-hint">{canRunReason}</span> : null}
        </div>
        <div className="xs-studio-secondary-actions">
          {jobId && job?.status === "done" ? (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => void importText()} disabled={busy || !canImport} title={!aligned ? "Run the engine again after changing the chapter's page list." : "Import the XianScan lines into the editable text review"}>
              <Download className="h-3.5 w-3.5" />
              {busy ? "Working…" : "Import text"}
            </button>
          ) : null}
          {jobId && hasOutput ? (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => void savePages()} disabled={busy || !canSavePages} title={!aligned ? "Run the engine again after changing the chapter's page list." : "Save the finished images into this chapter"}>
              <Download className="h-3.5 w-3.5" />
              Save pages
            </button>
          ) : null}
          {jobId && job?.status === "done" && canApprove ? (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmAction("approve")} disabled={busy}>
              <Check className="h-3.5 w-3.5" />
              Approve output
            </button>
          ) : null}
          {jobId && ["pending", "working", "done"].includes(job?.status ?? "") && canApprove ? (
            <button type="button" className="xs-destructive-button" onClick={() => setConfirmAction("reject")} disabled={busy}>
              Discard run
            </button>
          ) : null}
        </div>
      </div>

      {lightbox && current ? (
        <div className="xs-lightbox-layer" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setLightbox(false); }}>
          <div className="xs-lightbox" role="dialog" aria-modal="true" aria-label={`Page ${pageIndex + 1} before and after comparison`} tabIndex={-1} ref={lightboxRef}>
            <div className="xs-lightbox-head">
              <div>
                <p className="xs-studio-eyebrow">XIANSCAN · FULL-SIZE REVIEW</p>
                <h2>Page {pageIndex + 1} of {panels.length}</h2>
              </div>
              <div className="xs-lightbox-controls">
                <button type="button" className="xs-icon-button" onClick={() => onPageChange(Math.max(0, pageIndex - 1))} disabled={pageIndex <= 0} aria-label="Previous page"><ArrowLeft className="h-4 w-4" /></button>
                <button type="button" className="xs-icon-button" onClick={() => onPageChange(Math.min(panels.length - 1, pageIndex + 1))} disabled={pageIndex >= panels.length - 1} aria-label="Next page"><ArrowRight className="h-4 w-4" /></button>
                <button type="button" className="xs-icon-button" onClick={() => setLightbox(false)} aria-label="Close large viewer"><X className="h-4 w-4" /></button>
              </div>
            </div>
            <div className="xs-lightbox-body">
              <ImagePane side="before" label="Original page" imageUrl={rawUrl} fallbackUrl={rawFallback} placeholder={beforePlaceholder} panel={current} blocks={blocks} activeBlockId={activeBlockId} showBoxes={showBoxes} zoom={1} onExpand={() => undefined} />
              <ImagePane side="after" label="XianScan result" imageUrl={finalUrl} fallbackUrl={finalFallback} placeholder={afterPlaceholder} panel={current} blocks={blocks} activeBlockId={activeBlockId} showBoxes={false} zoom={1} onExpand={() => undefined} />
            </div>
          </div>
        </div>
      ) : null}

      {confirmAction ? (
        <div className="xs-confirm-layer" role="presentation">
          <div className="xs-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="xs-confirm-title" aria-describedby="xs-confirm-copy" tabIndex={-1} ref={confirmationRef}>
            <span className="xs-confirm-icon" aria-hidden="true">{confirmAction === "approve" ? <Check className="h-5 w-5" /> : <AlertCircle className="h-5 w-5" />}</span>
            <p className="xs-studio-eyebrow">XIANSCAN RUN</p>
            <h2 id="xs-confirm-title">{confirmAction === "approve" ? "Approve this engine output?" : "Discard this engine run?"}</h2>
            <p id="xs-confirm-copy">
              {confirmAction === "approve"
                ? "Approval clears the engine-side raw and intermediate files. HwaFlow’s stored original pages remain unless the optional server-side purge setting is enabled. Save the finished pages first if you want a durable copy here."
                : "This permanently discards the run’s engine-side images and results. The original pages stored in this chapter are not changed."}
            </p>
            <div className="xs-confirm-actions">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmAction(null)} disabled={busy}>Cancel</button>
              <button type="button" className={confirmAction === "approve" ? "btn btn-primary btn-sm" : "xs-destructive-button"} onClick={() => void decide(confirmAction)} disabled={busy}>
                {busy ? "Working…" : confirmAction === "approve" ? "Approve & clean up" : "Discard run"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
