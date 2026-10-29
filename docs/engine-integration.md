# HwaFlow chapter studio — XianScan integration

**Current architecture (2026-10-28).** XianScan is the sole chapter-processing engine. HwaFlow uploads and reviews full-resolution pages; it does not run a separate Gemini translation pipeline. The old `/api/pipeline/**`, `lib/ai/**`, and `lib/pipeline.ts` implementation has been removed.

## What the studio does

- Shows one chapter page at a time as a permanent split: the original at full resolution on the left, its typeset result on the right, paged together from one shared panel index. Long pages are fitted to the pane's width and scroll; scrolling either pane moves the other by the same amount.
- Keeps every run control in one top bar — previous/next panel, add panels (inserted directly after the current panel), remove panel, ZIP download and run — and locks add/remove/run while a run is in flight.
- Sends the original page images, the series source language, and active glossary terms to XianScan. XianScan remains configured to use its Gemini provider (`translationMode: "gemini"`, `allowTranslationFallback: false`).
- Does **not** read or send `text_blocks`, imported translations, edited text, mock content, or any HwaFlow fallback as XianScan translation input.
- Imports XianScan regions and saves page renders automatically when a run finishes, so the workspace has no separate import/save step. Human-edited translations are preserved if a run is imported again; omitted/stale text blocks are not automatically deleted.
- Stores finished pages separately from originals, and downloads saved renders as a ZIP.

## Active code map

| File | Responsibility |
| --- | --- |
| `components/chapters/workspace-view.tsx` | Chapter header, rail, upload and remove orchestration around the studio. |
| `components/chapters/chapter-studio.tsx` | Top bar controls, status strip, raw/translated split view, waiting sheet, filmstrip, job polling and the automatic import + render after a run. |
| `components/chapters/text-review.tsx` | Editable imported lines with source-language labels. Retained but not rendered by the workspace. |
| `components/chapters/panel-dropzone.tsx` | Multi-page image selection and full-resolution upload progress/copy. |
| `lib/panel-image.ts` | Validates and prepares pages without resizing. PNG uploads pass through unchanged; JPEG/WebP inputs are encoded to PNG at their original pixel dimensions. |
| `lib/engine-limits.ts` | Shared page, per-file, chapter-byte and MIME limits used by browser, server and tests. |
| `lib/engine.ts` | Server-only XianScan API client. Job creation contains images, languages and glossary only; Gemini mode is retained and translation fallback is disabled. |
| `lib/engine-auth.ts`, `lib/engine-access.ts` | Viewer/rate-limit and job-to-chapter access checks for engine routes. |
| `lib/engine-cloudflare-env.ts` | Reads engine settings from Node environment or Cloudflare runtime bindings. |
| `app/api/engine/jobs/**` | Creates/reads/rejects/approves jobs, proxies engine assets, imports regions and saves renders. |
| `app/api/chapters/[id]/download/route.ts` | Downloads an individual saved render or a ZIP of saved chapter renders. |
| `app/api/health/engine/route.ts` | Reports server-side engine configuration and probes the configured engine without exposing the token. |
| `lib/engine-regions.ts`, `lib/engine-renders.ts` | Adapt XianScan regions and persist completed render paths. |

## Image and payload limits

The active application and engine bridge share these limits:

- **20 pages maximum per chapter**.
- **10 MiB maximum per page**.
- **80 MiB maximum for the chapter's uploaded originals**.
- A browser canvas guard rejects images above 100 million pixels or 30,000 pixels on either edge; it never downsizes them to fit.

PNG source files are passed through byte-for-byte after dimensions are read from their header. Every other accepted input — JPEG, WebP, AVIF, BMP, GIF, TIFF — is decoded and re-encoded losslessly to PNG at the original width and height; the user never has to convert a file first. The PNG encoder tries the synchronous canvas path before `toBlob`, because `toBlob` returns `null` on some browsers for very tall pages. Existing WebP objects remain readable and are sent with a `.webp` extension. The server rejects a non-`.png` object path, so a broken client cannot store a WebP object under a PNG name, and it checks both recorded and downloaded byte counts before creating a job.

The `pages` Storage bucket must accept `image/png` (and `image/webp` for legacy objects), with a 10 MiB per-object limit. The repository's baseline bucket migration only specifies WebP. `supabase/migrations/20261109000000_engine_page_budget.sql` updates the bucket MIME allowlist and adds a database-side page/byte guard, but this workspace did **not** apply it. The deployed bucket configuration could not be checked from this workspace; verify that it already accepts PNG before relying on PNG uploads. Do not apply or re-apply migrations as part of this change without explicit approval.

### Page cap in the UI

The 20-page cap is visible, not just enforced: the raw pane footer shows a
`12 / 20 panels` counter with twenty cells, the add control becomes **Chapter full**
and is disabled at capacity, and the empty-state drop zone says the cap out loud.
Panels are inserted directly behind the panel in view through `insert_panels_after`,
which re-checks the count against the database, so two tabs cannot exceed it.

