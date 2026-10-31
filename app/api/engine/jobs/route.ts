/**
 * POST /api/engine/jobs — start a XianScan image-processing run for a chapter.
 *
 * Only the chapter's full-resolution original images, source language, and
 * active series glossary go to XianScan. HwaFlow text blocks—whether imported,
 * edited, mock, or empty—are deliberately not read or sent as translation input.
 */

import { requireEngineViewer } from "@/lib/engine-auth";
import { createClient } from "@/lib/supabase/server";
import {
  assertEngineConfigured,
  createEngineJob,
  engineFailureResponse,
} from "@/lib/engine";
import {
  formatMB,
  MAX_CHAPTER_BYTES,
  MAX_CHAPTER_PAGES,
  MAX_PAGE_BYTES,
} from "@/lib/engine-limits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const isUuid = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

/** HwaFlow uses ko/ja/zh; XianScan's OCR loader expects zh-Hans. */
function engineSourceLang(value: unknown): string {
  if (value === "zh") return "zh-Hans";
  if (value === "ko" || value === "ja") return value;
  return "auto";
}

/**
 * A stored original must be a real page. Blank placeholders (the 51-byte PNGs
 * that used to reach the bridge and sit in "working" forever) are refused here,
 * before any job exists.
 */
function pngPlaceholderReason(bytes: Uint8Array): string | null {
  const isPng =
    bytes.length >= 24 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e;
  if (isPng) {
    const width = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(16);
    const height = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(20);
    if (width * height < 40_000) {
      return `is a ${width}\u00d7${height} placeholder, not a page`;
    }
    return null;
  }
  if (bytes.length < 2048) return "is too small to be a page image";
  return null;
}

function tooLargeMessage(pageCount: number, totalBytes: number): string {
  return (
    `The image engine handles up to ${MAX_CHAPTER_PAGES} full-resolution pages, ` +
    `${formatMB(MAX_PAGE_BYTES)} per page, and ${formatMB(MAX_CHAPTER_BYTES)} per chapter. ` +
    `This chapter is ${pageCount} pages / ${formatMB(totalBytes)}.`
  );
}

export async function POST(request: Request) {
  const auth = await requireEngineViewer();
  if (!auth.ok) return auth.response;

  let body: { chapterId?: unknown };
  try {
    body = (await request.json()) as { chapterId?: unknown };
  } catch {
    return Response.json(
      { error: "invalid-request", message: "Expected a JSON body." },
      { status: 400 }
    );
  }
  if (!isUuid(body.chapterId)) {
    return Response.json(
      { error: "invalid-request", message: "A valid chapterId is required." },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const { data: chapter, error: chapterError } = await supabase
    .from("chapters")
    .select("id, series_id")
    .eq("id", body.chapterId)
    .maybeSingle();
  if (chapterError || !chapter) {
    return Response.json(
      { error: "not-found", message: "That chapter was not found." },
      { status: 404 }
    );
  }

  const [{ data: series }, { data: glossaryRows }, { data: pageRows, error: pageError }] =
    await Promise.all([
      supabase
        .from("series")
        .select("source_language")
        .eq("id", chapter.series_id)
        .maybeSingle(),
      supabase
        .from("glossary_terms")
        .select("source_term, target_term, category")
        .eq("series_id", chapter.series_id)
        .eq("status", "active")
        .limit(500),
      supabase
        .from("chapter_pages")
        .select("id, page_index, original_path, storage_state, byte_size")
        .eq("chapter_id", body.chapterId)
        .order("page_index", { ascending: true }),
    ]);

  if (pageError) {
    return Response.json(
      { error: "storage", message: "Couldn't read this chapter's pages." },
      { status: 500 }
    );
  }

  const allPages = pageRows ?? [];
  const stored = allPages.filter((row) => row.storage_state === "stored");
  if (stored.length === 0) {
    return Response.json(
      { error: "no-pages", message: "This chapter has no original images left to process." },
      { status: 409 }
    );
  }
  if (stored.length !== allPages.length) {
    return Response.json(
      {
        error: "originals-missing",
        message: "Some original pages are no longer stored, so XianScan cannot safely process the complete chapter. Re-upload the missing pages first.",
      },
      { status: 409 }
    );
  }

  const recordedBytes = stored.reduce((sum, row) => sum + (Number(row.byte_size) || 0), 0);
  const hasOversizedPage = stored.some((row) => Number(row.byte_size) > MAX_PAGE_BYTES);
  if (
    stored.length > MAX_CHAPTER_PAGES ||
    recordedBytes > MAX_CHAPTER_BYTES ||
    hasOversizedPage
  ) {
    return Response.json(
      {
        error: "too-large",
        message: tooLargeMessage(stored.length, recordedBytes),
      },
      { status: 413, headers: { "Cache-Control": "no-store" } }
    );
  }

  try {
    // Fail before downloading page bytes if server-side engine settings are absent.
    await assertEngineConfigured();

    const pages: Array<{ blob: Blob; mimeType: string }> = [];
    let actualBytes = 0;
    for (const row of stored) {
      const { data: blob, error } = await supabase.storage
        .from("pages")
        .download(row.original_path);
      if (error || !blob) {
        return Response.json(
          {
            error: "storage",
            message: `Couldn't read page ${row.page_index + 1}. Re-upload it and retry.`,
          },
          { status: 502 }
        );
      }

      const placeholder = pngPlaceholderReason(
        new Uint8Array(await blob.slice(0, 32).arrayBuffer())
      );
      if (placeholder) {
        return Response.json(
          {
            error: "bad-page",
            message: `Page ${row.page_index + 1} in storage ${placeholder}. Re-upload that page, then start the run again.`,
          },
          { status: 409, headers: { "Cache-Control": "no-store" } }
        );
      }

      if (blob.size > MAX_PAGE_BYTES || pages.length >= MAX_CHAPTER_PAGES) {
        return Response.json(
          {
            error: "too-large",
            message: tooLargeMessage(stored.length, Math.max(recordedBytes, actualBytes + blob.size)),
          },
          { status: 413, headers: { "Cache-Control": "no-store" } }
        );
      }
      actualBytes += blob.size;
      if (actualBytes > MAX_CHAPTER_BYTES) {
        return Response.json(
          {
            error: "too-large",
            message: tooLargeMessage(stored.length, actualBytes),
          },
          { status: 413, headers: { "Cache-Control": "no-store" } }
        );
      }

      const fallbackMime = row.original_path.toLowerCase().endsWith(".webp")
        ? "image/webp"
        : "image/png";
      pages.push({ blob, mimeType: blob.type || fallbackMime });
    }

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

    const job = await createEngineJob({
      chapterId: body.chapterId,
      pages,
      sourceLang: engineSourceLang(series?.source_language),
      targetLang: "en",
      glossary,
    });

    const { error: linkError } = await supabase.rpc("set_chapter_engine_job", {
      p_chapter_id: body.chapterId,
      p_job: job.jobId,
    });
    if (linkError) {
      console.warn(`[engine] job ${job.jobId} not linked to chapter: ${linkError.message}`);
    }

    return Response.json(job, {
      status: 201,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return engineFailureResponse(error);
  }
}
