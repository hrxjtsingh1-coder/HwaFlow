/**
 * Rate-limit budgets and the pure half of the limiter.
 *
 * Kept free of `next/headers` and Supabase so the parsing and the copy can be
 * tested; `rate-limit-server.ts` does the round trip.
 *
 * Budgets are deliberately generous: engine uploads, status checks, and imports
 * are performed over multiple requests, and nobody should be throttled for
 * working normally.
 */

export const LIMITS = {
  loginPerIp: { limit: 10, windowSeconds: 60 },
  /** Password spraying rotates IPs, so the account is counted too. */
  loginPerUser: { limit: 6, windowSeconds: 60 },
  registerPerIp: { limit: 5, windowSeconds: 300 },
  enginePerViewer: { limit: 60, windowSeconds: 60 },
} as const;

export type RateLimit = { allowed: true } | { allowed: false; retryAfter: number };

/**
 * The left-most `x-forwarded-for` entry is the client; the rest are proxies.
 * Fallbacks share one bucket, which is correct for the failure mode: if the
 * header is missing the platform has no IP to hand us at all.
 */
export function forwardedIp(headerList: Headers): string {
  const forwarded = headerList.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return headerList.get("x-real-ip")?.trim() || "unknown";
}

export function throttleMessage(retryAfter: number): string {
  const seconds = Math.max(1, Math.ceil(retryAfter));
  return `Too many attempts. Try again in ${seconds} second${
    seconds === 1 ? "" : "s"
  }.`;
}
