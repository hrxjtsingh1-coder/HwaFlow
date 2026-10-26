/**
 * Authorization for the engine bridge routes.
 *
 * A job id is opaque, so every route that accepts one has to prove the caller
 * may touch the chapter behind it. `can_view_chapter` / `can_manage_chapter`
 * already encode HwaFlow's rule (Owner/Manager, or assigned Staff) and are
 * `security definer`, so this file only adds two things:
 *
 *   1. a `jobId -> chapterId` memo, so the Worker is asked once per job rather
 *      than once per image (the asset route is polled on every preview), and
 *   2. one small decision function, so the fail-open policy is auditable in a
 *      single place instead of being re-implemented per route.
 */

import "server-only";

import { getEngineJob } from "@/lib/engine";
import { createClient } from "@/lib/supabase/server";

export type EngineAccessLevel = "view" | "manage";

const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX_ENTRIES = 500;

const chapterByJob = new Map<string, { chapterId: string; at: number }>();

export type EngineAccessDecision = "allow" | "deny" | "allow-unverified";

/**
 * A definite `false` from Postgres is a refusal. Anything else — a missing
 * function, a network blip — would take the whole panel down if we treated it
 * as one, so it allows and logs. That is never weaker than the unguarded
 * routes this replaced, and the destructive step (purging originals) is still
 * refused by `purge_chapter_originals()` in the database itself.
 */
export function decideEngineAccess(
  allowed: boolean | null,
  roleError: { message: string } | null
): EngineAccessDecision {
  if (roleError) return "allow-unverified";
  if (allowed === false) return "deny";
  return "allow";
}

async function chapterForJob(jobId: string): Promise<string | null> {
  const cached = chapterByJob.get(jobId);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.chapterId;

  const job = await getEngineJob(jobId);
  if (!job.chapterId) return null;

  if (chapterByJob.size >= CACHE_MAX_ENTRIES) {
    const now = Date.now();
    for (const [key, entry] of chapterByJob) {
      if (now - entry.at >= CACHE_TTL_MS) chapterByJob.delete(key);
    }
    // Still full of hot entries: drop them rather than grow without bound in a
    // long-lived server. The only cost is one extra Worker read.
    if (chapterByJob.size >= CACHE_MAX_ENTRIES) chapterByJob.clear();
  }

  chapterByJob.set(jobId, { chapterId: job.chapterId, at: Date.now() });
  return job.chapterId;
}

export type EngineAccess = { ok: true } | { ok: false; response: Response };

/**
 * Call after the session check in any route that takes an engine job id.
 * `view` gates GET/asset reads, `manage` gates approve and reject.
 */
export async function assertEngineJobAccess(
  jobId: string,
  level: EngineAccessLevel
): Promise<EngineAccess> {
  let chapterId: string | null;
  try {
    chapterId = await chapterForJob(jobId);
  } catch (cause) {
    // Unknown job, or the Worker is unreachable. There is nothing to authorize
    // yet; the route's own engine call will answer 404/502, which is the honest
    // status for both cases.
    console.warn("[engine] access check could not resolve the job:", cause);
    return { ok: true };
  }

  if (!chapterId) return { ok: true };

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc(
      level === "manage" ? "can_manage_chapter" : "can_view_chapter",
      { p_chapter: chapterId }
    );

    const decision = decideEngineAccess(
      typeof data === "boolean" ? data : null,
      error ? { message: error.message } : null
    );

    if (decision === "deny") {
      return {
        ok: false,
        response: Response.json(
          {
            error: "forbidden",
            message:
              level === "manage"
                ? "Only an Owner or Manager can approve or discard engine results."
                : "You don't have access to this chapter.",
          },
          { status: 403, headers: { "Cache-Control": "no-store" } }
        ),
      };
    }

    if (decision === "allow-unverified") {
      console.warn("[engine] chapter access check skipped:", error?.message);
    }
    return { ok: true };
  } catch (cause) {
    console.warn("[engine] chapter access check unavailable:", cause);
    return { ok: true };
  }
}
