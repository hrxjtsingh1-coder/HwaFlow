"use client";

/**
 * Drop-in panel for the chapter workspace: run the image engine, watch it,
 * compare before/after, approve (which purges the raws), or reject.
 *
 * Self-contained: inline styles, no new dependencies, no CSS file needed.
 * Mount it anywhere inside the workspace view with:
 *
 *   <EnginePanel chapterId={chapter.id} canApprove={canManage} />
 */

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";

type EnginePage = { index: number; status: string };
type EngineJob = {
  jobId: string;
  status: "pending" | "working" | "done" | "failed" | "approved" | "rejected";
  pageCount: number;
  pages: EnginePage[];
  error: string | null;
  finishedAt: string | null;
  approvedAt: string | null;
  urls: Array<{ index: number; raw: string; final: string; approved: string; regions: string }>;
};

type Props = {
  chapterId: string;
  /** Owner/Manager only, matching the rest of HwaFlow's approval flow. */
  canApprove?: boolean;
  /** Optional: let the parent move the chapter to `ready`/`approved` too. */
  onApproved?: (jobId: string) => void | Promise<void>;
};

type ImportSummary = {
  pages: number;
  blocks: number;
  pruned: number;
  surplus: number;
  skipped: Array<{ page: number; reason: string }>;
};

type RenderSummary = {
  pages: number;
  skipped: Array<{ page: number; reason: string }>;
};

const S = {
  box: {
    border: "1px solid var(--border, rgba(127,127,127,.28))",
    borderRadius: 14,
    padding: 16,
    margin: "16px 0",
    background: "var(--surface, rgba(127,127,127,.05))",
    color: "var(--text, inherit)",
    fontFamily: "inherit",
  } as CSSProperties,
  row: { display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" } as CSSProperties,
  title: { margin: 0, fontSize: 14, fontWeight: 650, letterSpacing: ".01em" } as CSSProperties,
  sub: { margin: "4px 0 0", fontSize: 12, opacity: 0.7 } as CSSProperties,
  button: {
    border: "1px solid rgba(127,127,127,.35)",
    borderRadius: 9,
    padding: "8px 13px",
    font: "inherit",
    fontSize: 13,
    cursor: "pointer",
    background: "transparent",
    color: "inherit",
  } as CSSProperties,
  primary: {
    border: "1px solid transparent",
    borderRadius: 9,
    padding: "8px 13px",
    font: "inherit",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    background: "#6c5ce7",
    color: "white",
  } as CSSProperties,
  chip: {
    display: "inline-block",
    padding: "3px 9px",
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 600,
    background: "rgba(108,92,231,.14)",
    color: "#6c5ce7",
  } as CSSProperties,
  compare: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 14 } as CSSProperties,
  figure: { margin: 0, minWidth: 0 } as CSSProperties,
  img: {
    width: "100%",
    maxHeight: 360,
    objectFit: "contain",
    borderRadius: 10,
    border: "1px solid rgba(127,127,127,.25)",
    background: "rgba(127,127,127,.08)",
  } as CSSProperties,
  caption: { fontSize: 11, opacity: 0.7, marginTop: 5 } as CSSProperties,
  error: { color: "#d64545", fontSize: 12, marginTop: 10 } as CSSProperties,
};

const STATUS_COPY: Record<EngineJob["status"], string> = {
  pending: "Queued — waiting for the engine to pick it up",
  working: "Engine is cleaning and typesetting the pages",
  done: "Ready for review",
  failed: "The engine could not finish this run",
  approved: "Approved — raws deleted, finals kept for 7 days",
  rejected: "Discarded",
};

