# HwaFlow — Manhwa Translation Platform

> **Status:** In build. Landing, auth, workspace and the groups delivery (admin console
> + member settings) are complete.
> **Build mode:** Page-by-page. The user names a page; we build that page fully, then move on.
> **Last updated:** 2026-10-23
> **Next up:** Series module (tiles grid, create/edit, assignments). The groups build
> spec and decision record stays at [`docs/GROUPS-PAGE.md`](GROUPS-PAGE.md).

This document is the single source of truth for architecture, decisions, and the page
inventory. Read it before building anything.

> Note: `docs/context.md` carries the original product intent. This document
> supersedes it for architecture, data model, RBAC, and page inventory.

---

## 1. What this is

A multi-tenant **scanlation operations platform**. Not a reader, not a manga site.

Groups own series → series own chapters → chapters get raw panel uploads → an
OCR + translate + localize pipeline returns structured English bubble text → staff
refine it in a side-by-side workspace → Managers/Owners approve → a dashboard tracks
per-member earnings and the weekly release calendar.

**Explicitly not in scope:** typesetting, image redrawing/inpainting, payment
processing, public reading audience, reader accounts, comments/community.

---

## 2. Confirmed decisions

| Area | Decision |
|---|---|
| Tenancy | Groups with strict RLS isolation; platform Admin creates groups and assigns Owners |
| Roles | Admin (platform-level) · Owner · Manager · Staff |
| Auth | Username + password. No OAuth, no email flows, no email verification |
| Invites | Owner/Manager invites **existing** platform users by username only |
| Source languages | Korean, Japanese, Chinese → English |
| Pipeline | OCR → base translation → second LLM localization/proofreading pass |
| Processing UX | Async per-chapter job with progress bar; job survives page refresh |
| Workspace | Side-by-side page image + linked bubble list; editing optional, not a submission gate |
| Consistency | Full suite: per-series glossary, per-bubble retranslate, term-suggestion pass |
| Chapter approval | Fully reversible; any Manager/Owner can move a chapter back a state |
| Credits | **Derived** from approved chapters × per-series rate. Never stored as a running total |
| Credits visibility | Dashboard shows "money earned this month" + chapters translated |
| Release schedule | Multiple weekdays per series; weekly calendar; click a day → that day's series |
| Storage | Purge page originals on approval by default, behind a **swappable retention policy** |
| UI | Pastel light theme + dark theme. Desktop-first workspace; mobile shows a "best viewed on desktop" notice |
| Admin console v1 | Groups + users only: create group, assign/change Owner, list users, deactivate user |
| Credentials | **No credit card anywhere.** Free tiers only |
| Registration | Public signup allowed; new users have no group until invited |

---

## 3. Assumptions (unconfirmed — correct when they matter)

1. A user may belong to multiple groups in the schema, but v1 UI assumes **one active
   group**. No group switcher yet.
2. "Money earned this month" = sum of `series.rate_amount` for chapters whose
   `approved_at` falls in the current calendar month. Moving a chapter out of
   approved removes the earning.
3. Money has **two currencies**. A group prices its work in `groups.currency`
   (Owner-set); each member reads amounts in `profiles.display_currency`. Conversion
   uses `fx_rates` (units per 1 USD, refreshed from Frankfurter every 30 days) and
   happens on the server, so the client only ever formats the number it is given.
   An approved chapter keeps the currency it was earned in (`chapters.rate_currency`);
   switching a group's currency converts series rates and in-flight snapshots only.
4. Chapter numbers are entered manually by staff, with the next number auto-suggested.
5. Bubble reading order is auto-derived and staff can drag to reorder.
6. Username auth is implemented over Supabase's email-based auth using a synthetic
   internal address (`<username>@users.internal`). Invisible to users.
7. Cover images and page originals live in Supabase Storage buckets (`covers`, `pages`);
   the DB stores paths only.
8. A group's Staff can see only series they are explicitly assigned to. Managers and
   Owners see every series in the group.
9. Admin cannot read group content (series, chapters, text). Metadata counts only.
10. Deleting things is soft where it matters: chapters and series archive rather than
    hard-delete once they have history.

---

## 4. Tech stack

### Locked
| Layer | Choice |
|---|---|
| Frontend | Next.js (App Router), TypeScript, React |
| Backend (AI/image) | Next.js route handlers under `app/api/pipeline/`. Python/FastAPI remains the long-term plan for heavy image work but is deferred; no second deploy or CORS in this build. |
| Database | Supabase Postgres (free tier) |
| Auth | Supabase Auth, username→synthetic-email mapping |
| File storage | Supabase Storage |
| OCR | Pluggable provider interface |
| Translation | Pluggable provider interface |

### Proposed defaults (override freely)
| Layer | Proposal | Why |
|---|---|---|
| Styling | Tailwind CSS + CSS variables for theme tokens | Dark mode + pastel palette need token indirection |
| Components | shadcn/ui as a base, restyled to the pastel system | Avoids building dialogs/menus/tables from scratch |
| Client data | TanStack Query | Server-state caching, polling for job progress |
| Forms | react-hook-form + zod | Consistent validation |
| Backend packaging | Deferred: current build is Next route handlers; FastAPI + Pydantic + Pillow only if heavy image work arrives | Minimal, free-tier friendly |
| Job execution | DB-backed job table polled by an in-process async worker | Avoids paid Redis/queue services |

### Provider strategy (important)
OCR and translation are **interfaces**, not hard-coded services. The shapes below are
language-neutral; the reference implementation is TypeScript in `lib/ai/types.ts`
(`OCRProvider`, `Translator`), and the Gemini implementation sits behind them.

```python
class OCRProvider(Protocol):
    async def extract(self, image_bytes: bytes, lang: str) -> list[OCRBlock]: ...

class Translator(Protocol):
    async def translate(self, texts: list[str], context: TranslationContext) -> list[str]: ...
```

Implementations to support from day one of the pipeline work:
- `PaddleLocalOCR` — PaddleOCR run locally via Docker. Free, unlimited, no card.
  **Default for development.**
