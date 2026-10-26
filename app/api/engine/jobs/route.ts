/**
 * POST /api/engine/jobs — start an image-cleaning + typesetting run for a chapter.
 *
 * Reads the originals from Supabase Storage (where your dropzone already puts
 * them), forwards them to the Engine Bridge Worker, and returns a job id.
 * The browser never sees the engine URL or its token.
 */

import { requirePipelineViewer } from "@/lib/pipeline-auth";
import { createClient } from "@/lib/supabase/server";
import { createEngineJob } from "@/lib/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Matches the hard cap in lib/engine.ts, so the user gets a 413 not a 502. */
const ENGINE_MAX_PAGES = 40;
const ENGINE_MAX_BYTES = 80 * 1024 * 1024;

const isUuid = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

/** HwaFlow uses ko/ja/zh; the engine's OCR loader uses ko/ja/zh-Hans. */
function engineSourceLang(value: unknown): string {
  if (value === "zh") return "zh-Hans";
  if (value === "ko" || value === "ja") return value;
  return "auto";
}

export async function POST(request: Request) {
  const auth = await requirePipelineViewer();
  if (!auth.ok) return auth.response;

  let body: { chapterId?: unknown };
  try {
    body = (await request.json()) as { chapterId?: unknown };
  } catch {
    return Response.json({ error: "invalid-request", message: "Expected a JSON body." }, { status: 400 });
  }
  if (!isUuid(body.chapterId)) {
    return Response.json({ error: "invalid-request", message: "A valid chapterId is required." }, { status: 400 });
  }

  const supabase = await createClient();

  // RLS scopes this to chapters the viewer can see. Also gives us the series
  // id (for glossary) and the source language (for OCR).
  const { data: chapter, error: chapterError } = await supabase
    .from("chapters")
    .select("id, series_id")
    .eq("id", body.chapterId)
    .maybeSingle();
  if (chapterError || !chapter) {
    return Response.json({ error: "not-found", message: "That chapter was not found." }, { status: 404 });
  }

  const { data: series } = await supabase
    .from("series")
    .select("source_language")
    .eq("id", chapter.series_id)
    .maybeSingle();

  const { data: glossaryRows } = await supabase
    .from("glossary_terms")
    .select("source_term, target_term, category")
    .eq("series_id", chapter.series_id)
    .eq("status", "active")
    .limit(500);

  const { data: pageRows, error: pageError } = await supabase
    .from("chapter_pages")
    .select("id, page_index, original_path, storage_state, byte_size")
    .eq("chapter_id", body.chapterId)
    .order("page_index", { ascending: true });
  if (pageError) {
    return Response.json({ error: "storage", message: "Couldn't read this chapter's pages." }, { status: 500 });
  }

  // HwaFlow already ran Gemini extract -> translate -> proofread and keeps the
  // approved English text here. Ship it with the images so a Kaggle kernel
  // with NO internet can still typeset real translations (see kaggle/).
  const { data: blockRows } = await supabase
    .from("text_blocks")
    .select("page_id, block_index, source_text, base_translation, final_text")
    .eq("chapter_id", body.chapterId)
    .order("block_index", { ascending: true });

  const stored = (pageRows || []).filter((row) => row.storage_state === "stored");
  if (stored.length === 0) {
    return Response.json(
      { error: "no-pages", message: "This chapter has no original images left to process." },
      { status: 409 }
    );
  }

  // The whole chapter is buffered twice (Blobs, then the multipart body), so
  // refuse oversized runs up front with a real message instead of dying on an
  // out-of-memory 500 mid-request. 40 pages matches lib/engine.ts's contract.
  const totalBytes = stored.reduce((sum, row) => sum + (row.byte_size ?? 0), 0);
  if (stored.length > ENGINE_MAX_PAGES || totalBytes > ENGINE_MAX_BYTES) {
    return Response.json(
      {
        error: "too-large",
        message:
          `The image engine handles up to ${ENGINE_MAX_PAGES} pages / ` +
          `${Math.round(ENGINE_MAX_BYTES / (1024 * 1024))} MB per run. This chapter is ` +
          `${stored.length} pages, ${(totalBytes / (1024 * 1024)).toFixed(1)} MB — ` +
          `split it into smaller chapters or upload lighter pages.`,
      },
      { status: 413, headers: { "Cache-Control": "no-store" } }
    );
  }

  try {
    const pages: Array<{ blob: Blob; mimeType: string }> = [];
    for (const row of stored) {
      const { data: blob, error } = await supabase.storage.from("pages").download(row.original_path);
      if (error || !blob) {
        return Response.json(
          { error: "storage", message: `Couldn't read page ${row.page_index + 1}. Re-upload it and retry.` },
          { status: 502 }
        );
      }
      pages.push({ blob, mimeType: blob.type || "image/webp" });
    }

    // HwaFlow categories -> the engine CLI's TermDraft categories.
    const categoryMap: Record<string, string> = {
      character: "character",
      place: "location",
      honorific: "title",
      item: "item",
      term: "concept",
    };
    const glossary = (glossaryRows || []).map((term) => ({
      sourceTerm: term.source_term,
      targetTerm: term.target_term,
      category: categoryMap[term.category] || "other",
    }));

    // Align translations to the SAME page order as `pages` (stored, sorted by
    // page_index). XianScan numbers pages 001, 002, ... in that order.
    const blocksByPage = new Map<string, Array<{ text: string }>>();
    for (const block of blockRows || []) {
      const text = (block.final_text || block.base_translation || "").trim();
      if (!text) continue;
      const list = blocksByPage.get(block.page_id) || [];
      list.push({ text });
      blocksByPage.set(block.page_id, list);
    }
    const translations = stored.map(
      (row) => (blocksByPage.get(row.id) || []).map((b) => b.text)
    );

    const job = await createEngineJob({
      chapterId: body.chapterId,
      pages,
      sourceLang: engineSourceLang(series?.source_language),
      targetLang: "en",
      glossary,
      translations,
    });

    // Remember the run on the chapter so it survives a reload and is visible to
    // whoever reviews the chapter next. Best effort: a viewer without edit
    // rights can still start a run, and the panel keeps its own localStorage
    // fallback.
    const { error: linkError } = await supabase.rpc("set_chapter_engine_job", {
      p_chapter_id: body.chapterId,
      p_job: job.jobId,
    });
    if (linkError) {
      console.warn(`[engine] job ${job.jobId} not linked to chapter: ${linkError.message}`);
    }

    return Response.json(job, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown engine error.";
    return Response.json({ error: "engine", message }, { status: 502 });
  }
}
