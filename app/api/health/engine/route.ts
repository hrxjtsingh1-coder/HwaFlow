/**
 * GET /api/health/engine — is the image engine wired up?
 *
 * Two questions, because they fail for different reasons:
 *   1. env   — are ENGINE_API_URL / ENGINE_WEB_TOKEN present, and is no
 *              NEXT_PUBLIC_ copy leaking the token into browser code?
 *   2. probe — does the bridge answer, and does it accept the token?
 *
 * The probe deliberately targets an unknown `/v1/kernel/...` path. The Worker
 * checks WEB_TOKEN *before* routing, then returns 404 for an unknown kernel
 * path — with no storage read at all. So:
 *     404 = reachable + token accepted (PASS)
 *     401/403 = token rejected (locked)
 * The old `/v1/jobs/health-probe` path made the Worker do a B2 GET. On a cold
 * start that could exceed the 5s timeout and flip a healthy deployment to
 * "unhealthy" at random. This probe does no I/O.
 *
 * Production normally returns only `{ ok }`. For troubleshooting set
 * ENGINE_HEALTH_DEBUG=1 and call:
 *   curl -H "x-engine-debug: $ENGINE_WEB_TOKEN" \
 *        "https://<host>/api/health/engine?verbose=1"
 * The token is never echoed.
 */

import { NextResponse } from "next/server";
import { engineEnvSnapshot } from "@/lib/engine-cloudflare-env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Probe = {
  reachable: boolean;
  status: "ok" | "locked" | "error";
  httpStatus?: number;
  message?: string;
  elapsedMs?: number;
  attempts?: number;
  fromCache?: boolean;
  bodySnippet?: string;
  requestPath?: string;
};

const PROBE_PATH = "/v1/kernel/engine-health-probe";
const PROBE_TIMEOUT_MS = 15_000;
const PROBE_ATTEMPTS = 2;
const PROBE_RETRY_DELAY_MS = 300;
const SUCCESS_CACHE_MS = 60_000;

/** Module scope: one warm instance remembers a recent pass for a minute. */
let lastGoodProbe: { key: string; at: number; httpStatus?: number } | null = null;

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function hostOf(raw: string): string | null {
  try {
    return new URL(raw).host;
  } catch {
    return "INVALID_URL";
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function probeOnce(url: string, token: string): Promise<Probe> {
  const started = Date.now();
  try {
    const response = await fetch(url, {
      headers: { authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    const common = {
      elapsedMs: Date.now() - started,
      bodySnippet: (await response.text()).slice(0, 300),
      requestPath: url,
    };

    if (response.status === 401 || response.status === 403) {
      return {
        reachable: true,
        status: "locked",
        httpStatus: response.status,
        message: "The bridge is reachable but rejected ENGINE_WEB_TOKEN.",
        ...common,
      };
    }
    // 404 for the unknown kernel path is the expected answer; any other status
    // still proves the bridge is up and the token was accepted.
    return {
      reachable: true,
      status: "ok",
      httpStatus: response.status,
      ...common,
    };
  } catch (error) {
    return {
      reachable: false,
      status: "error",
      message: messageOf(error),
      elapsedMs: Date.now() - started,
      requestPath: url,
    };
  }
}

export async function GET(request: Request) {
  const isDev = process.env.NODE_ENV !== "production";

  const { apiUrl, token, apiUrlSet, tokenSet } = await engineEnvSnapshot();

  const env = {
    apiUrl: apiUrlSet,
    token: tokenSet,
    tokenLeakedIntoPublicEnv: Boolean(process.env.NEXT_PUBLIC_ENGINE_WEB_TOKEN),
    purgeSupabaseOriginals: process.env.ENGINE_PURGE_SUPABASE_ORIGINALS === "1",
    strictAccess: process.env.ENGINE_STRICT_ACCESS === "1",
    healthDebug: process.env.ENGINE_HEALTH_DEBUG === "1",
    nodeEnv: process.env.NODE_ENV ?? null,
    apiUrlHost: apiUrl ? hostOf(apiUrl) : null,
    tokenLength: token.length,
  };

  const url = `${apiUrl.replace(/\/+$/, "")}${PROBE_PATH}`;
  const cacheKey = `${apiUrl}|${token}`;

  let probe: Probe | null = null;

  if (apiUrl && token) {
    const cached = lastGoodProbe;
    if (cached && cached.key === cacheKey && Date.now() - cached.at < SUCCESS_CACHE_MS) {
      probe = {
        reachable: true,
        status: "ok",
        httpStatus: cached.httpStatus ?? 404,
        fromCache: true,
        requestPath: url,
      };
    } else {
      let attempts = 0;
      for (let i = 0; i < PROBE_ATTEMPTS; i += 1) {
        attempts += 1;
        probe = await probeOnce(url, token);
        // Only a thrown fetch / timeout is worth retrying. A 401 is a real
        // answer and must not be hidden by a retry.
        if (probe.status !== "error") break;
        if (i + 1 < PROBE_ATTEMPTS) await sleep(PROBE_RETRY_DELAY_MS);
      }
      if (probe) probe.attempts = attempts;
      if (probe?.status === "ok") {
        lastGoodProbe = { key: cacheKey, at: Date.now(), httpStatus: probe.httpStatus };
      } else {
        lastGoodProbe = null;
      }
    }
  }

  const ok = Boolean(
    env.apiUrl && env.token && !env.tokenLeakedIntoPublicEnv && probe?.status === "ok"
  );

  if (!ok) {
    // No token, no URL value — just the reason. Check the host's logs when the
    // endpoint is red and you don't want to turn on verbose mode.
    console.warn("[engine-health] check failed", {
      apiUrlHost: env.apiUrlHost,
      tokenPresent: env.token,
      tokenLeakedIntoPublicEnv: env.tokenLeakedIntoPublicEnv,
      probeStatus: probe?.status ?? "skipped",
      httpStatus: probe?.httpStatus,
      message: probe?.message,
    });
  }

  const wantsVerbose = new URL(request.url).searchParams.get("verbose") === "1";
  const debugHeader = request.headers.get("x-engine-debug") ?? "";
  const verbose =
    isDev || (env.healthDebug && wantsVerbose && Boolean(token) && debugHeader === token);

  if (!verbose) {
    return NextResponse.json({ ok }, { status: ok ? 200 : 503 });
  }

  const notes: string[] = [];
  if (!env.apiUrl) notes.push("ENGINE_API_URL is unset — the engine panel will refuse to start a run.");
  if (!env.token) notes.push("ENGINE_WEB_TOKEN is unset — the bridge would reject every request.");
  if (env.apiUrlHost === "INVALID_URL") {
    notes.push("ENGINE_API_URL is not a valid absolute URL; use https://engine.hwaflow.space.");
  }
  if (env.tokenLeakedIntoPublicEnv) {
    notes.push("NEXT_PUBLIC_ENGINE_WEB_TOKEN is set. Delete it and restart — that prefix ships to the browser.");
  }
  if (probe?.status === "locked") {
    notes.push("ENGINE_WEB_TOKEN does not equal the bridge's WEB_TOKEN secret. Set both from the same string.");
  }
  if (probe?.status === "error") {
    notes.push("The bridge did not answer. Check the URL, DNS/TLS, and host egress rules.");
  }
  if (ok) notes.push("Engine reachable and authenticated. Starting a run should work.");

  return NextResponse.json(
    { ok, env, probe, notes },
    { status: ok ? 200 : 503 }
  );
}