- `OcrSpaceOCR` — OCR.space free API. No card. Rate-limited. Deploy-time fallback.
- `GeminiTranslator` — Gemini free tier via AI Studio key. No card.

---

## 5. Hard constraints and risks

### R1 — OCR rate limits are the project's biggest technical risk
OCR.space free tier caps files at ~1 MB and roughly 3 requests/minute. Manhwa pages
are tall vertical strips, so each page is sliced into tiles — a 40-page chapter can
produce 100+ OCR calls. At 3/min that is **30–45 minutes** per chapter, with throttling
failures.

**Mitigation:** local PaddleOCR is the dev default; OCR.space only for deploys.
The job queue must implement exponential backoff, resumable progress, and per-tile
retry so throttling degrades speed rather than failing the chapter.

### R2 — CJK OCR accuracy sets the product's quality ceiling
Free OCR on Japanese/Chinese vertical text in stylized comic fonts is unreliable.
If the pilot shows poor accuracy, the product shifts from "automated translation" to
"translation assistance." This must be measured on real pages before UI work proceeds.

### R3 — Free-tier hosting limits
- Supabase free: ~500 MB DB, 1 GB storage, project pauses after ~7 days inactivity.
- Render/Fly free web services spin down after ~15 min idle, which would kill a
  long-running job. Worker lives in-process and is kept warm by an external cron ping.
- Plan for aggressive image compression: WebP, max ~1600 px wide, quality ~80.

### R4 — Reversible approval means credits must be derived
Never store `user.total_earned`. Derive from `chapters` where `status = 'approved'`.
This makes every transition automatically correct and avoids reconciliation bugs.

### R5 — Long-strip tiling must be lossless at text level
Slices need ~10% vertical overlap and a merge step that dedupes blocks whose
bounding boxes intersect across the seam, or sentences get cut in half.

---

## 6. Data model

Postgres via Supabase migrations. `citext` for usernames.

### Identity & tenancy
```
profiles
  id uuid pk -> auth.users.id
  username citext unique not null
  display_name text
  avatar_path text
  is_platform_admin bool default false
  is_active bool default true
  created_at timestamptz

groups
  id uuid pk
  name text not null
  slug text unique
  currency char(3) default 'USD'
  retention_policy text default 'purge_on_approval'   -- swappable
  created_by uuid -> profiles.id
  created_at timestamptz

group_members
  id uuid pk
  group_id uuid -> groups.id
  user_id uuid -> profiles.id
  role text check (role in ('owner','manager','staff'))
  invited_by uuid -> profiles.id
  joined_at timestamptz
  unique (group_id, user_id)

group_invites                       -- existing users only; pending until accepted
  id uuid pk
  group_id uuid
  user_id uuid -> profiles.id
  role text check (role in ('manager','staff'))
  status text check (status in ('pending','accepted','revoked'))
  invited_by uuid
  created_at timestamptz
```

### Content
```
series
  id uuid pk
  group_id uuid -> groups.id
  title text not null check (1..80 chars)
  genre text                                -- free-form, replaces doc-era tags
  description text                          -- replaces `synopsis`
  cover_path text                           -- Storage key, signed URL on read
  source_language text check (source_language in ('ko','ja','zh'))
  reading_direction text check (reading_direction in ('ttb','rtl','ltr')) default 'ttb'
  rate_amount numeric(10,2) default 0        -- per approved chapter
  archived bool default false
  created_by uuid
  created_at / updated_at timestamptz

series_release_days (series_id, weekday smallint 0..6)   -- multiple per series
series_assignments (series_id, user_id, assigned_by, created_at)

chapters
  id uuid pk
  series_id uuid -> series.id
  number numeric(10,2)                       -- supports 12.5 side chapters
  title text
  status text check (status in ('draft','processing','ready','submitted','approved','rejected'))
  rate_snapshot numeric(10,2)                -- frozen at submit, drives earnings
  submitted_by uuid / submitted_at timestamptz
  approved_by uuid / approved_at timestamptz
  rejection_note text
  created_by uuid
  created_at / updated_at timestamptz
  unique (series_id, number)

chapter_pages
  id uuid pk                                 -- client-generated for direct uploads
  chapter_id uuid -> chapters.id
  page_index int
  original_path text                         -- {group_id}/{chapter_id}/{panel_id}.webp
  width int / height int / byte_size int
  storage_state text check (storage_state in ('stored','purged'))
  unique (chapter_id, page_index)
  -- no thumb_path in v1: a WebP panel is ~400 KB, thumbs are a later optimization

chapter_status_events        -- audit trail for reversible approval
  id uuid pk
  chapter_id uuid
  from_status text / to_status text
  actor_id uuid
  note text
  created_at timestamptz
```

### Translation artifacts
```
text_blocks
  id uuid pk
  page_id uuid -> chapter_pages.id
  chapter_id uuid -> chapters.id              -- denormalized so RLS needs no join
  block_index int                            -- reading order
  bbox jsonb                                 -- {x,y,w,h} normalized 0..1
  source_text text
  base_translation text                      -- pass 1 output, kept for comparison
  final_text text                            -- pass 2 output / human edit
  confidence numeric
  is_edited bool default false
  edited_by uuid / edited_at timestamptz
  unique (page_id, block_index)

glossary_terms
  id uuid pk
  series_id uuid -> series.id
  source_term text
  target_term text
  category text check (category in ('character','place','honorific','item','term'))
  origins text[] default '{}'                -- 'auto' | 'manual'
  status text check (status in ('active','dismissed')) default 'active'
  notes text
  created_by uuid
  created_at / updated_at timestamptz
  unique (series_id, source_term)            -- plus a lower(source_term) unique index

notifications
  id uuid pk
  user_id uuid -> profiles.id                -- recipient
  kind text                                  -- 'series-assigned'
  title text / body text
  href text
  tone text check (tone in ('mint','lavender','peach','sky'))
  read bool default false
  created_at timestamptz
```

Not built yet: `series_tags`, `term_suggestions` and `processing_jobs`. Tags are a
later feature; auto-detected terms land directly in `glossary_terms` with `auto`
origin (a human edit promotes them to `manual`); the pipeline is client-driven
(see §8), so there is no queue row to write.

