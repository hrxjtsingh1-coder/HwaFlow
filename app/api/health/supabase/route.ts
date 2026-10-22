/**
 * GET /api/health/supabase — is the database actually wired up?
 *
 * Three independent probes, because they fail for different reasons:
 *
 *   1. env   — are the variables present at all? `.env.local` changes need a
 *              dev-server restart; this is the check that catches that.
 *   2. anon  — does the publishable key reach PostgREST? An unsigned-in caller
 *              is denied on `profiles` (42501). That is a PASS, not a failure:
 *              it proves the request arrived and RLS is doing its job.
 *   3. admin — does the secret key work? It bypasses RLS, so a successful count
 *              proves the key is valid and the table exists.
 *
 * Open http://localhost:3000/api/health/supabase after adding the keys.
 */

import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PERMISSION_DENIED = "42501";

type Probe = {
  reachable: boolean;
  status: "ok" | "locked" | "error";
  count?: number | null;
  code?: string | null;
  message?: string;
  hint?: string | null;
};

type SupabaseError = {
  code?: string | null;
  message: string;
  hint?: string | null;
} | null;

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function probe(error: SupabaseError, count: number | null): Probe {
  if (!error) {
    return { reachable: true, status: "ok", count };
  }

  // Reachable, and correctly refused. This is the expected answer for a
  // signed-out caller: `profiles` grants nothing to `anon`.
  if (error.code === PERMISSION_DENIED) {
    return {
      reachable: true,
      status: "locked",
      code: error.code,
      message: error.message,
    };
  }

  return {
    reachable: false,
    status: "error",
    code: error.code ?? null,
    // An empty message means the body never arrived — almost always a HEAD
    // request, since HEAD responses carry no body for the error to live in.
    message: error.message || "(empty error body)",
    hint: error.hint ?? null,
  };
}

export async function GET() {
  const isDev = process.env.NODE_ENV !== "production";

  const env = {
    url: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    publishableKey: Boolean(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY),
    secretKey: Boolean(process.env.SUPABASE_SECRET_KEY),
    // The one configuration mistake that actually leaks data.
    secretLeakedIntoPublicEnv: Boolean(process.env.NEXT_PUBLIC_SUPABASE_SECRET_KEY),
  };

  const report = {
    ok: false,
    env,
    session: { signedIn: false, userId: null as string | null },
    anon: null as Probe | null,
    admin: null as Probe | null,
    notes: [] as string[],
  };

  /* 1. Public/publishable path, as the current session. */
  try {
    const supabase = await createClient();

    const { data, error } = await supabase.auth.getUser();
    if (!error && data.user) {
      report.session = { signedIn: true, userId: data.user.id };
    }

    /*
     * GET, not `head: true`. A HEAD response has no body, so PostgREST's
     * `42501 permission denied` never reaches the client and the check
     * reports an empty error instead of the expected "locked".
     */
    const { count, error: readError } = await supabase
      .from("profiles")
      .select("id", { count: "exact" })
      .limit(1);

    report.anon = probe(readError, count);
  } catch (error) {
    report.anon = { reachable: false, status: "error", message: messageOf(error) };
  }

  /* 2. Secret path. Not required for the app to run, so it never fails `ok`. */
  try {
    const admin = createAdminClient();
    const { count, error } = await admin
      .from("profiles")
      .select("id", { count: "exact" })
      .limit(1);

    report.admin = probe(error, count);
  } catch (error) {
    report.admin = { reachable: false, status: "error", message: messageOf(error) };
  }

  report.ok =
    env.url &&
    env.publishableKey &&
    !env.secretLeakedIntoPublicEnv &&
    report.anon.reachable;

  if (report.anon?.status === "locked") {
    report.notes.push(
      "Database reachable. `anon` was correctly denied on profiles — sign in to read rows."
    );
  }
  if (!env.secretKey) {
    report.notes.push(
      "SUPABASE_SECRET_KEY is unset. Fine for normal pages; admin actions and seeding will fail."
    );
  }
  if (env.secretLeakedIntoPublicEnv) {
    report.notes.push(
      "NEXT_PUBLIC_SUPABASE_SECRET_KEY is set. Delete it — that prefix ships to the browser."
    );
  }
  if (report.anon && !report.anon.reachable && /invalid api key/i.test(report.anon.message ?? "")) {
    report.notes.push(
      "Publishable key rejected. Copy it again from the dashboard's Connect dialog; an anon JWT key starts with eyJ and a publishable key with sb_publishable_."
    );
  }

  // Production gets a bare boolean: the detailed report names internals and
  // reports row counts, which is diagnostics, not public status.
  const body = isDev
    ? report
    : { ok: report.ok, signedIn: report.session.signedIn };

  return NextResponse.json(body, { status: report.ok ? 200 : 503 });
}
