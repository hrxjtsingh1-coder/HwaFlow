# HwaFlow — image engine bridge (XianScan)

**Status: applied.** This is the record of what was integrated, what it needs at
runtime, and what was deliberately left for later. It replaces the old
"copy these files into your repo" guide, because the files are already here.

The engine is an **additional** path. The existing OCR → translate → proofread
pipeline (`app/api/pipeline/**`, `lib/ai/**`) is untouched and still the default
way a chapter gets its text.

---

## 1. What landed

| File | Role |
| --- | --- |
| `lib/engine.ts` | `server-only` client for the deployed Cloudflare Worker. Reads `ENGINE_API_URL` / `ENGINE_WEB_TOKEN`; the browser never sees either. |
| `lib/engine-access.ts` | `server-only` authorization for every job-scoped route: resolves `jobId → chapterId` once per job (10 min memo) and checks `can_view_chapter` / `can_manage_chapter`. |
| `lib/engine-regions.ts` | Tolerant adapter from the engine's `regions.json` to the `text_blocks` shape: three text spellings, both box conventions, pixel-or-fraction coordinates scaled by the page's real size. |
| `lib/engine-renders.ts` | `renderObjectPath()` — keeps the `{group}/{chapter}/` prefix the bucket policies authorise on, and names the object after the page id so a re-run overwrites instead of orphaning. |
| `app/api/engine/jobs/route.ts` | `POST` — reads the chapter's originals + glossary + approved text, forwards them, returns a job id. |
| `app/api/engine/jobs/[id]/route.ts` | `GET` — status + page URLs for the panel. |
| `app/api/engine/jobs/[id]/approve/route.ts` | `POST` — approve; keeps finals ~7 days, deletes raws; optionally purges Supabase originals. |
| `app/api/engine/jobs/[id]/reject/route.ts` | `POST` — discard the run. |
| `app/api/engine/jobs/[id]/[kind]/[page]/route.ts` | `GET` — streams `raw` / `final` / `approved` / `clean` / `regions` through the server. |
| `app/api/engine/jobs/[id]/import/route.ts` | `POST` — writes the engine's regions into `text_blocks` (§5). |
| `app/api/engine/jobs/[id]/render/route.ts` | `POST` — copies the finished pages into the `renders` bucket and points `chapter_pages.clean_path` at them (§6). |
| `app/api/chapters/[id]/download/route.ts` | `GET` — zips every saved finished page for a chapter (§6). |
| `app/api/health/engine/route.ts` | `GET` — env + Worker/token probe (§2). |
| `components/chapters/engine-panel.tsx` | The panel in the chapter workspace. Self-contained inline styles, no new dependency, no CSS file. |
| `supabase/migrations/20261105000000_engine_purge.sql` | Optional `purge_chapter_originals(uuid)` RPC. Inert unless `ENGINE_PURGE_SUPABASE_ORIGINALS=1`. |
| `supabase/migrations/20261106000000_engine_renders.sql` | `renders` bucket + policies, `chapter_pages.clean_path`, and the `set_chapter_page_render(uuid, text)` RPC. |
| `supabase/migrations/20261107000000_engine_import_prune.sql` | `set_panel_engine_blocks(uuid, uuid, jsonb)` — the explicit prune path behind **Remove stale lines** (§5). |
| `supabase/migrations/20261108000000_engine_job_link.sql` | `chapters.engine_job_id` + `set_chapter_engine_job(uuid, text)` — the run survives a reload (§3). |

Also modified:

- `components/chapters/workspace-view.tsx` — two lines: the import and
  `<EnginePanel chapterId={chapter.id} canApprove={canManage} />`, inserted
  after the `ch-header` block.
- `.env.example` — three empty `ENGINE_*` names (server-only, never `NEXT_PUBLIC_`).
- `.gitignore` — `.dev.vars`, `.dev.vars.*`, `kaggle.json`, `*.pem`.
- `docs/ARCHITECTURE.md` — §14.

No new npm packages. `server-only` and `@supabase/ssr` are already dependencies.

> The migration keeps its **`20261105000000`** timestamp so it sorts after the
> repo's newest migration (`20261104090000_currency.sql`). `supabase db push`
> rejects out-of-order migrations, so do not rename it back.

---

## 2. Runtime environment

`.env.local`, and the same names as secrets in the hosting dashboard:

```dotenv
ENGINE_API_URL=https://<your-worker-host>
ENGINE_WEB_TOKEN=<the SAME random string as the Worker's WEB_TOKEN secret>
ENGINE_PURGE_SUPABASE_ORIGINALS=1   # optional; needs the migration pushed
```

