/**
 * Server-side client for the XianScan Engine Bridge Worker.
 *
 * The browser NEVER sees ENGINE_WEB_TOKEN and NEVER talks to the engine
 * directly. All traffic goes website -> Worker, and the engine itself only
 * makes outbound requests to the Worker (it never accepts inbound traffic).
 */

import "server-only";

import { retryDelaysMs, sleep } from "./async/retry";

function config() {
  const apiUrl = (process.env.ENGINE_API_URL || "").replace(/\/$/, "");
  const token = process.env.ENGINE_WEB_TOKEN || "";
  if (!apiUrl || !token) {
    throw new Error(
      "Image engine is not configured. Set ENGINE_API_URL and ENGINE_WEB_TOKEN in .env.local / Cloudflare secrets."
    );
  }
  return { apiUrl, token };
}

export type EnginePage = {
  index: number;
  status: string;
  mimeType?: string;
  error?: string;
};

export type EngineJob = {
  jobId: string;
  chapterId: string;
  status: "pending" | "working" | "done" | "failed" | "approved" | "rejected";
  sourceLang: string;
  targetLang: string;
  pageCount: number;
  pages: EnginePage[];
  createdAt: string;
  claimedAt: string | null;
  finishedAt: string | null;
  approvedAt: string | null;
  error: string | null;
  // Present when the Worker is driving an auto-started Kaggle kernel.
  kaggle?: {
    mode: string;
    status: string;
    ref: string | null;
    message: string | null;
    version?: number | null;
    pushedAt?: string | null;
    lastError?: string | null;
  } | null;
  urls: Array<{ index: number; raw: string; final: string; approved: string; regions: string }>;
};

/** Normal JSON calls: a Worker that has not answered in 15s is not about to. */
const DEFAULT_TIMEOUT_MS = 15_000;
/** The multipart upload can legitimately take longer on a slow connection. */
const UPLOAD_TIMEOUT_MS = 120_000;

async function engineFetch(
  path: string,
  init: RequestInit = {},
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<Response> {
  const { apiUrl, token } = config();
  const response = await fetch(`${apiUrl}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      ...(init.headers || {}),
    },
    cache: "no-store",
    // Without this a hung Worker holds the route until `maxDuration`, and the
    // retry in `engineAssetFetch` never gets a turn.
    signal: init.signal ?? AbortSignal.timeout(timeoutMs),
  });
  return response;
}

async function engineJson<T>(
  path: string,
  init?: RequestInit,
  timeoutMs?: number
): Promise<T> {
  const response = await engineFetch(path, init, timeoutMs);
  const text = await response.text();
  if (!response.ok) {
    let message = text;
    try {
      const parsed = JSON.parse(text) as { message?: string; error?: string };
      message = parsed.message || parsed.error || text;
    } catch { /* keep raw text */ }
    throw new Error(`Engine request failed (${response.status}): ${message.slice(0, 300)}`);
  }
  return JSON.parse(text) as T;
}

export type CreateEngineJobInput = {
  chapterId: string;
  pages: Array<{ blob: Blob; mimeType: string }>;
  sourceLang: string;
  targetLang?: string;
  glossary?: Array<{ sourceTerm: string; targetTerm: string; category: string }>;
  /** translations[enginePageIndex][blockIndex] = approved English text. */
  translations?: string[][];
};

/** POST /v1/jobs — one multipart upload containing every page of the chapter. */
export async function createEngineJob(
  input: CreateEngineJobInput
): Promise<{ jobId: string; status: string; pageCount: number }> {
  if (input.pages.length === 0) throw new Error("This chapter has no uploaded pages.");
  if (input.pages.length > 40) throw new Error("This bridge handles at most 40 pages per chapter.");

  const form = new FormData();
  form.set(
    "meta",
    JSON.stringify({
      chapterId: input.chapterId,
      pageCount: input.pages.length,
      sourceLang: input.sourceLang,
      targetLang: input.targetLang || "en",
      glossary: input.glossary || [],
      translations: input.translations || [],
    })
  );
  input.pages.forEach((page, index) => {
    const extension = page.mimeType === "image/webp" ? "webp" : "png";
    form.set(`page-${index}`, page.blob, `${String(index + 1).padStart(3, "0")}.${extension}`);
  });

  return engineJson("/v1/jobs", { method: "POST", body: form }, UPLOAD_TIMEOUT_MS);
}

export async function getEngineJob(jobId: string): Promise<EngineJob> {
  return engineJson(`/v1/jobs/${encodeURIComponent(jobId)}`);
}

/** Approve = keep the final PNGs for 7 days, delete the user's raw uploads now. */
export async function approveEngineJob(jobId: string): Promise<EngineJob> {
  return engineJson(`/v1/jobs/${encodeURIComponent(jobId)}/approve`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
}

export async function rejectEngineJob(jobId: string): Promise<EngineJob> {
  return engineJson(`/v1/jobs/${encodeURIComponent(jobId)}/reject`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
}

/**
 * A 5xx or a dropped connection is the Worker, not an answer: a cold start or a
 * restart while a 40-page chapter is being imported would otherwise show up as
 * "that image is no longer available". 4xx is final and is returned at once — a
 * rejected job must not cost the caller a second of retries.
 */
async function engineAssetFetch(path: string): Promise<Response> {
  const delays = retryDelaysMs();

  for (let attempt = 0; ; attempt += 1) {
    try {
      const response = await engineFetch(path);
      if (response.status < 500 || attempt >= delays.length) return response;
      // Release the error body before retrying.
      await response.body?.cancel().catch(() => undefined);
    } catch (error) {
      if (attempt >= delays.length) throw error;
    }
    await sleep(delays[attempt]);
  }
}

/** Streams an image/JSON blob from the Worker so no token ever reaches the browser. */
export async function proxyEngineAsset(
  jobId: string,
  kind: "raw" | "final" | "approved" | "clean" | "regions",
  page: number
): Promise<Response> {
  const response = await engineAssetFetch(
    `/v1/jobs/${encodeURIComponent(jobId)}/${kind}/${page}`
  );

  if (!response.ok) {
    return Response.json(
      { error: "engine_asset_unavailable", message: `That image is no longer available (${response.status}).` },
      { status: response.status === 404 ? 404 : 502 }
    );
  }
  const headers = new Headers();
  const contentType = response.headers.get("content-type");
  headers.set("content-type", contentType || (kind === "regions" ? "application/json" : "image/png"));
  headers.set("cache-control", "private, max-age=300");
  return new Response(await response.arrayBuffer(), { status: 200, headers });
}
