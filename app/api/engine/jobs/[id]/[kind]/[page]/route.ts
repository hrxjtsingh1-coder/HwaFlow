/**
 * GET /api/engine/jobs/:id/:kind/:page
 *
 * Streams raw / final / approved / clean images and regions JSON from the
 * Engine Bridge Worker. The engine token stays server-side.
 */

import { getViewer } from "@/lib/session";
import { proxyEngineAsset, engineFailureResponse } from "@/lib/engine";
import { assertEngineJobAccess } from "@/lib/engine-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Kind = "raw" | "final" | "approved" | "clean" | "regions";
const KINDS: Kind[] = ["raw", "final", "approved", "clean", "regions"];

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; kind: string; page: string }> }
) {
  // Assets are polled/rendered many times per chapter, so use the cheap
  // session check here instead of the pipeline rate limiter.
  const viewer = await getViewer();
  if (!viewer) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id, kind, page } = await params;
  if (!KINDS.includes(kind as Kind) || !/^\d+$/.test(page)) {
    return Response.json({ error: "invalid-request" }, { status: 400 });
  }

  // A job id is only a capability if we check the chapter behind it.
  const access = await assertEngineJobAccess(id, "view");
  if (!access.ok) return access.response;

  try {
    return await proxyEngineAsset(id, kind as Kind, Number(page));
  } catch (error) {
    return engineFailureResponse(error);
  }
}
