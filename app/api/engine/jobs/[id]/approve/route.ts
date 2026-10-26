/**
 * POST /api/engine/jobs/:id/approve
 *
 * This is the "Approve" click. It copies the final PNGs into the 7-day bucket
 * and deletes the engine's raw uploads + all intermediate images immediately.
 *
 * If ENGINE_PURGE_SUPABASE_ORIGINALS=1, it ALSO deletes the user's original
 * WebPs from the Supabase `pages` bucket and marks those rows purged — closing
 * the loop on the "raw must not survive approval" requirement.
 *
 * Owner/Manager only: `assertEngineJobAccess(id, "manage")` reuses the same
 * `can_manage_chapter` predicate the UI's `canManage` and the SQL RPC below
 * use, so a direct URL cannot bypass it.
 */

import { requirePipelineViewer } from "@/lib/pipeline-auth";
import { createClient } from "@/lib/supabase/server";
import { approveEngineJob, engineFailureResponse } from "@/lib/engine";
import { assertEngineJobAccess } from "@/lib/engine-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePipelineViewer();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  try {
    // Server-side Owner/Manager check. The purge RPC below enforces this too,
    // but a direct URL to this route must not bypass it.
    const access = await assertEngineJobAccess(id, "manage");
    if (!access.ok) return access.response;

    const job = await approveEngineJob(id);

    // Best-effort: engine approval already succeeded, so a purge failure must
    // never turn this into an error response.
    if (process.env.ENGINE_PURGE_SUPABASE_ORIGINALS === "1" && job.chapterId) {
      try {
        const supabase = await createClient();
        const { data: pageRows } = await supabase
          .from("chapter_pages")
          .select("original_path")
          .eq("chapter_id", job.chapterId)
          .eq("storage_state", "stored");

        const paths = (pageRows || [])
          .map((row) => row.original_path)
          .filter((path): path is string => typeof path === "string" && path.length > 0);

        // The RPC checks permissions + the group's retention_policy first.
        // Only delete objects if it actually purged rows.
        const { data: purged, error: purgeError } = await supabase.rpc(
          "purge_chapter_originals",
          { p_chapter: job.chapterId }
        );

        if (!purgeError && Number(purged) > 0 && paths.length > 0) {
          const { error: removeError } = await supabase.storage.from("pages").remove(paths);
          if (removeError) {
            console.warn(`[engine] originals marked purged but Storage delete failed: ${removeError.message}`);
          }
        } else if (purgeError) {
          // Most likely the optional migration has not been applied yet, or
          // the caller is not a manager. Engine approval still stands.
          console.warn(`[engine] Supabase purge skipped: ${purgeError.message}`);
        }
      } catch (cause) {
        console.warn("[engine] Supabase purge skipped:", cause);
      }
    }

    return Response.json(job, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return engineFailureResponse(error);
  }
}