**Built:** every content surface above is Supabase-backed. Browser-local stores
(`hwaflow.chapters.v1`, `hwaflow.glossary.v1`, `hwaflow.notifications.v1`,
`hwaflow-media`/IndexedDB) are retired; nothing reads or writes them except the
deferred `/admin/groups/[id]` surface noted in §10. Reads happen in server
components (`lib/server/*.ts`), writes in `"use server"` actions (`lib/*-actions.ts`),
and panel images upload directly from the browser to the private `pages` bucket at
`{group}/{chapter}/{panel}.webp` before `register_panels` writes the metadata row.
Images are read back as short-lived signed URLs, never public URLs. All content
buckets (`group-icons`, `series-covers`, `pages`) are private.

---

## 7. RBAC and RLS rules

### Capability matrix
| Capability | Admin | Owner | Manager | Staff |
|---|:--:|:--:|:--:|:--:|
| Create group, assign Owner | ✅ | — | — | — |
| List/deactivate users | ✅ | — | — | — |
| View group content | ❌ | ✅ | ✅ | assigned only |
| Edit group settings (currency, retention) | — | ✅ | — | — |
| Invite members | — | ✅ | ✅ | — |
| Change member roles | — | ✅ | — | — |
| Remove members | — | ✅ | — | — |
| Revoke a pending invite | — | ✅ | own invites only | — |
| Transfer group ownership | ✅ | — | — | — |
| Create/edit series | — | ✅ | ✅ | — |
| Assign staff to series | — | ✅ | ✅ | — |
| Create chapter | — | ✅ | ✅ | assigned series |
| Upload pages / run pipeline | — | ✅ | ✅ | assigned series |
| Edit translations | — | ✅ | ✅ | assigned series |
| Submit chapter | — | ✅ | ✅ | assigned series |
| Approve / reject / revert chapter | — | ✅ | ✅ | — |
| Manage glossary | — | ✅ | ✅ | assigned series |
| View own earnings | — | ✅ | ✅ | ✅ |
| View others' earnings | — | ✅ | ✅ | — |

### RLS implementation notes
- Use `SECURITY DEFINER` helper functions to avoid recursive policy evaluation:
  - `is_platform_admin()` → reads `profiles.is_platform_admin` for `auth.uid()`
  - `is_group_member(group_id)` / `has_group_role(group_id, roles text[])`
  - `can_view_series(series_id)` → Owner/Manager in group OR assigned Staff
  - `can_work_on_series(series_id)` → same predicate today, named for writes
  - `can_edit_series(series_id)` → Owner/Manager only
  - `can_view_chapter(chapter_id)` → delegates to `can_work_on_series`
  - `can_edit_chapter(chapter_id)` / `can_manage_chapter(chapter_id)` (approve/reject)
  - `can_view_series_path(group, series)` and `can_view_chapter_path(group, chapter)`
    for Storage policies — they compare folder names as text, never cast to uuid
- Every table has RLS **enabled**. Reads are policies; content writes are RPC-only
  (no INSERT/UPDATE/DELETE policies on series, chapters, pages, blocks, glossary or
  notifications). RPCs are `SECURITY DEFINER`, `search_path = ''`, and re-check the
  role themselves; a hidden button is never the boundary.
- Storage buckets `group-icons`, `series-covers` and `pages` are **private**. Upload
  policies check the group/chapter path, and reads return signed URLs with a short TTL.
- Notification rows are created only by the `series_assignments` `AFTER INSERT`
  trigger; recipients can select and update only their own rows.
- An RLS test suite is mandatory: for each role, assert allowed and denied reads.

---

## 8. Pipeline specification

### Flow
1. **Upload** — staff selects pages. Client compresses to WebP (max 1600 px wide,
   quality 80), uploads to `pages/{group}/{chapter}/{index}.webp`, inserts
   `chapter_pages` rows, sets chapter `status='processing'`.
2. **Enqueue** — insert `processing_jobs` row, `status='queued'`.
3. **Worker tick** — claims queued/expired jobs, marks `running`.
4. **Per page:**
   a. Load image. If height > ~2000 px, slice into tiles with 10% overlap.
   b. Call `OCRProvider.extract()` per tile with the series source language.
   c. Offset each tile's boxes by the tile's y-origin, merge blocks whose boxes
      intersect across the seam (dedupe duplicates in the overlap band).
   d. Cluster remaining blocks into logical text blocks (bubble-ish groups).
   e. Order blocks: top→bottom, then horizontally per `series.reading_direction`
      (`ttb`/`ltr` → left first; `rtl` → right first).
5. **Pass 1 — base translation** — batch the page's blocks into one call. Store in
   `base_translation`.
6. **Pass 2 — localization** — second call with page context, series synopsis,
   recent chapter context, and matched glossary terms. Store in `final_text`.
7. **Persist** — upsert `text_blocks`; bump progress; on completion set job `done`
   and chapter `ready`.
8. **Failure** — retry with exponential backoff; after N failures mark job `failed`
   with the failing step; keep partial results so the chapter is resumable.

### Prompt contracts
- Pass 1: literal, faithful, preserve sentence breaks and honorific intent.
- Pass 2: enforce glossary terminology, natural English, comic register, no added
  content, no censorship, preserve speaker intent. Output JSON keyed by block index.

### Quotas to watch
| Provider | Limit | Consequence |
|---|---|---|
| OCR.space free | ~25k req/mo, ~3 req/min, 1 MB/file | Bottleneck; needs tiling + backoff |
| Gemini free | per-model RPM/RPD caps | 40 pages × 2 passes needs pacing |
| Supabase | 1 GB storage | Purge-on-approval default |

### Built — the shipped pipeline

The flow above is the target. What exists today keeps the orchestration in the
browser (no worker) but reads from and writes to Supabase:

- **Provider** — Gemini only, behind the `OCRProvider` / `Translator` interfaces in
  `lib/ai/types.ts`. Primary model `gemini-3.5-flash-lite` (500 RPD, 15 RPM, 250K TPM
  on the free tier), with `gemini-3.8-flash` as a fallback that is only tried when the
  primary answers 404 model-not-found. The key is read from `process.env` inside the
  route handlers, never at module scope.
