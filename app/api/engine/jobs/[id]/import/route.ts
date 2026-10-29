/**
 * POST /api/engine/jobs/:id/import
 *
 * Copies XianScan's regions into HwaFlow's editable text blocks. This is a
 * one-way import for human review; editor text is never sent back as engine
 * input. Existing human-edited translations are explicitly preserved on reimport.
 */

import { requireEngineViewer } from "@/lib/engine-auth";
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
  /** Older non-edited lines left in place because the engine did not mention them. */
  surplus: number;
  skipped: Array<{ page: number; reason: string }>;
};

// XianScan's regions.json shape is owned by the Worker, so the adapter in
// lib/engine-regions.ts accepts several spellings.
type ExistingBlock = {
  page_id: string;
  block_index: number;
  base_translation: string | null;
  final_text: string | null;
  is_edited: boolean;
};

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireEngineViewer();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  try {
    const access = await assertEngineJobAccess(id, "view");
    if (!access.ok) return access.response;

    const job = await getEngineJob(id);
    if (job.status !== "done") {
      return Response.json(
        {
          error: "not-ready",
          message:
            job.status === "approved"
              ? "This run was already approved, and its intermediate files were deleted. Run XianScan again to import its text."
              : "Wait for XianScan to finish before importing its text.",
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
    if (stored.length !== job.pageCount) {
      return Response.json(
        {
          error: "pages-changed",
          message: `This run processed ${job.pageCount} pages, but the chapter now has ${stored.length} stored originals. Run XianScan again.`,
        },
        { status: 409 }
      );
    }

    const { data: existingRows, error: existingError } = await supabase
      .from("text_blocks")
      .select("page_id, block_index, base_translation, final_text, is_edited")
      .eq("chapter_id", job.chapterId);
    if (existingError) {
      return Response.json(
        { error: "storage", message: "Couldn't protect the existing text edits." },
        { status: 500 }
      );
    }

    const existingByPage = new Map<string, Map<number, ExistingBlock>>();
    for (const row of (existingRows ?? []) as ExistingBlock[]) {
      let byIndex = existingByPage.get(row.page_id);
      if (!byIndex) {
        byIndex = new Map();
        existingByPage.set(row.page_id, byIndex);
      }
      byIndex.set(row.block_index, row);
    }

    const summary: ImportSummary = { pages: 0, blocks: 0, surplus: 0, skipped: [] };
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

      const oldByIndex = existingByPage.get(page.id);
      const safeBlocks = blocks.map((block) => {
        const old = oldByIndex?.get(block.index);
        if (!old?.is_edited) return block;
        return {
          ...block,
          baseTranslation: old.base_translation ?? "",
          finalText: old.final_text ?? "",
        };
      });

      const { error } = await supabase.rpc("set_panel_blocks", {
        p_chapter_id: job.chapterId,
        p_page_id: page.id,
        p_blocks: safeBlocks,
      });
      if (error) {
        summary.skipped.push({ page: index + 1, reason: error.message });
        continue;
      }

      engineIndexes.set(page.id, new Set(safeBlocks.map((block) => block.index)));
      summary.pages += 1;
      summary.blocks += safeBlocks.length;
    }

    const { data: remaining } = await supabase
      .from("text_blocks")
      .select("page_id, block_index, base_translation, final_text, is_edited")
      .eq("chapter_id", job.chapterId);

    for (const row of remaining ?? []) {
      if (row.is_edited) continue;
      if (!`${row.base_translation ?? ""}${row.final_text ?? ""}`.trim()) continue;
      const indexes = engineIndexes.get(row.page_id);
      // Pages the engine skipped are left untouched, so they are not surplus.
      if (!indexes || indexes.has(row.block_index)) continue;
      summary.surplus += 1;
    }

    return Response.json(summary, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return engineFailureResponse(error);
  }
}
