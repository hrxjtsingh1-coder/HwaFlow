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
import { decideEngineAccess } from "@/lib/engine-access-policy";

export { decideEngineAccess };
export type { EngineAccessDecision } from "@/lib/engine-access-policy";

export type EngineAccessLevel = "view" | "manage";

const CACHE_TTL_MS = 10 * 60 * 1000;
/* A job with no chapter link is remembered briefly, not for the full window:
 * the link can appear once the Worker finishes accepting the upload. */
const MISS_TTL_MS = 60 * 1000;
const CACHE_MAX_ENTRIES = 500;

const chapterByJob = new Map<
  string,
  { chapterId: string | null; at: number }
>();

/**
 * Default policy: a definite `false` from Postgres is a refusal. Anything
 * else — a missing function, a network blip — allows and logs (see
 * lib/engine-access-policy.ts). With ENGINE_STRICT_ACCESS=1 the opposite
 * applies: only a definite `true` is accepted. The destructive step
 * (purging originals) is always refused by purge_chapter_originals() itself.
 */
async function chapterForJob(jobId: string): Promise<string | null> {
  const cached = chapterByJob.get(jobId);
  if (cached) {
    const ttl = cached.chapterId ? CACHE_TTL_MS : MISS_TTL_MS;
    if (Date.now() - cached.at < ttl) return cached.chapterId;
  }

  const job = await getEngineJob(jobId);

  if (chapterByJob.size >= CACHE_MAX_ENTRIES) {
    const now = Date.now();
    for (const [key, entry] of chapterByJob) {
      const ttl = entry.chapterId ? CACHE_TTL_MS : MISS_TTL_MS;
      if (now - entry.at >= ttl) chapterByJob.delete(key);
    }
    // Still full of hot entries: drop them rather than grow without bound in a
    // long-lived server. The only cost is one extra Worker read.
    if (chapterByJob.size >= CACHE_MAX_ENTRIES) chapterByJob.clear();
  }

  if (!job.chapterId) {
    // No link means nothing to authorize against, and the asset route is polled
    // on every preview: without remembering the miss, one unlinked job costs a
    // Worker read and a warning per image. Remember it briefly and say it once.
    console.warn(
      `[engine] job ${jobId} carries no chapterId; access checks are skipped for it`
    );
    chapterByJob.set(jobId, { chapterId: null, at: Date.now() });
    return null;
  }

  chapterByJob.set(jobId, { chapterId: job.chapterId, at: Date.now() });
  return job.chapterId;
}

export type EngineAccess = { ok: true } | { ok: false; response: Response };

function deny(level: EngineAccessLevel, message?: string): EngineAccess {
  return {
    ok: false,
    response: Response.json(
      {
        error: "forbidden",
        message: message ?? (level === "manage"
          ? "Only an Owner or Manager can approve or discard engine results."
          : "You don't have access to this chapter."),
      },
      { status: 403, headers: { "Cache-Control": "no-store" } }
    ),
  };
}

/**
 * Call after the session check in any route that takes an engine job id.
 * `view` gates GET/asset reads, `manage` gates approve and reject.
 */
export async function assertEngineJobAccess(
  jobId: string,
  level: EngineAccessLevel
): Promise<EngineAccess> {
  const strict = process.env.ENGINE_STRICT_ACCESS === "1";

  let chapterId: string | null;
  try {
    chapterId = await chapterForJob(jobId);
  } catch (cause) {
    // Unknown job, or the Worker is unreachable. There is nothing to authorize
    // yet; the route's own engine call will answer 404/502, which is the honest
    // status for both cases. Strict mode refuses instead of guessing.
    console.warn("[engine] access check could not resolve the job:", cause);
    if (strict) return deny(level, "This engine job could not be verified.");
    return { ok: true };
  }

  if (!chapterId) {
    if (strict) return deny(level, "This engine job has no linked chapter to authorize against.");
    return { ok: true };
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc(
      level === "manage" ? "can_manage_chapter" : "can_view_chapter",
      { p_chapter: chapterId }
    );

    const decision = decideEngineAccess(
      typeof data === "boolean" ? data : null,
      error ? { message: error.message } : null,
      strict
    );

    if (decision === "deny") return deny(level);
    if (decision === "allow-unverified") {
      console.warn("[engine] chapter access check skipped:", error?.message);
    }
    return { ok: true };
  } catch (cause) {
    console.warn("[engine] chapter access check unavailable:", cause);
    if (strict) return deny(level, "Chapter access could not be verified.");
    return { ok: true };
  }
}
