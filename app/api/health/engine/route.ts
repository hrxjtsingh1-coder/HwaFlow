/**
 * GET /api/health/engine — is the image engine wired up?
 *
 * Checks:
 *   1. ENGINE_API_URL and ENGINE_WEB_TOKEN are present.
 *   2. NEXT_PUBLIC_ENGINE_WEB_TOKEN is not configured.
 *   3. The bridge responds to an authenticated health probe.
 *
 * TEMPORARY DEBUGGING:
 * Production returns diagnostic status without exposing secrets.
 * Remove detailed production diagnostics after resolving the 503.
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
          message: "The engine rejected ENGINE_WEB_TOKEN.",
        };
      } else {
        // A 404 for an unknown job is an expected successful probe.
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

  const notes: string[] = [];

  if (!env.apiUrl) {
    notes.push("ENGINE_API_URL is missing.");
  }

  if (!env.token) {
    notes.push("ENGINE_WEB_TOKEN is missing.");
  }

  if (env.tokenLeakedIntoPublicEnv) {
    notes.push(
      "NEXT_PUBLIC_ENGINE_WEB_TOKEN exists. Remove it from the environment."
    );
  }

  if (probe?.status === "locked") {
    notes.push("The bridge rejected authentication.");
  }

  if (probe?.status === "error") {
    notes.push("The bridge request failed or timed out.");
  }

  if (ok) {
    notes.push("The engine probe passed.");
  }

  if (!probe && env.apiUrl && env.token) {
    notes.push("The probe did not produce a result.");
  }

  if (!isDev) {
    // TEMPORARY: Detailed status only; never return the token or API headers.
    return NextResponse.json(
      { ok, env, probe, notes },
      { status: ok ? 200 : 503 }
    );
  }

  return NextResponse.json(
    { ok, env, probe, notes },
    { status: ok ? 200 : 503 }
  );
}