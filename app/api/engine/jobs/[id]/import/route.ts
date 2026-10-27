/**
 * POST /api/engine/jobs/:id/import
 *
 * Copies the engine's `regions.json` back into `text_blocks`, so the existing
 * bubble editor shows the engine's boxes and its English text.
 *
 * Merge, not replace: `set_panel_blocks` treats an empty string as "no opinion"
 * and only deletes blocks that hold no text, so pipeline translations and hand
 * edits survive. Replacing outright would need a new RPC — `text_blocks` has a
 * SELECT policy only — which this integration deliberately avoids.
 */

import { requirePipelineViewer } from "@/lib/pipeline-auth";
import { createClient } from "@/lib/supabase/server";
import { getEngineJob, proxyEngineAsset, engineFailureResponse } from "@/lib/engine";
import { assertEngineJobAccess } from "@/lib/engine-access";
import { normaliseEngineRegions } from "@/lib/engine-regions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

type ImportSummary = {
  pages: number;
  blocks: number;
  /** Rows deleted by the explicit prune pass. Zero on a plain merge. */
  pruned: number;
  /** Older lines the merge kept because the engine did not mention them. */
  surplus: number;
  skipped: Array<{ page: number; reason: string }>;
};

// The real regions.json shape is owned by the Worker, which is not in this
// repo, so the adapter in lib/engine-regions.ts accepts several spellings.

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePipelineViewer();
  if (!auth.ok) return auth.response;

  // `prune` is the explicit second step: a plain import merges, and only a
  // deliberate request removes lines the engine did not mention.
  let prune = false;
  try {
    const body = (await request.json()) as { prune?: unknown };
    prune = body?.prune === true;
  } catch {
    /* empty body means merge */
  }

  const { id } = await params;
  try {
    // Writing blocks needs edit access, which is the same predicate as "can
    // view" today (Owner/Manager or assigned Staff). `set_panel_blocks` checks
    // `can_edit_chapter` again inside the database.
    const access = await assertEngineJobAccess(id, "view");
    if (!access.ok) return access.response;

    const job = await getEngineJob(id);
    if (job.status !== "done") {
      return Response.json(
        {
          error: "not-ready",
          message:
            job.status === "approved"
              ? "This run was already approved, and its intermediate files were deleted. Run the engine again to import its text."
              : "Wait for the engine to finish before importing its text.",
        },
        { status: 409, headers: { "Cache-Control": "no-store" } }
      );
    }

    const supabase = await createClient();
    const { data: pageRows, error: pageError } = await supabase
      .from("chapter_pages")
      .select("id, page_index, width, height, storage_state")
      .eq("chapter_id", job.chapterId)
      .order("page_index", { ascending: true });
    if (pageError) {
      return Response.json(
        { error: "storage", message: "Couldn't read this chapter's pages." },
        { status: 500 }
      );
    }

    const stored = (pageRows || []).filter((row) => row.storage_state === "stored");

    // The engine numbered pages in the order they were uploaded. If pages were
    // added or removed since, those numbers no longer line up and importing
    // would put text on the wrong panels.
    if (stored.length !== job.pageCount) {
      return Response.json(
        {
          error: "pages-changed",
          message: `This run processed ${job.pageCount} pages, but the chapter now has ${stored.length} originals. Run the engine again.`,
        },
        { status: 409 }
      );
    }

    const summary: ImportSummary = { pages: 0, blocks: 0, pruned: 0, surplus: 0, skipped: [] };
    /** page id -> the block indexes the engine actually produced. */
    const engineIndexes = new Map<string, Set<number>>();

    for (const [index, page] of stored.entries()) {
      let payload: unknown;
      try {
        const response = await proxyEngineAsset(id, "regions", index);
        if (!response.ok) {
          summary.skipped.push({ page: index + 1, reason: `regions unavailable (${response.status})` });
          continue;
        }
        payload = (await response.json()) as unknown;
      } catch (cause) {
        summary.skipped.push({
          page: index + 1,
          reason: cause instanceof Error ? cause.message : "unreadable regions",
        });
        continue;
      }

      const blocks = normaliseEngineRegions(payload, {
        width: page.width ?? 1,
        height: page.height ?? 1,
      });
      if (blocks.length === 0) {
        summary.skipped.push({ page: index + 1, reason: "no regions" });
        continue;
      }

      const { data: removed, error } = await supabase.rpc(
        prune ? "set_panel_engine_blocks" : "set_panel_blocks",
        {
          p_chapter_id: job.chapterId,
          p_page_id: page.id,
          p_blocks: blocks,
        }
      );
      if (error) {
        summary.skipped.push({ page: index + 1, reason: error.message });
        continue;
      }

      engineIndexes.set(page.id, new Set(blocks.map((block) => block.index)));
      summary.pages += 1;
      summary.blocks += blocks.length;
      if (prune) summary.pruned += Number(removed ?? 0);
    }

    // After a merge, tell the panel how many older lines the engine did not
    // mention. They are exactly what "Remove stale lines" would prune; counting
    // them is read-only and cannot delete anything.
    if (!prune) {
      const { data: remaining } = await supabase
        .from("text_blocks")
        .select("page_id, block_index, base_translation, final_text, is_edited")
        .eq("chapter_id", job.chapterId);

      for (const row of remaining ?? []) {
        if (row.is_edited) continue;
        if (!`${row.base_translation ?? ""}${row.final_text ?? ""}`.trim()) continue;
        const indexes = engineIndexes.get(row.page_id);
        // Pages the engine skipped are left untouched, so they are not surplus.
        if (!indexes) continue;
        if (indexes.has(row.block_index)) continue;
        summary.surplus += 1;
      }
    }

    return Response.json(summary, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return engineFailureResponse(error);
  }
}
