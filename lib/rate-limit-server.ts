import "server-only";

import { headers } from "next/headers";

import { forwardedIp, type RateLimit } from "./rate-limit";
import { createClient } from "./supabase/server";

/**
 * Counts one hit against `bucket`/`subject` and reports whether it is allowed.
 *
 * Fails open. The migration that creates `rate_limit_hit` has to be applied by
 * hand, and a missing limiter must not take sign-in down with it.
 * shortcut: no protection until 20261101090000_rate_limits.sql is applied,
 * upgrade if this ever becomes the only abuse control.
 */
export async function rateLimit(
  bucket: string,
  subject: string,
  budget: { limit: number; windowSeconds: number }
): Promise<RateLimit> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("rate_limit_hit", {
      p_bucket: bucket,
      p_subject: subject,
      p_window_seconds: budget.windowSeconds,
      p_limit: budget.limit,
    });

    if (error) return { allowed: true };

    const row = (Array.isArray(data) ? data[0] : data) as
      | { allowed: boolean; retry_after: number }
      | undefined;

    if (!row) return { allowed: true };
    return row.allowed
      ? { allowed: true }
      : { allowed: false, retryAfter: Math.max(1, row.retry_after) };
  } catch {
    return { allowed: true };
  }
}

/** The caller's address, for limits that must survive an account rotation. */
export async function requestIp(): Promise<string> {
  return forwardedIp(await headers());
}