export function EnginePanel({ chapterId, canApprove = true, onApproved }: Props) {
  const router = useRouter();
  const storageKey = `hwaflow.engineJob.${chapterId}`;
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<EngineJob | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [imported, setImported] = useState<ImportSummary | null>(null);
  const [rendered, setRendered] = useState<RenderSummary | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const readJob = useCallback(async (id: string) => {
    try {
      const response = await fetch(`/api/engine/jobs/${id}`, { cache: "no-store" });
      if (!response.ok) throw new Error((await response.json()).message || "Could not read the job.");
      const next = (await response.json()) as EngineJob;
      setJob(next);
      return next;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not read the job.");
      return null;
    }
  }, []);

  useEffect(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem(storageKey) : null;
    if (saved) {
      setJobId(saved);
      void readJob(saved);
    }
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [storageKey, readJob]);

  // Poll only while the engine is still working. Stops on terminal states.
  useEffect(() => {
    if (timer.current) { clearInterval(timer.current); timer.current = null; }
    if (!jobId || !job || !["pending", "working"].includes(job.status)) return;
    timer.current = setInterval(() => void readJob(jobId), 2500);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [jobId, job?.status, readJob]);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/engine/jobs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chapterId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Could not start the image engine.");
      localStorage.setItem(storageKey, data.jobId);
      setJobId(data.jobId);
      setPageIndex(0);
      await readJob(data.jobId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not start the image engine.");
    } finally {
      setBusy(false);
    }
  }

  async function importText(prune = false) {
    if (!jobId) return;
    setBusy(true);
    setError(null);
    setImported(null);
    try {
      const response = await fetch(`/api/engine/jobs/${jobId}/import`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prune }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Could not import the engine text.");
      setImported(data as ImportSummary);
      // The bubble editor is server-rendered; pull the new blocks in.
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not import the engine text.");
    } finally {
      setBusy(false);
    }
  }

  async function savePages() {
    if (!jobId) return;
    setBusy(true);
    setError(null);
    setRendered(null);
    try {
      const response = await fetch(`/api/engine/jobs/${jobId}/render`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Could not save the engine's pages.");
      setRendered(data as RenderSummary);
      // The viewer reads the new paths from the server-rendered bundle.
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save the engine's pages.");
    } finally {
      setBusy(false);
    }
  }

  async function decide(kind: "approve" | "reject") {
    if (!jobId) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/engine/jobs/${jobId}/${kind}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Could not update the job.");
      setJob(data);
      if (kind === "reject") {
        localStorage.removeItem(storageKey);
        setJobId(null);
        setJob(null);
      } else {
        await onApproved?.(jobId);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update the job.");
    } finally {
      setBusy(false);
    }
  }

  const active = job && ["pending", "working"].includes(job.status);
  const urls = job?.urls ?? [];
  const current = urls[Math.min(pageIndex, Math.max(0, urls.length - 1))];

  // Always fetch through our own route: the browser never learns the Worker
  // host, and the Worker's asset URLs may require the server-side token.
  const assetUrl = (kind: "raw" | "final" | "approved", index: number) =>
    job ? `/api/engine/jobs/${job.jobId}/${kind}/${index}` : "";

  return (
    <section style={S.box} aria-label="Image engine">
      <div style={{ ...S.row, justifyContent: "space-between" }}>
        <div>
          <h3 style={S.title}>Image engine</h3>
          <p style={S.sub}>
            Detect → erase → translate → typeset. Your originals are deleted the moment you approve.
          </p>
        </div>
        {job ? <span style={S.chip}>{job.status.toUpperCase()}</span> : null}
      </div>

      <div style={{ ...S.row, marginTop: 12 }}>
        <button type="button" style={S.primary} onClick={run} disabled={busy || Boolean(active)}>
          {busy ? "Working…" : job ? "Run again" : "Run image engine"}
        </button>
        {job ? (
          <button type="button" style={S.button} onClick={() => void readJob(job.jobId)} disabled={busy}>
            Refresh
          </button>
        ) : null}
        {job?.status === "done" && canApprove ? (
          <button type="button" style={S.button} onClick={() => void decide("approve")} disabled={busy}>
            ✓ Approve & clean up
          </button>
        ) : null}
        {job?.status === "done" ? (
          <button type="button" style={S.button} onClick={() => void importText()} disabled={busy}>
            ⇩ Import text
          </button>
        ) : null}
        {job && ["done", "approved"].includes(job.status) ? (
          <button type="button" style={S.button} onClick={() => void savePages()} disabled={busy}>
            ⇩ Save pages
          </button>
        ) : null}
        {job && job.status !== "approved" ? (
          <button type="button" style={S.button} onClick={() => void decide("reject")} disabled={busy}>
            Discard
          </button>
        ) : null}
      </div>

      {job ? <p style={S.sub}>{STATUS_COPY[job.status]}</p> : null}
      {job?.error ? <p style={S.error}>{job.error}</p> : null}
      {error ? <p style={S.error}>{error}</p> : null}
      {imported ? (
        <p style={S.sub}>
          Imported {imported.blocks} line{imported.blocks === 1 ? "" : "s"} into {imported.pages} page
          {imported.pages === 1 ? "" : "s"}.
          {imported.pruned > 0
            ? ` Removed ${imported.pruned} stale line${imported.pruned === 1 ? "" : "s"}.`
            : ""}
          {imported.skipped.length > 0
            ? ` Skipped ${imported.skipped.map((entry) => `p${entry.page} (${entry.reason})`).join(", ")}.`
            : ""}
        </p>
      ) : null}
      {imported && imported.surplus > 0 ? (
        <div style={{ ...S.row, marginTop: 6 }}>
          <span style={S.sub}>
            {imported.surplus} older line{imported.surplus === 1 ? "" : "s"} kept because the
            engine did not mention {imported.surplus === 1 ? "it" : "them"}.
          </span>
          <button type="button" style={S.button} onClick={() => void importText(true)} disabled={busy}>
            Remove stale lines
          </button>
        </div>
      ) : null}
      {rendered ? (
        <p style={S.sub}>
          Saved {rendered.pages} finished page{rendered.pages === 1 ? "" : "s"} into this chapter.
          {rendered.skipped.length > 0
            ? ` Skipped ${rendered.skipped.map((entry) => `p${entry.page} (${entry.reason})`).join(", ")}.`
            : ""}
        </p>
      ) : null}

      {job?.status === "pending" ? (
        <p style={S.sub}>
          The engine polls the queue. If nothing happens for a few minutes, the Kaggle/Colab notebook
          is probably sleeping — start it once and this will pick up automatically.
        </p>
      ) : null}

      {current && ["done", "approved"].includes(job?.status || "") ? (
        <>
          <div style={{ ...S.row, marginTop: 12, justifyContent: "space-between" }}>
            <span style={S.sub}>Page {current.index + 1} of {urls.length}</span>
            <div style={S.row}>
              <button
                type="button"
                style={S.button}
                disabled={pageIndex === 0}
                onClick={() => setPageIndex((value) => Math.max(0, value - 1))}
              >
                ← Prev
              </button>
              <button
                type="button"
                style={S.button}
                disabled={pageIndex >= urls.length - 1}
                onClick={() => setPageIndex((value) => Math.min(urls.length - 1, value + 1))}
              >
                Next →
              </button>
            </div>
          </div>
          <div style={S.compare}>
            <figure style={S.figure}>
              {job?.status === "approved" ? (
                <p style={S.sub}>The original was deleted when this run was approved.</p>
              ) : (
                <img style={S.img} src={assetUrl("raw", current.index)} alt="Original page" />
              )}
              <figcaption style={S.caption}>Original (deleted on approval)</figcaption>
            </figure>
            <figure style={S.figure}>
              <img
                style={S.img}
                src={assetUrl(job?.status === "approved" ? "approved" : "final", current.index)}
                alt="Cleaned and typeset page"
              />
              <figcaption style={S.caption}>Cleaned + typeset</figcaption>
            </figure>
          </div>
          <div style={{ ...S.row, marginTop: 10 }}>
            {urls.map((page) => (
              <a
                key={page.index}
                style={{ ...S.button, textDecoration: "none" }}
                href={assetUrl(job?.status === "approved" ? "approved" : "final", page.index)}
                download={`page-${String(page.index + 1).padStart(3, "0")}.png`}
              >
                ↓ Page {page.index + 1}
              </a>
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}
