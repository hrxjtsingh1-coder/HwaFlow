/**
 * POST /api/engine/jobs/:id/render
 *
 * Copies the engine's finished pages into the private `renders` bucket and
 * points `chapter_pages.clean_path` at them, so the workspace shows the typeset
 * page — including after the raw uploads were purged.
 *
 * `original_path` is never rewritten: extraction still OCRs the raw art, so the
 * text pipeline keeps seeing what the author drew, not the lettered page.
 *
 * One object per page id, uploaded with `upsert`, so re-running the engine
 * replaces the previous render instead of accumulating objects.
 */

import { requirePipelineViewer } from "@/lib/pipeline-auth";
import { createClient } from "@/lib/supabase/server";
import { getEngineJob, proxyEngineAsset, engineFailureResponse } from "@/lib/engine";
import { assertEngineJobAccess } from "@/lib/engine-access";
import { renderObjectPath } from "@/lib/engine-renders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const ALLOWED_TYPES = new Set(["image/png", "image/webp"]);

type RenderSummary = {
  pages: number;
  skipped: Array<{ page: number; reason: string }>;
};

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePipelineViewer();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  try {
    // Writing a render is an edit, and the `renders` bucket policy checks
    // `can_edit_chapter_path` on the object path.
    const access = await assertEngineJobAccess(id, "view");
    if (!access.ok) return access.response;

    const job = await getEngineJob(id);
    if (job.status !== "done" && job.status !== "approved") {
      return Response.json(
        {
          error: "not-ready",
          message:
            job.status === "rejected"
              ? "This run was discarded. Run the engine again to keep its pages."
              : "Wait for the engine to finish before saving its pages.",
        },
        { status: 409, headers: { "Cache-Control": "no-store" } }
      );
    }

    const supabase = await createClient();
    const { data: pageRows, error: pageError } = await supabase
      .from("chapter_pages")
      .select("id, page_index, original_path, storage_state")
      .eq("chapter_id", job.chapterId)
      .order("page_index", { ascending: true });
    if (pageError) {
      return Response.json(
        { error: "storage", message: "Couldn't read this chapter's pages." },
        { status: 500 }
      );
    }

    const stored = (pageRows || []).filter((row) => row.storage_state === "stored");

    // Engine page numbers are upload order. If pages changed since the run,
    // the numbers no longer line up and renders would land on the wrong rows.
    if (stored.length !== job.pageCount) {
      return Response.json(
        {
          error: "pages-changed",
          message: `This run processed ${job.pageCount} pages, but the chapter now has ${stored.length} originals. Run the engine again.`,
        },
        { status: 409 }
      );
    }

    const summary: RenderSummary = { pages: 0, skipped: [] };

    for (const [index, page] of stored.entries()) {
      let body: ArrayBuffer;
      let contentType = "image/png";
      try {
        const response = await proxyEngineAsset(id, "final", index);
        if (!response.ok) {
          summary.skipped.push({ page: index + 1, reason: `image unavailable (${response.status})` });
          continue;
        }
        const header = response.headers.get("content-type")?.split(";")[0].trim() ?? "";
        if (ALLOWED_TYPES.has(header)) contentType = header;
        body = await response.arrayBuffer();
      } catch (cause) {
        summary.skipped.push({
          page: index + 1,
          reason: cause instanceof Error ? cause.message : "unreadable image",
        });
        continue;
      }

      const path = renderObjectPath(page.original_path, page.id);
      const { error: uploadError } = await supabase.storage
        .from("renders")
        .upload(path, body, { contentType, upsert: true });
      if (uploadError) {
        summary.skipped.push({ page: index + 1, reason: uploadError.message });
        continue;
      }

      const { error: linkError } = await supabase.rpc("set_chapter_page_render", {
        p_page_id: page.id,
        p_path: path,
      });
      if (linkError) {
        summary.skipped.push({ page: index + 1, reason: linkError.message });
        continue;
      }

      summary.pages += 1;
    }

    return Response.json(summary, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return engineFailureResponse(error);
  }
}
