/** POST /api/engine/jobs/:id/reject — throw away every image for this run. */

import { requirePipelineViewer } from "@/lib/pipeline-auth";
import { rejectEngineJob } from "@/lib/engine";
import { assertEngineJobAccess } from "@/lib/engine-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePipelineViewer();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  try {
    // Discarding someone else's run is destructive: Owner/Manager only.
    const access = await assertEngineJobAccess(id, "manage");
    if (!access.ok) return access.response;

    const job = await rejectEngineJob(id);
    return Response.json(job, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json(
      { error: "engine", message: error instanceof Error ? error.message : "Unknown engine error." },
      { status: 502 }
    );
  }
}