`ENGINE_WEB_TOKEN` is read only inside `lib/engine.ts`, which is `server-only`.
Never give it a `NEXT_PUBLIC_` prefix.

`GET /api/health/engine` checks all of this in one request: whether the two
variables are present, whether a `NEXT_PUBLIC_` copy leaked, and whether the
Worker answers and accepts the token (a `404` for a made-up job id is the pass —
it proves the bearer token was accepted). It never echoes the token, and in
production it returns only `{ ok }`.

`ENGINE_PURGE_SUPABASE_ORIGINALS` is **off by default**. When it is `1` *and* the
migration has been pushed, Approve also deletes the user's original WebPs from
the Supabase `pages` bucket and flips those `chapter_pages` rows to `purged` —
implementing the `purge_on_approval` policy `groups.retention_policy` already
stores. Groups set to `keep` are left alone by the RPC itself.

`GEMINI_API_KEY` and `MOCK_PIPELINE` in `.env.example` belong to the text
pipeline. They are unrelated to the engine's own Gemini key, which lives as a
Worker secret and never reaches this repo.

> `engine.hwaflow.space` in older notes was a proposed subdomain. Use whatever
> host Cloudflare actually gave you.

---

## 3. The panel

Already mounted in `workspace-view.tsx`:

```tsx
</div>   {/* end .ch-header */}

<EnginePanel
  chapterId={chapter.id}
  initialJobId={chapter.engineJobId ?? null}
  hasRenders={panels.some((panel) => panel.hasRender)}
  canApprove={canManage}
/>

{uploadErrors.length > 0 ? (
```

`canManage` (not `canApprove`) is deliberate: `canApprove` in that file means
`canManage && status === "submitted"`, which would hide the engine's Approve
button while a chapter is still `ready`. `onApproved` is omitted on purpose, so
approving images and approving the chapter stay two separate clicks.

The run is remembered on the chapter (`chapters.engine_job_id`, written by
`set_chapter_engine_job` when a job is created), so a reload, another device or a
Manager reviewing the chapter sees the same run instead of starting over. The
chapter row wins over `localStorage`; `localStorage` remains only as a fallback
for a viewer without edit rights, whose run cannot be linked.

All images the panel shows — raw, final and approved — are fetched through
`/api/engine/jobs/<id>/<kind>/<page>`. The browser never learns the Worker host,
and the Worker's asset URLs never need to be publicly readable.

That proxy retries a 5xx or a dropped connection twice (250 ms, then 1 s) before
reporting a page missing, so a Worker cold start during a 40-page import does not
look like lost output. A 4xx is returned immediately — a rejected job should not
cost a second of retries. Every Worker call also carries a timeout: 15 s for JSON
and images, 120 s for the multipart upload. A hung Worker fails the page instead
of holding the request until `maxDuration`.

---

## 4. How it plugs into what already exists

| Already in HwaFlow | What the engine path uses it for |
| --- | --- |
| `chapter_pages.original_path` → Storage `pages` bucket | `POST /api/engine/jobs` downloads those originals and forwards them |
| `series.source_language` (`ko`/`ja`/`zh`) | Mapped to the engine's OCR codes (`ko`/`ja`/`zh-Hans`) |
| `glossary_terms` (active terms, per series) | Sent as `--glossary` so names stay consistent across chapters |
| `text_blocks.final_text` | Sent as `translations[page][block]` — an **offline fallback** for a kernel with no internet. The primary translator is XianScan's own Gemini provider inside the kernel. |
| `requirePipelineViewer()` | Session + rate-limit gate on the job routes |
| `can_view_chapter` / `can_manage_chapter` | Route-level authorization (see §5) |
| `storage_state` + `groups.retention_policy` | Optional purge on approval (§2) |

Imported engine text lands in `text_blocks` through `set_panel_blocks` (§5);
nothing else in this integration writes there.

---

## 5. Importing the engine's text

Pressing **⇩ Import text** (or `POST /api/engine/jobs/:id/import`) copies the
run's `regions.json` into `text_blocks`, so the bubble editor shows the engine's
boxes and its English text and proofreading continues as usual.

It is a **merge**, not a replace:

- An empty string means "no opinion" (see
  `20261030090000_extraction_preserves_text.sql`), so existing `base_translation`
  and `final_text` are never blanked. Engine OCR overwrites `source_text`,
  `bbox` and `confidence` for the matching `block_index`.
- Blocks absent from the payload are deleted only when they hold no text.
- Consequence: if the engine finds more regions than the pipeline did, the
  surplus old rows keep their text and appear as extra bubbles. There is no
  cleanup pass, because `text_blocks` has a SELECT policy only — replacing
  outright would need a new RPC and a migration.