- **Three routes** — `POST /api/pipeline/extract` (multipart, one `panel-{n}` part per
  image plus a `meta` manifest), `POST /api/pipeline/translate` and
  `POST /api/pipeline/proofread` (JSON, no images). Images ride as binary precisely
  because base64 in a JSON body would exceed the request limit before the byte valve
  could halve the batch. All three call `requirePipelineViewer` first and answer
  `401` JSON with `no-store` when there is no session.
- **Batching** — `splitIntoBatches` splits panels into even batches of at most 10
  (11 → 6+5, 25 → 9+8+8, 41 → 9+8+8+8+8). A ten-panel batch plus a one-panel stub
  wastes a request from a 500/day budget, and the stub's output drifts.
- **Two valves** — an oversized extract batch is halved recursively
  (`BATCH_MAX_BYTES`); a text stage that returns an unreadable body for a chapter of
  more than 20 panels is halved once and retried.
- **Mock mode** — `MOCK_PIPELINE=1` short-circuits all three routes with deterministic
  fake bubbles, boxes and terms. No network call, no quota spent. This is how the
  workspace is developed and tested.
- **Client-driven, not a queue** — `lib/pipeline.ts` runs the three stages in the
  browser against an explicit `PipelineContext` (signed panel URLs, blocks, glossary,
  and server-action callbacks). There is no worker, no `processing_jobs` row, and no
  resume: closing the tab stops the run, and the chapter stays `processing` with the
  text it already has. A `Mark as ready` escape hatch exists for exactly that case.
  Every write goes through a server action, so RLS and role checks still apply even
  though the loop is client-side. This is the one place the build deliberately
  diverges from §8's flow.
- **Chapter-wide text passes** — translation and proofreading each run once for the
  whole chapter rather than per panel, so pronouns, forms of address and callbacks
  stay consistent. The proofread pass also returns the new glossary terms, so
  deduplication happens once per chapter instead of once per panel.

---

## 9. Design system

**Direction:** neo-brutalism. Pastel ink blocks printed on paper, and the same
blocks printed on ink in dark mode. Flat fills, hard offset shadows, visible
edges, square corners. Depth comes from a 2–6 px offset, never from blur.

