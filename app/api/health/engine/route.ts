/**
 * GET /api/health/engine — is the image engine wired up?
 *
 * Two questions, because they fail for different reasons:
 *
 *   1. env   — are `ENGINE_API_URL` / `ENGINE_WEB_TOKEN` present? Both are
 *              server-only, so a `NEXT_PUBLIC_` copy is reported as a leak.
 *   2. probe — does the Worker answer, and does it accept the token? A 404 on a
 *              made-up job id is a PASS: it proves the request arrived and the
 *              bearer token was accepted. 401/403 means the token is wrong.
 *
 * The token is never echoed, and production gets a bare boolean: the detailed
 * report names internals.
 *
 * Open http://localhost:3000/api/health/engine after changing `.env.local`.
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
    // The one configuration mistake that would ship the token to the browser.
    tokenLeakedIntoPublicEnv: Boolean(process.env.NEXT_PUBLIC_ENGINE_WEB_TOKEN),
    purgeSupabaseOriginals: process.env.ENGINE_PURGE_SUPABASE_ORIGINALS === "1",
  };

  let probe: Probe | null = null;

  if (apiUrl && token) {
    try {
      const response = await fetch(
        `${apiUrl.replace(/\/+$/, "")}/v1/jobs/health-probe`,
        {
          headers: { authorization: `Bearer ${token}` },
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
        // 404 for an unknown job is the expected answer; any other status still
        // proves the Worker is up and the token was accepted.
        probe = { reachable: true, status: "ok", httpStatus: response.status };
      }
    } catch (error) {
      probe = { reachable: false, status: "error", message: messageOf(error) };
    }
  }

  const ok =
    env.apiUrl && env.token && !env.tokenLeakedIntoPublicEnv && probe?.status === "ok";

  if (!isDev) {
    return NextResponse.json({ ok }, { status: ok ? 200 : 503 });
  }

  const notes: string[] = [];
  if (!env.apiUrl) notes.push("ENGINE_API_URL is unset — the engine panel will refuse to start a run.");
  if (!env.token) notes.push("ENGINE_WEB_TOKEN is unset — the Worker would reject every request.");
  if (env.tokenLeakedIntoPublicEnv) {
    notes.push("NEXT_PUBLIC_ENGINE_WEB_TOKEN is set. Delete it and restart — that prefix ships to the browser.");
  }
  if (probe?.status === "locked") notes.push("Copy the token again from the Worker's secret store; a restart is required after changing .env.local.");
  if (probe?.status === "error") notes.push("The Worker did not answer. Check the deployment URL, or whether the account/project is awake.");
  if (ok) notes.push("Engine reachable and authenticated. Starting a run should work.");

  return NextResponse.json(
    { ok, env, probe, notes },
    { status: ok ? 200 : 503 }
  );
}