After a merge the panel reports how many older lines the engine did not mention
and offers **Remove stale lines**. That re-runs the import with `prune: true`,
which calls `set_panel_engine_blocks` — it deletes rows absent from the payload
**only when `is_edited = false`**, then applies the same text-preserving upsert.
Pruning is never automatic: a truncated engine response looks exactly like a
page that lost panels, so the call belongs to the person looking at the result.

Two guard rails in the route:

- It only runs while the job is `done`. After Approve the worker has deleted the
  intermediates, so the message says to run the engine again.
- It re-reads the chapter's `storage_state = 'stored'` pages and refuses
  (`409 pages-changed`) if the count no longer matches `job.pageCount`, because
  the engine's page numbers are upload order and a re-upload would shift them.

The adapter logs the first `regions.json` it ever sees, truncated to 1200 chars,
as `[engine] regions sample`. That exists because the Worker's serialiser is not
in this repo and the field names were inferred; delete the log once the shape is
confirmed.

Imported text follows the same permission as extraction: anyone who can work on
the series (`can_edit_chapter`, re-checked by `set_panel_blocks`).

---

## 6. Saving the finished pages

Pressing **⇩ Save pages** (or `POST /api/engine/jobs/:id/render`) copies each of
the engine's finished PNGs into a private `renders` bucket and stores the object
path in `chapter_pages.clean_path`.

Why a second bucket: `pages` only accepts `image/webp` (the browser uploads
originals there), while the engine emits PNG. `renders` allows `image/png` and
`image/webp`, is private, caps objects at 25 MB, and uses the same
`{group}/{chapter}/…` path convention so `can_view_chapter_path` /
`can_edit_chapter_path` work unchanged.

Two properties matter:

- **`original_path` is never rewritten.** Extraction keeps OCRing the raw art.
  `imageUrl` still points at it; `previewUrl` (`clean_path ?? original_path`) is
  what the panel viewer displays. Nothing in the pipeline reads `previewUrl`.
- **A purge no longer blanks the chapter.** Once `storage_state = 'purged'`,
  `imageUrl` is `null`, but the render survives, so the viewer still shows the
  typeset page.

Writes go through `set_chapter_page_render(p_page_id, p_path)` — a
`security definer` RPC gated on `can_edit_chapter` — because `chapter_pages` has
a SELECT policy only. The object is named `{page id}.png`, so re-running the
engine overwrites the same key instead of leaving orphans behind when a panel is
re-uploaded under a new file name.

Like the text import, it refuses (`409 pages-changed`) when the chapter's
original page count no longer matches `job.pageCount`. It runs while the job is
`done` or `approved` (the Worker keeps finals for about a week after approval);
per-page failures are reported in the response rather than failing the batch.

### Downloading the finished set

Once any page has a render, the workspace header shows **Pages**, which calls
`GET /api/chapters/:id/download` and returns every saved render as one ZIP,
named `001.png`, `002.png`, … in page order.

- `lib/zip.ts` writes the archive directly — stored entries, no compression,
  because PNGs are already deflated. No dependency was added for this.
- Reads go through the viewer's session, so the `renders` policy decides access;
  a chapter in another group is a `404`.
- The archive is buffered, so it is capped at 200 MB (`413` above that). A
  40-page chapter is typically a few MB.
- It is chapter-scoped rather than job-scoped on purpose: renders outlive the
  engine job, and so does the ability to hand someone the finished pages.
- `?page=N` returns a single image as an attachment instead of the archive. The
  panel's per-page links switch to it once a run is approved, because the
  Worker's finals expire; during a live run those links keep using the engine's
  own assets, so a render from an earlier run cannot be mistaken for the current
  one.

---

## 7. Authorization and limits

