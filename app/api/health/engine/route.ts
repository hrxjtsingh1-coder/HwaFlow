/**
 * GET /api/health/engine — is the image engine wired up?
 *
 * Two checks:
 *
 *   1. env — are ENGINE_API_URL and ENGINE_WEB_TOKEN present?
 *      Both are server-only. A NEXT_PUBLIC_ copy is reported as a leak.
 *
 *   2. probe — does the bridge respond, and does it accept the token?
 *      A 404 for an unknown job is treated as a successful probe.
 *      A 401/403 means the token was rejected.
 *
 * Production returns only { ok }.
 * Development returns detailed diagnostics.
 */

import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Probe = {
  reachable: boolean;
  status: "ok" | "locked" | "error";
  httpStatus?: number;
  message?: string;
};

const PROBE_TIMEOUT_MS = 5000;

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function GET() {
  const isDev = process.env.NODE_ENV !== "production";

  const apiUrl = process.env.ENGINE_API_URL?.trim() ?? "";
  const token = process.env.ENGINE_WEB_TOKEN?.trim() ?? "";

  const env = {
    apiUrl: Boolean(apiUrl),
    token: Boolean(token),
    // Detect accidental exposure of the token to browser code.
    tokenLeakedIntoPublicEnv: Boolean(
      process.env.NEXT_PUBLIC_ENGINE_WEB_TOKEN
    ),
    purgeSupabaseOriginals:
      process.env.ENGINE_PURGE_SUPABASE_ORIGINALS === "1",
  };

  let probe: Probe | null = null;

  if (apiUrl && token) {
    try {
      const response = await fetch(
        `${apiUrl.replace(/\/+$/, "")}/v1/jobs/health-probe`,
        {
          headers: {
            authorization: `Bearer ${token}`,
          },
          cache: "no-store",
          signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
        }
      );

      if (response.status === 401 || response.status === 403) {
        probe = {
          reachable: true,
          status: "locked",
          httpStatus: response.status,
          message: "The engine is reachable but rejected ENGINE_WEB_TOKEN.",
        };
      } else {
        // A 404 for an unknown job is the expected response.
        probe = {
          reachable: true,
          status: "ok",
          httpStatus: response.status,
        };
      }
    } catch (error) {
      probe = {
        reachable: false,
        status: "error",
        message: messageOf(error),
      };
    }
  }

  const ok =
    env.apiUrl &&
    env.token &&
    !env.tokenLeakedIntoPublicEnv &&
    probe?.status === "ok";

  if (!isDev) {
    // Production exposes no internal configuration details.
    return NextResponse.json(
      { ok },
      { status: ok ? 200 : 503 }
    );
  }

  const notes: string[] = [];

  if (!env.apiUrl) {
    notes.push(
      "ENGINE_API_URL is unset — the engine panel will refuse to start a run."
    );
  }

  if (!env.token) {
    notes.push(
      "ENGINE_WEB_TOKEN is unset — the Worker would reject every request."
    );
  }

  if (env.tokenLeakedIntoPublicEnv) {
    notes.push(
      "NEXT_PUBLIC_ENGINE_WEB_TOKEN is set. Delete it and restart — that prefix ships to the browser."
    );
  }

  if (probe?.status === "locked") {
    notes.push(
      "The engine is reachable but rejected ENGINE_WEB_TOKEN. Check the configured tokens."
    );
  }

  if (probe?.status === "error") {
    notes.push(
      "The Worker did not answer. Check the deployment URL or network connectivity."
    );
  }

  if (ok) {
    notes.push(
      "Engine reachable and authenticated. Starting a run should work."
    );
  }

  return NextResponse.json(
    { ok, env, probe, notes },
    { status: ok ? 200 : 503 }
  );
}