### Preview reliability

A page image that fails to load retries once after a short delay, then shows a
**Try again** control. Pages render at full resolution, zoomed to the pane's width
and scrolled vertically, with no in-app zoom, lightbox or click-through. The
translated pane prefers the saved render and falls back to the engine asset only
when the job is `done` and its page count still matches the chapter.

## Job input and text import

`POST /api/engine/jobs` validates chapter access, confirms every original page is still stored, enforces all limits, and forwards:

1. Original image blobs in chapter page order.
2. Source language (`ko`, `ja`, or `zh-Hans`; unknown values map to `auto`).
3. English target language and active series glossary.
4. XianScan metadata selecting Gemini with fallback disabled.

The route does not select `text_blocks`, nor does the engine client accept a `translations` field. On import, `/api/engine/jobs/:id/import` maps XianScan regions into `text_blocks` through `set_panel_blocks`. For an existing block marked `is_edited`, the existing `base_translation` and `final_text` are carried forward. The import only changes blocks present in a valid XianScan payload; stale blocks are left in place and surfaced as a surplus count rather than pruned automatically.

The studio calls import and render itself the moment a job reports `done` with a page count that still matches the chapter, so there is no manual import step and reviewed chapters no longer start without text. Neither call's error body is shown: the workspace reports its own neutral line, because engine errors name the batch service and leak worker internals.

## Images, retention and downloads

- Original page objects remain at `chapter_pages.original_path`; rendering only updates `chapter_pages.clean_path`.
- Engine approval removes XianScan-side raw/intermediate assets. Supabase originals are retained by default and are purged only when `ENGINE_PURGE_SUPABASE_ORIGINALS=1` and the existing purge RPC is available.
- Saved output pages live in the private `renders` bucket. Individual downloads are available through `/api/chapters/:id/download?page=N`; the chapter ZIP is buffered with a 200 MiB ceiling.
- Engine asset URLs are proxied through authenticated HwaFlow routes. The browser does not receive the engine host or bearer token. Image assets use long-lived private caching; regions JSON uses a short cache.

## Runtime configuration

Set these server-side only; never prefix them with `NEXT_PUBLIC_`:

```dotenv
ENGINE_API_URL=https://<xianscan-worker-host>
ENGINE_WEB_TOKEN=<same value as the engine WEB_TOKEN secret>
ENGINE_PURGE_SUPABASE_ORIGINALS=0
```

The XianScan-side Gemini provider key stays on XianScan and is not configured in HwaFlow. `.env.example` intentionally has no `GEMINI_API_KEY` or `MOCK_PIPELINE` entries.

## Validation and operations

1. Set `ENGINE_API_URL` and `ENGINE_WEB_TOKEN` in `.env.local` **and** in the
   hosting dashboard. They are server-only; a `NEXT_PUBLIC_` prefix is a leak.
2. Restart the dev server — `.env.local` is read at boot.
3. Open `/api/health/engine`. `ok: true` means the Worker answered and accepted
   the token. `probe.status: "locked"` means the token is wrong;
   `"error"` means the Worker was unreachable.
4. Run a real chapter end to end, then use the panel: **Run XianScan** → review
   the before/after studio → **Import text** (stale lines are counted as surplus
   and left in place; there is no prune action) → **Save pages** → **Approve**.
5. Keep `ENGINE_PURGE_SUPABASE_ORIGINALS` unset until migration 1 is pushed and
   you have decided that approval should delete the author's uploads.


---

## 12. Strict access mode (optional)

`lib/engine-access.ts` resolves `jobId -> chapterId` (memoised 10 minutes) and
then asks Postgres `can_view_chapter` / `can_manage_chapter`. By default an
**RPC error** or an **unlinked job** is allowed with a warning, so a transient
Supabase blip cannot blank the whole review panel. A definite `false` is always
a 403.

Set `ENGINE_STRICT_ACCESS=1` to require positive proof instead:

| Situation | Default | Strict |
|---|---|---|
| RPC returns `true` | allow | allow |
| RPC returns `false` | **403** | **403** |
| RPC errors / missing | allow + log | **403** |
| Job cannot be resolved | allow + log | **403** |
| Job has no `chapterId` | allow + log | **403** |

Turn it on only **after** `supabase db push` has applied the chapter helpers
and the job-link migration, otherwise legacy jobs without a chapter link will
be refused. The decision logic is isolated in `lib/engine-access-policy.ts`
and covered by `lib/engine-access-policy.test.ts`.

This is about *authorization*. Payload ceilings (20 pages / 80 MiB, checked
from `chapter_pages.byte_size` before any download) and the Worker-side
80 MiB batch guard are separate.

## Validation

- Run `npx tsc --noEmit`, `npm test`, `npm run build` (with placeholder Supabase
  environment values for static build checks) and `git diff --check` before shipping.
- `GET /api/health/engine` reports whether the server-side endpoint/token are
  configured and probes the engine. It never echoes secrets.
