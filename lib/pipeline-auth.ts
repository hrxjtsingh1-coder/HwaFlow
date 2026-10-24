/**
 * Auth gate shared by the three pipeline route handlers.
 *
 * Until this module existed, `/api/pipeline/{extract,translate,proofread}` were
 * reachable without a session: the URL alone was enough to spend the Gemini
 * quota. The gate runs before the body is parsed and before the provider key is
 * inspected, so an anonymous caller learns nothing about the deployment and
 * cannot make us pay for a request.
 *
 * Chapter-level visibility is enforced by RLS once `chapters` lands (Phase 3);
 * these routes will call the same gate and then read the chapter with the
 * caller's cookie-bound client, where a missing row means "not yours".
 */

import "server-only";

import type { AuthUser } from "./identity";
import { LIMITS, throttleMessage } from "./rate-limit";
import { rateLimit } from "./rate-limit-server";
import { getViewer } from "./session";

export type PipelineAuth =
  | { ok: true; viewer: AuthUser }
  | { ok: false; response: Response };

/**
 * Returns the signed-in viewer, or a ready-to-return 401 JSON response.
 *
 * `Response.json` rather than `NextResponse.json`: the route handlers only need
 * the Web Response contract, and this keeps the helper free of `next/server`.
 */
export async function requirePipelineViewer(): Promise<PipelineAuth> {
  const viewer = await getViewer();

  if (!viewer) {
    return {
      ok: false,
      response: Response.json(
        {
          error: "unauthorized",
          message: "Sign in to use the translation pipeline.",
        },
        {
          status: 401,
          // A 401 must never be cached and replayed to the next visitor.
          headers: { "Cache-Control": "no-store" },
        }
      ),
    };
  }

  /*
   * Metered per viewer rather than per IP: the browser orchestrator runs
   * extract → translate → proofread for the same chapter, so an address-based
   * cap would throttle a whole team behind one office NAT.
   */
  const limit = await rateLimit(
    "pipeline:viewer",
    viewer.id,
    LIMITS.pipelinePerViewer
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
