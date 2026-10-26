/**
 * GET /api/chapters/:id/download
 *
 * The typesetter's deliverable: every saved finished page for a chapter, in one
 * ZIP. Reads the private `renders` bucket through the user's session, so the
 * `can_view_chapter_path` policy decides access — a chapter in another group
 * simply has no rows to read.
 *
 * Stored entries, no compression (PNG is already deflated); see lib/zip.ts.
 * The archive is buffered, so there is a hard ceiling rather than an OOM.
 */

import { requirePipelineViewer } from "@/lib/pipeline-auth";
import { createClient } from "@/lib/supabase/server";
import { buildZip, type ZipEntry } from "@/lib/zip";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 40 pages x 25 MB would be 1 GB; nobody needs that in one request. */
const MAX_ARCHIVE_BYTES = 200 * 1024 * 1024;

function archiveName(number: number, title: string | null): string {
  const base = `chapter-${String(number).padStart(3, "0")}`;
  // ASCII only: the slug is interpolated into a response header, and CJK titles
  // would either be mangled or break the header entirely.
  const slug = (title ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return slug ? `${base}-${slug}.zip` : `${base}.zip`;
}

function pageFileName(pageIndex: number, path: string): string {
  const extension = path.toLowerCase().endsWith(".webp") ? "webp" : "png";
  return `${String(pageIndex + 1).padStart(3, "0")}.${extension}`;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePipelineViewer();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  if (!UUID.test(id)) {
    return Response.json(
      { error: "not-found", message: "That chapter no longer exists." },
      { status: 404 }
    );
  }

  const supabase = await createClient();

  const { data: chapter, error: chapterError } = await supabase
    .from("chapters")
    .select("id, number, title")
    .eq("id", id)
    .maybeSingle();

  if (chapterError) {
    return Response.json(
      { error: "storage", message: "Couldn't read this chapter." },
      { status: 500 }
    );
  }
  // RLS hides chapters the viewer cannot see, so "missing" is also "not yours".
  if (!chapter) {
    return Response.json(
      { error: "not-found", message: "That chapter no longer exists." },
      { status: 404 }
    );
  }

  const { data: pageRows, error: pageError } = await supabase
    .from("chapter_pages")
    .select("id, page_index, clean_path")
    .eq("chapter_id", id)
    .order("page_index", { ascending: true });

  if (pageError) {
    return Response.json(
      { error: "storage", message: "Couldn't read this chapter's pages." },
      { status: 500 }
    );
  }

  const rendered = (pageRows || []).filter((page) => page.clean_path);
  if (rendered.length === 0) {
    return Response.json(
      {
        error: "no-renders",
        message: "No finished pages saved yet — run the engine and press Save pages first.",
      },
      { status: 409 }
    );
  }

  // One page, straight from the bucket. This is what the panel's per-page links
  // use once "Save pages" has run, so a download keeps working after the Worker
  // deletes the run's finals.
  const requestedPage = new URL(request.url).searchParams.get("page");
  if (requestedPage !== null) {
    const oneBased = Number(requestedPage);
    if (!Number.isInteger(oneBased) || oneBased < 1) {
      return Response.json(
        { error: "invalid-request", message: "Page must be a positive whole number." },
        { status: 400 }
      );
    }

    const target = rendered.find((page) => page.page_index === oneBased - 1);
    if (!target) {
      return Response.json(
        {
          error: "no-render",
          message: `Page ${oneBased} has no saved finished page. Press Save pages first.`,
        },
        { status: 404 }
      );
    }

    const { data: blob, error: downloadError } = await supabase.storage
      .from("renders")
      .download(target.clean_path);
    if (downloadError || !blob) {
      return Response.json(
        { error: "unavailable", message: `Page ${oneBased} could not be read.` },
        { status: 502 }
      );
    }

    return new Response(blob, {
      headers: {
        "content-type": blob.type || "image/png",
        "content-disposition": `attachment; filename="${pageFileName(target.page_index, target.clean_path)}"`,
        "cache-control": "no-store",
      },
    });
  }

  const entries: ZipEntry[] = [];
  let total = 0;

  for (const page of rendered) {
    const { data: blob, error: downloadError } = await supabase.storage
      .from("renders")
      .download(page.clean_path);
    if (downloadError || !blob) continue;

    const data = new Uint8Array(await blob.arrayBuffer());
    total += data.length;
    if (total > MAX_ARCHIVE_BYTES) {
      return Response.json(
        {
          error: "too-large",
          message: "This chapter is too large for one archive. Download pages individually from the engine panel.",
        },
        { status: 413 }
      );
    }

    // Zero-padded so unzip tools and file explorers keep the reading order.
    entries.push({
      name: pageFileName(page.page_index, page.clean_path),
      data,
    });
  }

  if (entries.length === 0) {
    return Response.json(
      { error: "unavailable", message: "None of the saved pages could be read." },
      { status: 502 }
    );
  }

  const zip = buildZip(entries);

  return new Response(new Blob([zip], { type: "application/zip" }), {
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="${archiveName(chapter.number, chapter.title)}"`,
      "content-length": String(zip.byteLength),
      "cache-control": "no-store",
    },
  });
}