| Route | Session | Chapter check |
| --- | --- | --- |
| `POST /api/engine/jobs` | `requirePipelineViewer()` | RLS on `chapters` (someone else's chapter is a 404) |
| `GET /api/engine/jobs/:id` | `requirePipelineViewer()` | `can_view_chapter` |
| `GET /api/engine/jobs/:id/:kind/:page` | `getViewer()` (cheap, hot path) | `can_view_chapter` |
| `POST …/approve` | `requirePipelineViewer()` | `can_manage_chapter` |
| `POST …/reject` | `requirePipelineViewer()` | `can_manage_chapter` |
| `POST …/import` | `requirePipelineViewer()` | `can_view_chapter` (work access; `set_panel_blocks` re-checks `can_edit_chapter`) |
| `POST …/render` | `requirePipelineViewer()` | `can_view_chapter` + the `renders` bucket's `can_edit_chapter_path` on upload |
| `GET /api/chapters/:id/download` | `requirePipelineViewer()` | RLS on `chapters` / `chapter_pages` + `can_view_chapter_path` on each render |

A job id is opaque but it is not a permission. `lib/engine-access.ts` resolves
the chapter behind it (memoised for 10 minutes per job, so the asset route does
not re-ask the Worker per image) and then asks Postgres. A definite `false`
returns `403`. A *failure* to ask (missing function, network blip) allows and
logs `[engine] chapter access check skipped` — that is never weaker than the
unguarded routes it replaced, and the destructive step is still refused inside
`purge_chapter_originals()` itself.

**Payload ceiling.** `POST /api/engine/jobs` buffers the chapter twice (Blobs,
then the multipart body), so it refuses runs above **40 pages or 80 MB** with a
`413` and a message quoting the chapter's real size. `chapter_pages.byte_size`
is the source, so nothing is downloaded to find out. Chapters of 20–40 WebPs at
1–2 MB each are well inside this; the 10 MB figure is the bucket's per-file cap,
not the norm.

---

## 8. Test without the UI

```bash
npm run dev

# create a job for a chapter that has uploaded panels
curl -X POST http://localhost:3000/api/engine/jobs \
  -H 'content-type: application/json' \
  -H "cookie: <your session cookie>" \
  -d '{"chapterId":"<a real chapter uuid>"}'
# -> {"jobId":"...","status":"pending","pageCount":N}

curl -H "cookie: <your session cookie>" \
  http://localhost:3000/api/engine/jobs/<jobId>
# -> {"status":"done","urls":[...]} once the bridge finishes

curl -X POST -H "cookie: <your session cookie>" \
  http://localhost:3000/api/engine/jobs/<jobId>/approve
# -> {"status":"approved"} and the raw images are gone
```

---

## 9. Deliberate non-goals

- **Streaming the upload.** The route buffers the whole chapter. The real fix is
  to post signed Storage URLs and let the Worker pull pages one at a time, which
  changes the Worker's `/v1/jobs` contract — out of scope for this integration.
  Until then the 40-page / 80 MB guard turns an out-of-memory crash into a clear
  message.
- **Automatic pruning on import.** Import merges; removing the leftover rows is
  an explicit second click (§5), because a short engine response is
  indistinguishable from a page that lost panels.
- **Deleting renders.** Deleting a chapter or a single panel removes its renders
  through the admin client (`deleteChapterAction`, `removePanelAction`), because
  the `renders` delete policy resolves the chapter from the row that is already
  gone. Rows deleted outside the app — a manual `delete from chapter_pages` in
  the dashboard — can still orphan an object; the bucket is private and one
  object per page, so that is housekeeping.
- **Touching `worker/**`, `kaggle/**` or `engine-bridge/**`.** Those are deployed
  and working; this repo only talks to them over HTTP.
- **Key rotation for the engine's Gemini key.** It is a Worker secret; nothing
  here handles it.

---

## 10. Deploy order

The code is additive, but four migrations change tables that `lib/server/chapters.ts`
already selects, so push them **before** deploying this branch. Until then the
chapter workspace fails to load — `clean_path` and `engine_job_id` do not exist.

```bash
npx supabase link --project-ref <ref>
npx supabase db push          # applies the four below in timestamp order
```

| Order | Migration | Adds |
| --- | --- | --- |
| 1 | `20261105000000_engine_purge.sql` | `chapter_pages.storage_state`, the approval purge RPC. |
| 2 | `20261106000000_engine_renders.sql` | `renders` bucket + policies, `chapter_pages.clean_path`, `set_chapter_page_render`. |
| 3 | `20261107000000_engine_import_prune.sql` | `set_panel_engine_blocks` (Remove stale lines). |
| 4 | `20261108000000_engine_job_link.sql` | `chapters.engine_job_id`, `set_chapter_engine_job`. |

Then:

1. Set `ENGINE_API_URL` and `ENGINE_WEB_TOKEN` in `.env.local` **and** in the
   hosting dashboard. They are server-only; a `NEXT_PUBLIC_` prefix is a leak.
2. Restart the dev server — `.env.local` is read at boot.
3. Open `/api/health/engine`. `ok: true` means the Worker answered and accepted
   the token. `probe.status: "locked"` means the token is wrong;
   `"error"` means the Worker was unreachable.
4. Run §8 against a real chapter, then use the panel: **Run engine** → review →
   **Import text** (and **Remove stale lines** only if it reports surplus) →
   **Save pages** → **Approve**.
5. Keep `ENGINE_PURGE_SUPABASE_ORIGINALS` unset until migration 1 is pushed and
   you have decided that approval should delete the author's uploads.
