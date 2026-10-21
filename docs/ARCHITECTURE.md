# HwaFlow — Manhwa Translation Platform

> **Status:** In build. Landing, auth, workspace and the groups delivery (admin console
> + member settings) are complete.
> **Build mode:** Page-by-page. The user names a page; we build that page fully, then move on.
> **Last updated:** 2026-10-21
> **Next up:** Series module (tiles grid, create/edit, assignments). The groups build
> spec and decision record stays at [`docs/GROUPS-PAGE.md`](GROUPS-PAGE.md).

This document is the single source of truth for architecture, decisions, and the page
inventory. Read it before building anything.

> Note: the repo's `context.md` is empty (0 bytes). This document supersedes it.
> When we start building, a copy belongs at `D:\Noddy\MTL\docs\ARCHITECTURE.md`.

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
3. Currency is a label on the group (USD default). No conversion, no formatting rules
   beyond symbol + 2 decimals.
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
| Backend (AI/image) | Python, FastAPI |
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
| Backend packaging | FastAPI + Pydantic + httpx + Pillow | Minimal, free-tier friendly |
| Job execution | DB-backed job table polled by an in-process async worker | Avoids paid Redis/queue services |

### Provider strategy (important)
OCR and translation are **interfaces**, not hard-coded services:

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
  title text not null
  alt_titles text[]
  slug text
  synopsis text
  cover_path text
  source_language text check (source_language in ('ko','ja','zh'))
  reading_direction text check (reading_direction in ('ttb','rtl','ltr')) default 'ttb'
  status text check (status in ('ongoing','completed','hiatus','cancelled'))
  rate_amount numeric(10,2) default 0        -- per approved chapter
  archived bool default false
  created_by uuid
  created_at / updated_at timestamptz

series_tags (series_id, tag text)             -- free-form tags, lowercase
series_release_days (series_id, weekday smallint 0..6)   -- multiple per series
series_assignments (series_id, user_id, assigned_by, created_at)

chapters
  id uuid pk
  series_id uuid -> series.id
  number numeric(10,2)                       -- supports 12.5 side chapters
  title text
  status text check (status in ('draft','processing','ready','submitted','approved','rejected'))
  submitted_by uuid / submitted_at timestamptz
  approved_by uuid / approved_at timestamptz
  rejection_note text
  created_by uuid
  created_at / updated_at timestamptz
  unique (series_id, number)

chapter_pages
  id uuid pk
  chapter_id uuid -> chapters.id
  page_index int
  original_path text
  thumb_path text
  width int / height int
  storage_state text check (storage_state in ('stored','purged'))
  unique (chapter_id, page_index)

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
  notes text
  created_by uuid
  unique (series_id, source_term)

term_suggestions                   -- produced by the term-detection pass
  id uuid pk
  series_id uuid
  source_term text
  proposed_target text
  chapter_id uuid
  status text check (status in ('pending','accepted','dismissed'))
  created_at timestamptz

processing_jobs
  id uuid pk
  chapter_id uuid -> chapters.id
  status text check (status in ('queued','running','done','failed','cancelled'))
  current_step text                          -- 'ocr' | 'translate' | 'localize'
  progress_current int / progress_total int
  provider_ocr text / provider_translate text
  error text
  started_at / finished_at / created_at timestamptz
```

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
  - `has_group_role(group_id, roles text[])`
  - `can_view_series(series_id)` → manager/owner in group OR assigned staff
  - `can_edit_series(series_id)`
- Every table gets RLS **enabled**. No table is left open.
- Storage policies mirror `chapter_pages` access for the `pages` bucket.
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

---

## 9. Design system

- **Palette:** pastel. Muted mint, lavender, peach, sky as accents on near-white
  surfaces. Never saturated primaries. Dark mode uses desaturated deep slate, not black.
- **Tokens:** `--bg`, `--surface`, `--surface-2`, `--border`, `--text`, `--muted`,
  `--accent`, `--accent-soft`, `--success`, `--warning`, `--danger`. All colors go
  through tokens; no hard-coded hex in components.
- **Shape:** generous rounding (12–16 px), 1px soft borders, low-opacity shadows.
- **Density:** roomy. This is a tool people stare at for hours.
- **Shared primitives:** `.chip` (+ `chip-mint`, `chip-accent`, `chip-peach`), `.eyebrow`,
  `.display-serif`, `.status-dot`, `.group-avatar`, `.role-badge`, `Logo`, `getInitials`.
  Both the admin and workspace shells compose these rather than each defining their own.
- **Type:** Inter for UI; Noto Sans KR/JP/SC as CJK fallback for source text.
- **Motion:** 120–180 ms ease-out, no bounce. Respect `prefers-reduced-motion`.
- **Layout:** 240 px sidebar nav, max-width content, page headers with title + actions.
- **Mobile:** dashboard/library/calendar responsive; workspace shows a
  "best viewed on desktop" notice instead of a broken layout.

---

## 10. Page inventory

Build order is the user's call. This is the full surface area, with dependencies.

### Public / auth
| # | Route | Purpose | Depends on |
|---|---|---|---|
| 0 | `/` | Marketing landing page: plain-language product story, sign-up CTA | — |
| 1 | `/login` | Username + password sign-in, error states | Supabase auth |
| 2 | `/register` | Create account (username, password, display name) | Supabase auth, profiles |

**Built (preview):** `/`, `/login`, `/register`, `/dashboard` — against the
browser-local localStorage stores, not Supabase yet.

### Platform admin
| # | Route | Purpose | Depends on |
|---|---|---|---|
| 3 | `/admin` | Admin overview: group count, user count, recent groups | groups, profiles |
| 4 | `/admin/groups` | List groups w/ member & series counts, create group | groups, group_members |
| 5 | `/admin/groups/new` | Create group + assign Owner by username | RPC: create_group |
| 6 | `/admin/groups/[id]` | Group detail: change Owner, member list (metadata only) | group_members |
| 7 | `/admin/users` | All users, group memberships, deactivate/reactivate | profiles |

**Built (preview):** `/admin/groups` (grid, search, sort, create drawer) and
`/admin/groups/[id]` (stats, Owner card, Change Owner dialog, read-only roster).
Create is a drawer on the grid — there is no separate `/admin/groups/new` route.
`/admin` redirects to `/admin/groups`; the overview and `/admin/users` are deferred.

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

### Settings
| # | Route | Purpose | Depends on |
|---|---|---|---|
| 18 | `/settings/profile` | Display name, avatar, password change | profiles |
| 19 | `/settings/group` | Owner: group name, currency, retention policy | groups |
| 20 | `/settings/members` | Invite by username, pending invites, change roles, remove | group_members, group_invites |

**Built (preview):** `/settings/members` — received invites, Staff self-card, and the
Owner/Manager roster with the invite drawer and remove confirmation. Series-assigned
counts are a read-only `0` until the series module exists. `/settings/profile` and
`/settings/group` are deferred.

### Shared states (not routes)
Signed-out redirect, no-group-yet screen (signed in but uninvited), 403 for
unassigned series, empty states for every list, mobile workspace notice,
quota-exhausted pipeline banner.

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
| 2026-10-21 | Member and admin rosters are tables on desktop and stacked cards below 560px | Five columns plus row actions cannot fit a phone, and horizontal scrolling hid the actions; the table semantics stay in the markup |

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