- **Palette (light):** paper `oklch(0.964 0.012 91.52)` (#F6F3EA), raised
  surface `oklch(0.994 0.009 93.57)` (#FFFDF6), ink `oklch(0.182 0 89.88)`
  (#121212). Pastel fills: mint `oklch(0.897 0.083 165.63)`, lilac
  `oklch(0.834 0.093 295.44)`, apricot `oklch(0.885 0.075 59.4)`, sky
  `oklch(0.865 0.073 242.52)`, blush `oklch(0.876 0.072 357.9)`. The
  highlighter lime was retired; no lime token or primitive remains. Accent is
  a readable ink violet
  `oklch(0.37 0.154 283.9)`, because `var(--accent)` is also used as text.
- **Palette (dark):** ink `oklch(0.155 0.002 286.15)` (#0C0C0D), raised surface
  `oklch(0.197 0.004 286.03)`, cream edge/text `oklch(0.952 0.016 91.55)`
  (#F3EFE3). Pastel fills keep their light values in both themes.
- **The pastel rule:** pastels are always **fills**, never text colours. Text on
  a pastel is ink. Because a cream edge is invisible on a pastel in dark mode,
  pastel blocks carry a fixed ink outline (`--fill-edge`), not `--edge`.
- **Two edges:** `--edge` is the 2 px chrome outline (ink in light, cream in
  dark) for cards, modals, toolbars, inputs and topbars. `--border` is a 1 px
  hairline for tables, dense lists and row dividers. Controls are never hairline
  only.
- **Shape:** `border-radius: 0` everywhere. Only status dots, spinners and the
  unread pip stay round (11 intentional circles).
- **Shadows:** hard offsets only — `--shadow-hard` (4 px), `--shadow-hard-sm`
  (2 px), `--shadow-hard-lg` (6 px). No blurred shadow, no `backdrop-filter`,
  no gradients except the halftone dot screen (`.grid-field`) and the SVG
  halftone pattern in `PanelArt`.
- **Tokens:** `--bg`, `--surface`, `--surface-2`, `--surface-3`, `--edge`,
  `--border`, `--border-strong`, `--text`, `--muted`, `--faint`, `--accent`,
  `--accent-hover`, `--accent-ink`, `--accent-fill`, `--accent-soft`, `--mint`,
  `--lavender`, `--peach`, `--sky`, `--blush`, `--fill-edge`,
  `--success`, `--warning`, `--danger`, `--scrim`, `--scrim-strong`. Route CSS
  must not introduce new hex values.
- **Type:** Archivo Black for display (`--font-display`), Inter for UI, IBM Plex
  Mono for labels, metadata and numbers (`--font-mono`). `.eyebrow` renders
  mono, uppercase, bracketed `[ like this ]`. `.display-serif` survives by name
  as the heading emphasis: accent-violet text with an apricot underline. It
  deliberately repeats across wrapped lines; it is a rule, not a highlight
  block, so it also reads correctly in auth and dashboard headings.
- **Buttons:** `.btn` = surface block with a 2 px edge; hover lifts by 2 px and
  casts `--shadow-hard`; active presses into the page. `.btn-primary` is the
  ink tile with `--bg` text in light mode, inverting to a cream tile in dark;
  hover turns it apricot with ink text. Focus is a 3 px `--edge` ring, never a
  soft halo.
- **Shared primitives:** `.chip` (+ `chip-mint`, `chip-accent`, `chip-peach`,
  `chip-blush`), `.eyebrow`, `.display-serif`, `.status-dot`,
  `.group-avatar`, `.role-badge`, `.theme-toggle`, `Logo`, `getInitials`.
  Landing-only pieces — `SectionHead`, `ReleaseSlip`, `WorkspacePreview`,
  `TiltFrame`, proof rows, the inverted run band, the role ladder/access
  matrix, and `NotFoundState` — are styled in `app/landing.css`.
- **Theme runtime:** `lib/theme.ts` owns the preference (`hwaflow.theme.v1`).
  First visit follows the OS; pressing the toggle stores an explicit
  light/dark choice. An inline script in `app/layout.tsx` applies
  `data-theme` on `<html>` before paint, so there is no flash. The toggle lives
  in the dashboard and admin topbars and in the landing header; it uses one
  stored preference, so there is no second theme system. Pressing it hands the
  button's viewport centre to `toggle(origin)`, which runs a same-document View
  Transition: the new theme grows out of a `clip-path` circle from behind the
  button (480 ms, ease-out). Browsers without `startViewTransition`, and
  reduced-motion users, get the instant swap.
- **Contrast:** all text pairs meet WCAG AA — body 16.9:1, muted 8.0:1, faint
  5.0:1 on paper; ink on every pastel ≥ 11:1; dark body 17.0:1, muted 9.4:1,
  faint 5.8:1. Status colours were darkened for AA on their pastel fills.
- **Motion:** `app/motion.css` is the interaction layer. Route CSS keeps its
  own surface entrances; the motion layer fills in navigation, rows, menus,
  tabs, fields, skeletons and press feedback. 90–130 ms for input response,
  160–220 ms for entrances, `cubic-bezier(0.2, 0, 0, 1)` (plus an in-out curve
  for width/scan loops), transform/opacity only. Entrance animations use
  `backwards`, so hover transforms keep working after the animation releases.
  Rules are scoped to `:root[data-theme]` so they win against route CSS order.
  Hover transforms are gated to fine pointers; `prefers-reduced-motion` is
  honoured globally. The landing workspace is the one deliberate 3D exception:
  `TiltFrame` lerps to ±16 px x, ±8 px y, ±3° rotateY and ±1.5° rotateX under a
  fine pointer, returns to rest, and is disabled for touch or reduced motion.
  No parallax, no shine sweeps.
- **Layout:** 240 px sidebar nav, max-width content, page headers with title +
  actions. The landing uses a 12-column editorial grid, an 8/4 hero, horizontal
  proof rows, a single inverted run band, and a 5/7 role ladder + access matrix.
- **Mobile:** dashboard/library/calendar responsive; workspace shows a
  "best viewed on desktop" notice instead of a broken layout. The landing
  collapses the hero, proof rows, run band, team grid and CTA to one column;
  the workspace mock drops its rail and viewer and keeps the chapter editor.
- **Missing states:** `components/not-found-state.tsx` is the shared shape
  (torn panel, route back, optional secondary route). `app/not-found.tsx` is
  the global 404 for unmatched URLs. In-app missing states stay in-page at
  HTTP 200 instead of throwing `notFound()`, so a stale link still has the
  surrounding dashboard chrome.

---

## 10. Page inventory

Build order is the user's call. This is the full surface area, with dependencies.

### Public / auth
| # | Route | Purpose | Depends on |
|---|---|---|---|
| 0 | `/` | Marketing landing page: plain-language product story, sign-up CTA | — |
| 1 | `/login` | Username + password sign-in, error states | Supabase auth |
| 2 | `/register` | Create account (username, password, display name) | Supabase auth, profiles |

**Built:** `/`, `/login`, `/register`, `/dashboard`. Accounts, sessions and profiles run
on Supabase, and so do groups, series, chapters, glossary and notifications.

### Platform admin
| # | Route | Purpose | Depends on |
|---|---|---|---|
| 3 | `/admin` | Admin overview: group count, user count, recent groups | groups, profiles |
| 4 | `/admin/groups` | List groups w/ member & series counts, create group | groups, group_members |
| 5 | `/admin/groups/new` | Create group + assign Owner by username | RPC: create_group |
| 6 | `/admin/groups/[id]` | Group detail: change Owner, member list (metadata only) | group_members |
| 7 | `/admin/users` | All users, group memberships, deactivate/reactivate | profiles |

**Built:** `/admin/groups` (grid, search, sort, create drawer) reads and writes
Supabase through server components and actions. `/admin/groups/[id]` still renders
the pre-Supabase local-store surface (stats, Owner card, Change Owner dialog,
read-only roster) and is the one deferred page: platform admins see group metadata
and membership but not series content, so it needs a dedicated admin bundle before
the local stores can be deleted. Create is a drawer on the grid — there is no
separate `/admin/groups/new` route. `/admin` redirects to `/admin/groups`; the
overview and `/admin/users` are deferred. Admin never sees series titles or covers.

### Core app (group-scoped)

| # | Route | Purpose | Depends on |
|---|---|---|---|
| 8 | `/dashboard` | Money earned this month, chapters translated, weekly release calendar w/ day drill-down | chapters, series_release_days |
| 9 | `/series` | Tiles grid of visible series (filter: source lang, status, tag, search) | series, series_assignments |
| 10 | `/series/new` | Create series: cover upload, metadata, tags, release days, rate, source language, reading direction | storage, series |
| 11 | `/series/[id]` | Cover banner, synopsis, tags, metadata, chapter list, assignment summary | series, chapters |
| 12 | `/series/[id]/edit` | Edit all series fields + staff assignment modal + glossary entry point | series |
| 13 | `/series/[id]/glossary` | Glossary CRUD + pending term suggestions | glossary_terms, term_suggestions |
| 14 | `/series/[id]/chapters/new` | Create chapter (number auto-suggested, title) | chapters |
| 15 | `/chapters/[id]` | Chapter overview: status, page grid, submit/approve actions, history | chapters, chapter_status_events |
| 16 | `/chapters/[id]/workspace` | Upload zone → processing progress → side-by-side editor + bubble list + export | pages, jobs, text_blocks |
| 17 | `/approvals` | Manager/Owner review queue (submitted chapters, grouped by series) | chapters |

**Built:** `/groups` (every membership, active group marked), `/groups/[id]`
(role-scoped Member/Series/Money stats, Owner/Manager create-series popup, and
Monday–Sunday horizontally scrollable series lanes), `/series/[id]` (banner,
description, assignees, Manage assignments, Edit dialog, real chapters panel with
`New chapter` and hover-delete), and `/chapters/[id]/workspace` (the three-column
translation workspace: chapters + glossary rail on the left, edited English in the
middle, raw panels on the right). All of it is server-rendered from Supabase with
typed props and `"use server"` mutations; saving refreshes the route instead of
mirroring a local store.
There is no `/series` index, `/series/new`, or edit/delete UI yet — series are created
from the group detail popup. The dashboard weekly calendar reads real
`series_release_days` and the latest visible chapter per series, and dashboard money /
approved counts come from `chapters.rate_snapshot`.

### Settings
| # | Route | Purpose | Depends on |
|---|---|---|---|
| 18 | `/settings/profile` | Display name, avatar, password change | profiles |
| 19 | `/settings/group` | Group name, pricing currency, retention policy — now `/groups/[id]/settings` (General tab) | groups |
| 20 | `/groups/[id]/settings` | Members tab: invites, role changes, remove. General tab: pricing currency | group_members, group_invites, series_assignments, fx_rates |

**Built:** `/groups/[id]/settings` — reached from the gear beside the group name.
Members tab: pending invites with revoke, member table with real per-member series
counts, Owner-only role changes and removal (removal also unassigns their series).
General tab: currency switch, Owner only, converting inside `set_group_currency`.
Received invites live on `/groups`. `/settings/members` was deleted on 2026-10-24:
it guessed a group from the newest membership, which was wrong for anyone in more
than one group. Account settings (display name, username, password, display
currency) open from the profile block in the rail on every signed-in surface.
`/settings/profile` and `/settings/group` are otherwise deferred.

### Shared states (not routes)
Signed-out redirect, no-group-yet screen (signed in but uninvited), 403 for
unassigned series, empty states for every list, mobile workspace notice,
quota-exhausted pipeline banner. Every route segment also ships a `loading.tsx`
skeleton shaped like its own page (`components/page-skeleton.tsx`) and an
`error.tsx` built on `components/error-state.tsx`, so a navigation or a render
failure never shows a blank shell.

---

## 11. Working agreement

1. **One page at a time.** The user names the page; we build it completely.
2. **No stubs.** A delivered page is functional against real data or clearly labeled
   mock data, with loading/empty/error states.
3. **Consistency over cleverness.** Reuse the design tokens, the data-access layer,
   and the RBAC helpers. Do not invent a second pattern for the same problem.
4. **Every new table gets RLS + policies in the same change.** No exceptions.
5. **Every page gets a role check.** State which roles can reach it and enforce it
   server-side, not just in the nav.
6. **This document is updated** when a decision changes. Append to the decision log.
7. **Ask before scope creep.** New features go in §13, not into the current page.

---

## 12. Decision log

| Date | Decision | Rationale |
|---|---|---|
| 2026-10-21 | Platform is an ops tool, not a reader | Per user: scanlation groups, text-only output |
| 2026-10-21 | Editing is optional, not a submission gate | User chose soft review |
| 2026-10-21 | Credits derived, not stored | Fully reversible approval requires recomputation |
| 2026-10-21 | Per-series rate, multiple release days | User answers |
| 2026-10-21 | OCR behind an interface; local Paddle default, OCR.space fallback | No-card constraint vs 3 req/min limit |
| 2026-10-21 | Full admin console limited to groups + users | Excludes content access and impersonation |
| 2026-10-21 | Purge page originals on approval, policy swappable | Free-tier storage ceiling |
| 2026-10-21 | Product name is **HwaFlow** | User decision; replaces the working name MTL |
| 2026-10-21 | Landing copy is plain language; implementation details stay out of the UI | Readable by non-technical group members and newcomers |
| 2026-10-21 | Preview build gates `/admin` on the hardcoded username `noddy` until Supabase profiles exist | The localStorage auth store has no `is_platform_admin`; a username check is the narrowest honest stand-in |
| 2026-10-21 | Groups: Managers add Staff only; invites are pending until accepted; last accepted group is active; icons stored as data URLs behind a swappable adapter | Confirmed in the groups-page discussion — see `docs/GROUPS-PAGE.md` |
| 2026-10-21 | Admin and workspace shells stay separate components over shared tokens and shared `.group-avatar` / `.role-badge` primitives | The admin shell must not depend on `dashboard.css`; sharing markup would couple two surfaces that diverge (narrower rail, platform badge, no day popup) |
| 2026-10-21 | `/dashboard` is not moved into a route group; the existing rail and topbar take `links` / `active` / `trail` props instead | Avoids a large route reshuffle for one extra shell, and keeps the workspace markup identical for every page under it |
| 2026-10-21 | Group permissions are enforced inside `lib/groups.ts`, not only by hiding controls | A rendered control is not an authorization boundary; the same guards become RLS policies when Supabase lands |
| 2026-10-21 | `/admin` redirects to `/admin/groups`; the admin overview and `/admin/users` are deferred | The console is limited to groups + users, and the group grid is the only surface with real data today — a fabricated overview would violate "no stubs" |
| 2026-10-21 | Series/chapter counts return a real `0` until the series module exists | Muted honest zeros beat invented numbers, and the helper signatures stay stable when series lands |
| 2026-10-22 | Auth cut over to Supabase Auth: username maps to `<username>@users.internal`, Confirm email is OFF, `profiles.is_platform_admin` replaces the hardcoded `noddy` check, username lookup goes through `SECURITY DEFINER` RPCs (`username_available`, `profile_lookup`) | No mailbox exists for the synthetic address; `profiles` stays self-read-only, and a scoped RPC is narrower than a global "read every profile" policy |
| 2026-10-21 | Member-facing series live in `lib/series.ts` (one localStorage key for series + assignments); covers are data URLs behind a swappable adapter; release day is a single weekday `0 = Monday` | Mirrors the future `series` / `series_assignments` tables and keeps create + assignment atomic. A single weekday and optional cover match the confirmed page brief |
| 2026-10-21 | Staff only see assigned series; Managers/Owners see every series in the group | The access boundary for `/groups/[id]` and `/series/[id]`; assignments also decide whose calendar and notifications include the series |
| 2026-10-21 | Creating a series is a centered popup on group detail, not the admin drawer | The user asked for a member-facing popup; the admin surface never edits series content |
| 2026-10-21 | Assignments send a persisted per-recipient notification; release-day notifications are deferred | Assignment is the only event that exists today. Notification read state and the bell are real, replacing the static demo rows |
| 2026-10-21 | Opening `/groups/[id]` never changes the active group used by `/settings/members` | Group detail is read-only context; the active group stays an explicit settings concern |
| 2026-10-21 | Dashboard money and approved-chapter count derive from `lib/earnings.ts` and are `0` until chapters exist; the weekly calendar stays preview data | Honest zeros are preferable to fabricated totals, and the calendar is explicitly labeled preview until real release days are wired |
| 2026-10-21 | Removing a member also removes their series assignments; member and admin counts read from the series store | The remove dialog already promised unassignment — cleanup makes it true and keeps visible counts coherent |
| 2026-10-21 | Member and admin rosters are tables on desktop and stacked cards below 560px | Five columns plus row actions cannot fit a phone, and horizontal scrolling hid the actions; the table semantics stay in the markup |
| 2026-10-22 | The chapter module owns its own store (`lib/chapters.ts`, `lib/glossary.ts`); it may import groups and series, and groups/series never import it | Keeps the dependency arrow one-way. The one exception is `lib/earnings.ts`, which reads chapters to derive money — earnings are a view of approved work, not a second source of truth |
| 2026-10-22 | The pipeline runs in the browser, not a worker queue; `processing_jobs` is deferred | There is no backend yet. The run keeps its text if the tab closes, the chapter stays `processing`, and a `Mark as ready` escape hatch covers the interrupted case |
| 2026-10-22 | Gemini `gemini-3.5-flash-lite` is the only provider, behind the `OCRProvider` / `Translator` interfaces | Free tier, no card, 500 RPD. Keeping the interface means a local Paddle OCR or another host is a new implementation, not a rewrite |
| 2026-10-22 | `MOCK_PIPELINE=1` short-circuits all three pipeline routes with deterministic fake data | The workspace can be built and demoed without a key and without spending quota. A hard requirement, not a convenience |
| 2026-10-22 | Extraction batches panels into even groups of at most 10; the text stages run once for the whole chapter | A ten-panel batch plus a one-panel stub wastes a request and drifts. Chapter-wide text passes keep pronouns and callbacks consistent across panels |
| 2026-10-22 | The series rate is snapshotted onto the chapter at submit time | Editing the rate must never rewrite approved earnings; the snapshot makes that automatic and keeps approval reversible |
| 2026-10-22 | Glossary terms carry provenance — `auto` or `manual` — and the pipeline may never overwrite a manual term | A human decision outranks a model suggestion, and the workspace has to show which is which |
| 2026-10-22 | The main nav rail collapses to icons only on the chapter workspace | Three columns plus a 17rem rail does not fit at 1024px. The rail keeps its accessible names, and every other page keeps the full rail |
| 2026-10-22 | Content data moved from browser stores to Supabase table by table: groups → series → chapters/pages/blocks → glossary → notifications | localStorage could not power multi-device groups or private images. One module per phase kept each surface shippable |
| 2026-10-22 | Start empty — no importer for existing browser data | The stores were preview data, not production records. An importer would add a migration path nobody needs |
| 2026-10-22 | Series have a `series_release_days` table, not one weekday column | A series can release several days a week; the group lanes and dashboard calendar both read the same rows |
| 2026-10-22 | Series, chapters, glossary and assignment writes are RPC-only; reads are RLS policies | The browser never gets INSERT/UPDATE policies, so role enforcement lives in one place and cannot be bypassed by calling the table directly |
| 2026-10-22 | All content Storage buckets are private; images are read through short-lived signed URLs | Panels are licensed source material. Public buckets would make every page URL guessable and permanent |
| 2026-10-22 | Panel images upload directly from the browser to `pages/{group}/{chapter}/{panel}.webp`, then `register_panels` writes metadata | Vercel functions are stateless and request bodies are size-limited; direct-to-Storage is the only shape that scales. A failed upload leaves the row untouched |
| 2026-10-22 | Saving refreshes the route instead of mirroring server data in a second store | One source of truth. `activeByUser` stays device-local because the active group is a UI preference, not content |
| 2026-10-22 | Chapter status changes go through a fixed matrix; submit requires at least one page and one non-empty final text; approval snapshots `rate_snapshot` | Prevents empty submissions and makes approved earnings immune to later rate edits |
| 2026-10-22 | Managers may approve chapters they submitted | Groups are small and review is a workflow, not a separation-of-duties control; the alternative stalled work |
| 2026-10-22 | Glossary terms carry `origins[]` + `status`; editing an auto term promotes it to `manual`; auto upserts never overwrite manual or revive dismissed terms | Preserves the existing provenance contract now that multiple contributors share the series |
| 2026-10-22 | Assignment notifications are written by an `AFTER INSERT` trigger on `series_assignments` | `create_series` and `set_series_assignments` both insert there, so one trigger covers every path and self-assignment is skipped |
| 2026-10-22 | `/admin/groups/[id]` remains on the pre-Supabase local stores for now | Platform admins can see group metadata but not series/chapter content under RLS, so the page needs its own admin bundle before it can be converted honestly. Every other surface is Supabase-backed |
| 2026-10-22 | Pipeline routes require a session (`requirePipelineViewer`) | They spend paid/free-tier provider quota; an unauthenticated endpoint would be an open proxy |
| 2026-10-22 | Dashboard money and approved counts are computed server-side from approved chapters' `rate_snapshot`; `lib/earnings.ts` and the chapter/glossary/notification browser stores are retired | One query shape for one number, and no second copy of chapter state to drift. The deferred admin detail keeps the remaining local helpers alive until it is converted |
| 2026-10-24 | Member management lives at `/groups/[id]/settings`; `/settings/members` is deleted | The old page guessed a group from the newest membership, which is simply wrong for an Owner in several groups. The group id is now in the URL, so there is nothing to guess |
| 2026-10-24 | Two currencies: `groups.currency` for pricing, `profiles.display_currency` for reading; conversion is server-side from `fx_rates` | Yields one place to set a price and no per-page conversion logic. `FALLBACK_RATES` keeps the UI working when a refresh fails, and the client never supplies the factor the `set_group_currency` RPC uses |
| 2026-10-24 | Approved chapters keep the currency they were earned in (`chapters.rate_currency`, snapshotted at submit) | A group switching currency must not rewrite what someone already earned; only series rates and in-flight snapshots convert |
| 2026-10-24 | Time spent is stored per member per day in `focus_time`, written only through `log_focus_time` | `localStorage` reset on a second device and on cleared site data, so the widget undercounted. The cap (600s per call) keeps a stuck loop from claiming an hour in one request |
| 2026-10-24 | Every route segment has its own loading skeleton shaped like the page, and its own `error.tsx` built on `ErrorState` | A single generic skeleton made every navigation look identical, and an unhandled render error used to land on the bare Next error screen |
| 2026-10-24 | Account settings are a dialog owned by `DashboardRail` | The rail is present on every signed-in surface, so one mount point covers all of them without another shell or route |
| 2026-10-24 | `FocusTracker` is mounted in the root layout and is the only counter; the dashboard reads it through `useFocus` | Time spent is app-wide, not dashboard-only, and the provider survives client navigation. It seeds from `GET /api/focus-time` so a new tab or a fresh sign-in resumes today's stored total instead of restarting at zero |

---

## 13. Backlog / open questions

- **Registration policy** — public signup is assumed. Should signup be open, or
  admin-created only? Open signup means unaffiliated accounts accumulate.
- **Invite acceptance** — does an invited user auto-join, or accept an invite from an
  in-app inbox? No email exists, so the inbox is the only channel.
- **Group switcher** — schema supports multi-group; v1 UI assumes one. Confirm this is
  acceptable for the first release.
- **Chapter revisions** — after a chapter is approved and later reverted for a fix,
  is the same chapter edited, or is a new revision created?
- **Manhwa/webtoon panel detection** — clustering OCR lines into "bubbles" is
  heuristic. If quality is poor, fall back to raw line blocks in the workspace.
- **Translation tone per series** — a per-series style note (e.g. "formal British
  English") fed into the pass-2 prompt. Cheap to add, high perceived value.
- **Export format** — TXT, JSON, CSV are assumed. Confirm what typesetters actually
  want (possibly a DOCX or Aegisub-style table).
- **Notifications** — no in-app notification system in v1. Managers discover
  submissions via `/approvals`.
- **Audit of credit changes** — `chapter_status_events` covers state, but there is no
  explicit ledger of "earning appeared/disappeared" events.


---

## 14. Image engine bridge (XianScan)

An **additional** path alongside the existing OCR -> translate -> proofread
pipeline. Nothing in that pipeline changes.

- `lib/engine.ts` — `server-only` client for the deployed Cloudflare Worker.
  Reads `ENGINE_API_URL` and `ENGINE_WEB_TOKEN`. The browser never sees the
  token and never calls the engine directly.
- `lib/engine-access.ts` — `server-only` authorization for every job-scoped
  route. Resolves `jobId -> chapterId` once per job (10-minute memo) and then
  asks `can_view_chapter` / `can_manage_chapter`, returning `403` on a definite
  refusal. A job id is a handle, not a permission.
- `app/api/engine/jobs/**` — seven route handlers: create job, get job,
  approve, reject, proxy raw/final/approved/clean/regions assets, import the
  engine's regions into `text_blocks`, and copy the finished pages into the
  `renders` bucket. All use
  `requirePipelineViewer()` (and `getViewer()` for the high-frequency asset
  route) and return Web `Response` objects. Route params are Promises (Next 16).
  Job creation refuses chapters above 40 pages or 80 MB with a `413`, because the
  whole payload is buffered before it is forwarded.
- `lib/engine-regions.ts` — maps `regions.json` onto `text_blocks`
  (`bbox` normalised to 0..1 per panel, source and target text). Import is a
  merge through `set_panel_blocks`, so pipeline translations and hand edits are
  never blanked.
- `lib/engine-renders.ts` + `20261106000000_engine_renders.sql` — finished pages
  are copied into a private `renders` bucket (`pages` only accepts WebP) and
  `chapter_pages.clean_path` points at them through
  `set_chapter_page_render(uuid, text)`. `original_path` is never rewritten, so
  extraction keeps OCRing the raw art; `previewUrl` is display-only and survives
  a purge.
- `app/api/chapters/[id]/download/route.ts` + `lib/zip.ts` — the deliverable:
  every saved render for a chapter in one ZIP, written directly by a small
  stored-entry writer (no dependency, no compression). Chapter-scoped because
  renders outlive the engine job; reads use the viewer's session, so the
  `renders` policy governs access.
- `components/chapters/engine-panel.tsx` — mounted in `workspace-view.tsx`
  with `<EnginePanel chapterId={chapter.id} canApprove={canManage} />`.
  Self-contained inline styles, no new dependency.
- `supabase/migrations/20261105000000_engine_purge.sql` — optional
  `purge_chapter_originals(uuid)` RPC. It flips `chapter_pages.storage_state`
  to `purged`, respects `groups.retention_policy = 'keep'`, and reuses
  `can_manage_chapter(uuid)`. Inert unless `ENGINE_PURGE_SUPABASE_ORIGINALS=1`.

On **Approve** the Worker deletes the raw/clean/final objects from its private
Backblaze B2 bucket immediately and keeps `approved/` for ~7 days. Supabase
originals are only purged when the env flag and the migration are both present.

Environment variables (all empty in `.env.example`, never `NEXT_PUBLIC_`):
`ENGINE_API_URL`, `ENGINE_WEB_TOKEN`, `ENGINE_PURGE_SUPABASE_ORIGINALS`.
`GEMINI_API_KEY` and `MOCK_PIPELINE` belong to the existing text pipeline and
are unrelated to the engine's own Gemini key (which lives as a Worker secret).
