/**
 * Auth gate for the XianScan engine and chapter-download API routes.
 *
 * Authenticate before parsing potentially large request bodies or proxying a
 * request to the Worker. This is shared route infrastructure, not a translation
 * provider or browser-side pipeline.
 */

import "server-only";

import type { AuthUser } from "./identity";
import { LIMITS, throttleMessage } from "./rate-limit";
import { rateLimit } from "./rate-limit-server";
import { getViewer } from "./session";

export type EngineAuth =
  | { ok: true; viewer: AuthUser }
  | { ok: false; response: Response };

/** Returns the signed-in viewer, or a ready-to-return 401/429 response. */
export async function requireEngineViewer(): Promise<EngineAuth> {
  const viewer = await getViewer();

  if (!viewer) {
    return {
      ok: false,
      response: Response.json(
        { error: "unauthorized", message: "Sign in to continue." },
        {
          status: 401,
          headers: { "Cache-Control": "no-store" },
        }
      ),
    };
  }

  // Meter per viewer rather than per IP so a team behind one office NAT does
  // not share a single request budget.
  const limit = await rateLimit(
    "engine:viewer",
    viewer.id,
    LIMITS.enginePerViewer
  );
  if (!limit.allowed) {
    return {
      ok: false,
      response: Response.json(
        {
          error: "rate-limited",
          message: throttleMessage(limit.retryAfter),
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(limit.retryAfter),
            "Cache-Control": "no-store",
          },
        }
      ),
    };
  }

  return { ok: true, viewer };
}
