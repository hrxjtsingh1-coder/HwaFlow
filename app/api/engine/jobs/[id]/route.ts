/** GET /api/engine/jobs/:id — status + page URLs for the workspace UI. */

import { requireEngineViewer } from "@/lib/engine-auth";
import { getEngineJob, engineFailureResponse } from "@/lib/engine";
import { assertEngineJobAccess } from "@/lib/engine-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireEngineViewer();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  try {
    const access = await assertEngineJobAccess(id, "view");
    if (!access.ok) return access.response;

    const job = await getEngineJob(id);
    return Response.json(job, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return engineFailureResponse(error);
  }
}
