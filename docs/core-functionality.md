# HwaFlow — Core Functionality Spec (Chapter Workspace)

> **This file is the sole reference for implementing the chapter module.** Every decision
> below was confirmed with the user in discussion on 2026-10-21. Where a value is given
> (width, copy string, timing, limit), use it exactly. Where something is not covered here,
> follow the existing codebase pattern named in §3 and §13 — do not invent a new one.
>
> **Read alongside:** `docs/ARCHITECTURE.md` (data model, RBAC, pipeline intent, R4),
> `docs/SERIES-PAGE.md` (store conventions already in production),
> `docs/GROUPS-PAGE.md` (rail + permissions the workspace builds on).
>
> **Next 16 warning:** this is not the Next.js in your training data. Read
> `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md` before
> writing any API route, and
> `node_modules/next/dist/docs/01-app/02-guides/environment-variables.md` before touching
> env vars. Dynamic pages take `params: Promise<{ id: string }>` and must
> `const { id } = await params`.

---

## 0. What is being built

The chapter module, end to end:

1. **Create chapters** from a series; creating one redirects straight to the workspace.
2. **Upload raw panels** (multiple at once) to a chapter.
3. **Run a free OCR → translate → proofread pipeline** on those panels, batched: extraction
   reads up to ten panels per request, translation and proofreading run once for the whole
   chapter.
4. **A three-zone workspace**: icon-only nav rail · chapter + glossary rail · translation
   editor · raw panel viewer.
5. **Human editing** of the English text, bubble by bubble.
6. **A shared per-series glossary** that fills itself from the pipeline and accepts manual
   terms, with visible Auto/Manual provenance.
7. **Submit → approve / reject**, with approval paying the series rate to the submitter.
8. **Real derived earnings** across the dashboard and group stats.

---

## 1. Hard decisions

### 1.1 Pipeline

| Area | Decision |
|---|---|
| Provider | **Gemini `gemini-3.5-flash-lite`**, for all three passes: extract, base translate, glossary proofread. One provider, one key. |
| Why | Reads CJK (including vertical Japanese) and stylized comic lettering straight from an image, and handles the text passes in the same request shape. **Free tier on the user's own project, measured 2026-10-21: 500 requests/day, 15 RPM, 250K TPM, no credit card.** Flagship `gemini-3.8-flash` is also free but caps at **20 requests/day**, which cannot run a chapter — see §5.2. |
| Interfaces | Gemini sits behind the `OCRProvider` / `Translator` idea in ARCHITECTURE §4. It is the first implementation, not the architecture. OCR.space or Paddle must be addable later without touching any UI. |
| Host | **Next.js route handlers** under `app/api/pipeline/`. No FastAPI, no Python, no second deploy, no CORS. |
| Key | `GEMINI_API_KEY` in `.env.local`. Server-only. **Never** `NEXT_PUBLIC_*`, never in a client bundle, never committed. |
| Upload unit | **One uploaded image = one panel.** Multiple files accepted per upload. |
| Ordering | Panels keep upload order. `Panel.index` is 0-based; the UI displays `Panel 1`, `Panel 2`. |
| Processing | **Three stages per run, batched.** Extract packs up to **10 panels into one request**; translate and proofread each run **once for the whole chapter**. Batches run sequentially, never in parallel. |
| Batch order | `b = ceil(n / 10)` batches, split so sizes differ by at most one, panels in upload order, no runt tail: 7 → `7`; 11 → `6 + 5`; 25 → `9 + 8 + 8`; 40 → `10 + 10 + 10 + 10`; 41 → `9 + 8 + 8 + 8 + 8`. Helper: `lib/ai/batch.ts`. |
| Transport | Panels travel as **`multipart/form-data`**, not JSON data URLs — base64 inflates by a third, and ten panels would blow past common 4.5 MB function-body limits. Responses stay JSON. |
| Trigger | **Explicit `Run translation` button**, top-right, directly above the raw panel viewer. Uploading does **not** start the pipeline. |
| Passes | `extract` per batch → `translate` for the whole chapter → `proofread` for the whole chapter, in that order, inside one run. |
| Why chapter-level text | Translating panel by panel loses who is speaking to whom and what was said two panels ago; a human translator reads the chapter first. It also applies the glossary **once instead of forty times**, so one term cannot land two different ways on panels 3 and 27, and it extracts new terms once instead of once per panel — far fewer duplicate auto entries in the glossary panel. |
| Progress | **Stage strip**, not per-panel: `Reading panels 20 / 40` → `Translating chapter` → `Proofreading chapter`. Survives re-render and view switches. |
| Failures | An extract batch failing marks **only its own** panels failed; a text-stage failure is retryable as a whole. Neither aborts the run. Failed panels keep their position and expose `Retry`, which re-extracts only those panels and then re-runs the two text stages. |
| Glossary use | The series glossary is injected into every proofread prompt. A term added later is picked up on the next run. |
| Data usage | **Accepted by the user (2026-10-21):** free-tier inputs may be reviewed by Google to improve their products. Paid tier is excluded. Kept behind the provider interface so a paid key swaps in without code changes. |

### 1.2 Chapter lifecycle

| Area | Decision |
|---|---|
| States | `draft → processing → ready → submitted → approved` / `rejected` |
| Dots | green `approved` · red `rejected` · grey `draft` and `ready` · amber `processing` and `submitted` |
| Create | `New chapter` on the series page creates **immediately** with the next suggested number, no dialog, then redirects to `/chapters/{id}/workspace`. |
| Number | Decimal allowed (`12.5`). Unique per series. Editable in the workspace header. |
| Delete | Hover a chapter row (series page **or** chapter rail) → trash icon → confirm dialog. **Owner/Manager only.** |
| Submit | `Submit` in the workspace top bar. Available to Owner/Manager always, Staff when assigned. Requires at least one panel with text. |
| Approve / Reject | `Approve` / `Reject` in the workspace top bar, Owner/Manager only. Reject takes an optional note. |
| Reopen | Owner/Manager can move an `approved` chapter back to `submitted` (reversible approval, ARCHITECTURE §2). Earnings drop immediately because they are derived. |
| Revisions | A rejected chapter is edited in place and resubmitted. No revision table in this build. |

### 1.3 Series changes

| Area | Decision |
|---|---|
| Rate | `Series.rateAmount: number` — money per approved chapter. Collected in the create-series dialog. Default `0`. |
| Edit | Full **Edit series** dialog for Owner/Manager: title, cover, genre, description, release day, rate. |
| Snapshot | The rate is copied onto the chapter at **submit** time as `rateSnapshot`, so later rate edits never rewrite history. |
| Titles | Duplicate series titles remain allowed. |

### 1.4 Money

| Area | Decision |
|---|---|
| Recipient | **The submitter.** Whoever clicked `Submit` earns `rateSnapshot` when the chapter is approved. |
| Derivation | Always derived. No `user.total_earned` anywhere (ARCHITECTURE R4). |
| Month rule | A chapter counts in the calendar month containing `approvedAt`. |
| Wiring | `lib/earnings.ts` becomes real: dashboard total, group Money stat, per-member stat, approved-chapter count. |
| Reversal | Approving adds, reopening removes. No ledger, no reconciliation. |

### 1.5 Glossary

| Area | Decision |
|---|---|
| Scope | **Per series, shared across every chapter of that series.** Not per chapter. |
| Placement | A **sticky tab bar** at the very top of the left rail: `Chapters` \| `Glossary`. Chapters render below as a Discord-style list. The tab bar stays pinned while the list scrolls. |
| Growth | Automatic. The proofread pass returns nouns worth keeping — character names, places, honorifics, items, recurring terms. |
| Manual | The user can add a term by hand (`sourceTerm`, `targetTerm`, category). |
| Provenance | Every row carries an `Auto` or `Manual` chip. Never ambiguous. |
| Dedupe | Unique on `(seriesId, sourceTerm)`. A manual add of an existing auto term promotes it to `manual` and keeps the user's target. |
| Dismissal | Auto terms can be **dismissed** (not deleted) so the pipeline stops resurfacing them. Dismissed terms are hidden and excluded from prompts. |

---

## 2. Current repo state (what already exists)

Built and working, do not rebuild:

- `lib/auth.ts` — accounts in localStorage, `useAuthSession`, `getInitials`, `findAccount`,
  `normalizeUsername`, `signOut`, `isPlatformAdmin` bridge.
- `lib/groups.ts` — `Group`, `GroupMember`, `GroupRole`, `getMembers`,
  `getMemberByUsername`, `getOwner`, `canManageMembers`, `roleRank`, `listGroupsForUser`,
  `getActiveGroupFor`, invite/role/removal flows, `GroupError`.
- `lib/series.ts` — `Series`, `SeriesAssignment`, `SeriesState`, `SeriesError`,
  `canManageSeries`, `listSeriesForGroup`, `listSeriesForViewer`, `getSeries`,
  `getAssignments`, `getAssignedUsernames`, `isAssigned`, `canViewSeries`,
  `createSeries`, `setSeriesAssignments`, `removeMemberAssignments`, `subscribeSeries`.
- `lib/series-cover.ts` — 2:3 cover crop to 480×720 WebP, `MAX_SERIES_COVER_BYTES = 120 KB`.
- `lib/notifications.ts` + `use-notifications.ts` — persisted per-user notifications.
- `lib/earnings.ts` — signature-complete stubs returning `0`.
- `lib/format.ts` — `formatShortDate`, `formatMoney`.
- `lib/use-dialog.ts` — `useDialogA11y` (Tab trap, Escape, body-scroll lock, focus restore).
- `components/dashboard/dashboard-rail.tsx` — fixed 17rem rail, `links`/`active`/
  `sectionLabel` props, mobile drawer under 1024px.
- `components/dashboard/dashboard-topbar.tsx` — breadcrumb `trail`, notification bell.
- `components/dashboard/workspace-nav.ts` — `workspaceLinks()`.
- `components/groups/*` — `AssigneePicker`, `create-series-dialog`, `series-cover`,
  `series-cover-field`, `manage-assignments-dialog`, `series-tile`, `day-lane`.
- `components/series/series-view.tsx` — series page with a **placeholder** Chapters panel
  (`Coming soon`, `No chapters yet`). This is what gets replaced.
- `app/series/[id]/page.tsx` — `params: Promise`, `metadata` with
  `robots: { index: false, follow: false }`.

Not built: `/series` index, `/approvals`, `/settings/profile`, `/settings/group`, the OCR
pipeline, uploads, chapters, earnings values.

---

## 3. Conventions to copy exactly

These are established in the repo. Match them; do not modernise them.

**Store module shape** (`lib/series.ts` is the template):

```
"use client" consumers only · module has no "use client" unless it needs one
types → error class with a `code` union → key/event constants → canUseStorage()
→ emptyState() → getState() → writeState() → notify() → subscribe()
→ createId(prefix) with crypto.randomUUID + getRandomBytes fallback
→ pure validators → reads → writes with guard helpers
```

- One localStorage key per domain, always versioned: `hwaflow.<domain>.v1`.
- Custom event `hwaflow:<domain>` for same-tab, plus a `storage` listener for cross-tab.
- `canUseStorage()` probes with a write/remove of `__hwaflow_<domain>_probe__`.
- `writeState` throws `storage` failure with human copy on quota errors.
- Permission checks live **in the store**, not only in components. A forged call must throw.
- `createId(prefix)` returns `crypto.randomUUID()` or `<prefix>_<24 hex chars>`.
- Typed error classes (`SeriesError`, `GroupError`) with a union `code` and messages
  written for a person, not a developer.

**Hooks** (`lib/use-series.ts` is the template): `{ state, ready }`, read only after mount,
subscribe to the custom event + `storage`, never touch localStorage during SSR/hydration.
A loading screen shows until every required store is `ready`.

**Page shell**: `"use client"` view component, `app/<route>/page.tsx` server file exporting
`metadata` (`title`, `robots: { index: false, follow: false }`), await `params`.

**CSS**: one file per route family imported by that route's `layout.tsx`. Tokens only — no
hard-coded hex. Motion 120–180 ms `var(--ease-out)`, no bounce, respect
`prefers-reduced-motion`. Caps and `.dash-enter` stagger via `data-delay`.

**Density and shape**: 12–16 px radii, 1 px soft borders, low-opacity shadows, roomy
spacing. Pastel palette: muted mint / lavender / peach / sky on near-white, desaturated
slate in dark mode.

---

## 4. Data model

### 4.1 `lib/chapters.ts` (new)

Mirrors `chapters`, `chapter_pages`, `text_blocks`, `chapter_status_events` from
ARCHITECTURE §6. Key: `hwaflow.chapters.v1`. Event: `hwaflow:chapters`.

```ts
export type ChapterStatus =
  | "draft"
  | "processing"
  | "ready"
  | "submitted"
  | "approved"
  | "rejected";

export type Chapter = {
  id: string;
  seriesId: string;
  groupId: string;              // denormalised for RLS-shaped reads
  number: number;               // 12.5 allowed
  title: string | null;
  status: ChapterStatus;
  rateSnapshot: number | null;  // copied from series.rateAmount at submit
  submittedBy: string | null;   // username — the person who earns the money
  submittedAt: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  rejectionNote: string | null;
  createdBy: string;
  createdAt: string;            // ISO
  updatedAt: string;
};

export type Panel = {           // chapter_pages
  id: string;
  chapterId: string;
  index: number;                // 0-based, upload order
  width: number;
  height: number;
  byteSize: number;             // compressed WebP size
  storageState: "stored" | "purged";
  createdAt: string;
};

export type TextBlock = {       // text_blocks
  id: string;
  panelId: string;
  chapterId: string;            // denormalised so block reads never join
  index: number;                // reading order within the panel
  bbox: { x: number; y: number; w: number; h: number } | null; // 0..1 normalized
  sourceText: string;           // CJK as extracted
  baseTranslation: string;      // pass 1
  finalText: string;            // pass 2 / human edit
  confidence: number | null;
  isEdited: boolean;
  editedBy: string | null;
  editedAt: string | null;
};

export type PanelPipelineState = {
  panelId: string;
  // Stage-level state (which pass is running) lives on RunState in §5.4 — a panel does not
  // track its own step, because extraction moves in batches and the text passes move as one.
  status: "pending" | "extracting" | "extracted" | "done" | "failed";
  error: string | null;         // typed code from §5.2: quota | network | bad-response | …
};

export type ChapterState = {
  version: 1;
  chapters: Chapter[];
  panels: Panel[];
  blocks: TextBlock[];
  statusEvents: ChapterStatusEvent[];  // audit trail, append-only
};
```

`ChapterStatusEvent`: `{ id, chapterId, fromStatus, toStatus, actorId (username), note, createdAt }`.

**Panel images are not in localStorage.** Data URLs exhaust the ~5 MB quota in a single
chapter. Images live in IndexedDB behind `lib/panel-store.ts`:

```ts
putPanelImage(panelId: string, blob: Blob): Promise<void>
getPanelImage(panelId: string): Promise<Blob | null>
deletePanelImage(panelId: string): Promise<void>
deleteChapterImages(panelIds: string[]): Promise<void>
deleteAllPanelImages(): Promise<void>   // used by the storage-reset path
```

DB `hwaflow-media`, store `panels`, key `panelId`. Hand-rolled IDB wrapper, ~50 lines, no new
dependency. Document the swap point: this becomes a Supabase Storage `pages` bucket upload,
exactly like the comment in `lib/series-cover.ts`.

**Store API — reads**

```ts
listChaptersForSeries(seriesId: string): Chapter[]      // number ascending
getChapter(chapterId: string): Chapter | null
listPanels(chapterId: string): Panel[]                  // index ascending
listBlocks(panelId: string): TextBlock[]                // index ascending
blocksForChapter(chapterId: string): TextBlock[]
nextChapterNumber(seriesId: string): number             // max(existing) + 1, min 1
countChaptersForSeries(seriesId: string): number
countApprovedChaptersForMember(groupId: string, username: string): number
canViewChapter(chapterId: string, username: string): boolean
subscribeChapters(listener: () => void): () => void
getChapterState(): ChapterState
```

**Store API — writes** (all validate + throw `ChapterError`)

```ts
createChapter({ seriesId, actor }): Chapter
updateChapterDetails({ chapterId, number?, title?, actor }): void
deleteChapter({ chapterId, actor }): void
addPanels({ chapterId, panels: Array<{ blob, width, height, byteSize }>, actor }): Panel[]
removePanel({ chapterId, panelId, actor }): void
setPanelBlocks({ chapterId, panelId, blocks, actor }): TextBlock[]
updateBlockText({ blockId, finalText, actor }): void
setChapterStatus({ chapterId, next, note?, actor }): void
```

`ChapterErrorCode`:
`not-found` · `forbidden` · `invalid-number` · `duplicate-number` · `invalid-title` ·
`no-content` · `bad-transition` · `storage` · `unknown`.

**Lifecycle guards (in `setChapterStatus`, not in components):**

| From | Allowed to | Who |
|---|---|---|
| `draft` | `processing` | Owner/Manager, assigned Staff |
| `processing` | `ready`, `draft` | pipeline / Owner/Manager, assigned Staff |
| `ready` | `submitted`, `processing` | submitter roles |
| `submitted` | `approved`, `rejected` | Owner/Manager only |
| `approved` | `submitted` | Owner/Manager only (reopen) |
| `rejected` | `draft`, `submitted` | submitter roles |

Any other transition throws `bad-transition`. `submitted` requires ≥ 1 panel with ≥ 1 block
whose `finalText` is non-empty, else `no-content`. Entering `submitted` sets
`rateSnapshot = series.rateAmount`, `submittedBy = actor`, `submittedAt = now`. Entering
`approved` sets `approvedBy` / `approvedAt`. Leaving `approved` clears both. Every
transition appends a `ChapterStatusEvent`.

**Validation**

- `number`: finite, `> 0`, `≤ 99999`, at most 2 decimals, unique within the series
  (excluding itself on update). Message: `That chapter number is already taken.`
- `title`: optional, trimmed, collapsed whitespace, ≤ 80 chars.
- `finalText`: trimmed, ≤ 4000 chars per block.
- `deleteChapter` also deletes its panels, blocks, events, and IndexedDB images, and is
  Owner/Manager only.

### 4.2 `lib/glossary.ts` (new)

Key `hwaflow.glossary.v1`. Event: `hwaflow:glossary`. Mirrors `glossary_terms`.

```ts
export type GlossaryOrigin = "auto" | "manual";
export type GlossaryCategory = "character" | "place" | "honorific" | "item" | "term";
export type GlossaryStatus = "active" | "dismissed";

export type GlossaryTerm = {
  id: string;
  seriesId: string;
  sourceTerm: string;      // CJK as detected
  targetTerm: string;      // English
  category: GlossaryCategory;
  origin: GlossaryOrigin;
  status: GlossaryStatus;
  chapterId: string | null; // where first detected
  createdBy: string | null; // null for auto
  createdAt: string;
  updatedAt: string;
};
```

API: `listGlossaryTerms(seriesId, opts?: { includeDismissed?: boolean })`,
`activeGlossaryTerms(seriesId)`, `addManualTerm({ seriesId, sourceTerm, targetTerm,
category, actor })`, `upsertAutoTerms({ seriesId, chapterId, terms })`,
`updateTerm({ termId, targetTerm?, category?, actor })`,
`dismissTerm({ termId, actor })`, `restoreTerm({ termId, actor })`,
`subscribeGlossary`, `getGlossaryState`.

Rules:

- Case-insensitive trim on `sourceTerm`; unique per series.
- `addManualTerm` on an existing auto term → flip `origin` to `manual`, keep the user's
  `targetTerm`, restore it if dismissed.
- `upsertAutoTerms` never overwrites a `manual` term and never revives a `dismissed` one.
- `activeGlossaryTerms` is what goes into the prompt.

### 4.3 `lib/series.ts` (modified)

- `Series.rateAmount: number` — default `0`, `0 ≤ n ≤ 9999.99`, 2 decimals max.
- `CreateSeriesInput.rateAmount?: number`.
- `UpdateSeriesInput` + `updateSeries(input)` — same Owner/Manager guard, same validation
  pipeline as `createSeries`, diffing nothing (whole record replace of editable fields).
- `SeriesError` gains `invalid-rate`.
- Cover validation, assignment logic, and `removeMemberAssignments` stay untouched.

### 4.4 `lib/earnings.ts` (rewritten)

Same file, same idea, real math. Every function derives from chapters; nothing is stored.

```ts
totalEarningsThisMonth(username: string): number
approvedChaptersThisMonth(username?: string): number
groupEarningsThisMonth(groupId: string): number
memberEarningsThisMonth(groupId: string, username: string): number
```

Rule for all four: iterate `state.chapters` where `status === "approved"` and
`approvedAt` falls in the current calendar month; sum `rateSnapshot ?? 0`; the member
variants additionally require `submittedBy === normalizeUsername(username)`; the group
variants additionally require `groupId`. Cross-import `lib/chapters.ts` for state.
`lib/chapters.ts` must not import `lib/earnings.ts` (cycle).

Add to `lib/format.ts`:

```ts
formatMoney(amount: number, currency: string): string; // Intl.NumberFormat en-US, 2 decimals
formatRelativeTime(iso: string): string;               // "Just now" | "N min ago" | "N hr ago" | "N d ago" | formatShortDate
```

Store the rate at 2 decimals via `Math.round(n * 100) / 100` on write, so floating point
never leaks into money display.

---

## 5. Pipeline

### 5.1 Files

```
lib/ai/gemini.ts          server-only provider implementation
lib/ai/prompts.ts         the three prompt builders + response schemas
lib/ai/types.ts           OCRProvider / Translator protocol shapes
lib/ai/batch.ts           splitIntoBatches() — the ≤10 rule, pure and unit-checkable
lib/pipeline.ts           client orchestrator (three-stage run)
lib/panel-image.ts        browser compression to WebP
lib/panel-store.ts        IndexedDB adapter

app/api/pipeline/extract/route.ts
app/api/pipeline/translate/route.ts
app/api/pipeline/proofread/route.ts
```

### 5.2 Provider

`lib/ai/gemini.ts`:

```ts
const GEMINI_MODEL = "gemini-3.5-flash-lite";      // primary — free, 500 RPD, 15 RPM, 250K TPM
const GEMINI_FALLBACK_MODEL = "gemini-3.8-flash";  // only on 404 model-not-found
const PANEL_BATCH_MAX = 10;                        // hard cap of panels per extract request
const BATCH_MAX_BYTES = 3_000_000;                 // safety valve on encoded request size
const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";
```

**Why Lite, not Flash.** Both are free (verified 2026-10-21 in AI Studio on the user's own
project). `gemini-3.8-flash` gets **20 requests/day** — a single 40-panel chapter costs ~6
requests even when perfectly batched, so it allows about three chapters a day and dies on a
busy day. `gemini-3.5-flash-lite` gets **500/day at 15 RPM**, which makes an unbatchable
worst case (~120 requests) still survivable and the batched case effectively unlimited.

The cost of that choice is vision quality: Lite reads stylized lettering less reliably than
flagship Flash. **Do not scatter model ids** — both constants live here, so the whole app
moves by editing one line. If extraction proves poor in §15 step 20, the correct response is
`PANEL_BATCH_MAX = 5` at 2000 px (§5.5), and only then swapping `GEMINI_MODEL`. **Never use
`gemini-2.5-*`** (restricted to accounts that already used it) **or `gemini-2.0-flash`**
(shut down); both appeared in an earlier draft of this spec and were wrong.

- Key read from `process.env.GEMINI_API_KEY` inside the route, never at module scope on the
  client. Missing key → typed `missing-key` error, HTTP 503, copy:
  `The translation service isn't configured. Add GEMINI_API_KEY to .env.local.`
- Request bodies are `multipart/form-data` (`await req.formData()`), responses are JSON.
  The extract route reads one `meta` JSON part plus one `panel-{n}` blob part per panel;
  translate and proofread are plain JSON because they carry no images.
- Every call sets `generationConfig.responseMimeType = "application/json"` plus an explicit
  `responseSchema`, so nothing parses loose prose.
- Image input: one `parts` entry per panel, `{ inline_data: { mime_type, data } }`, each
  followed by its `panelId` as a short text part so the model can key its output. The prompt
  itself is the final text part.
- `temperature`: extract `0`, translate `0.3`, proofread `0.4`.
- Size valve: before sending, if the encoded multipart body exceeds `BATCH_MAX_BYTES`, split
  the batch in half recursively and send twice. A 10-panel batch of denser scans then still
  completes instead of failing on a body limit.
- Truncation valve: if a text-stage response fails to parse and the chapter has more than 20
  panels, halve the panel list and retry each half once. Only then report `bad-response`.
- 429 → exponential backoff (1s, 2s, 4s), max 3 attempts, then `quota` for that batch. 5xx /
  timeout → 1 retry, then `network` (route timeout 60s). Unparseable JSON → `bad-response`.
- `.env.local` gets `GEMINI_API_KEY=`. `.env.example` documents it. Both are gitignored
  except the example, which contains no secret.
- `MOCK_PIPELINE=1` in `.env.local` short-circuits all three routes with deterministic fake
  bubbles, boxes and terms, no network call. **This is a hard requirement, not a nicety** —
  at 500 requests/day, building and testing the workspace UI against the real API burns the
  day's quota before a single real chapter is attempted.

### 5.3 Routes

All `POST`, all `runtime = "nodejs"`, all `dynamic = "force-dynamic"`.

**`/api/pipeline/extract`** — 1 to 10 panels per call.

```ts
// request: multipart/form-data
//   part "meta"  → JSON string, shape below
//   part "panel-0" … "panel-9" → image/webp blobs, one per panel
{ panels: Array<{ panelId: string; index: number }>;   // upload order
  language: "ko" | "ja" | "zh";
  readingDirection: "ttb" | "rtl" | "ltr"; }

// response: JSON
{ panels: Array<{
    panelId: string;
    blocks: Array<{
      index: number;
      sourceText: string;
      bbox: { x: number; y: number; w: number; h: number } | null;
      confidence: number | null;
    }>;
  }> }
```

Prompt intent: "You are given N comic panels in order. For **each** panel, return every
speech bubble, thought bubble, caption box and narration line in reading order, under that
panel's `panelId`. Preserve the original characters exactly, including honorifics. Do not
translate. Do not describe artwork. Never merge bubbles across panels, and never renumber a
panel. Skip sound effects baked into the art unless they carry dialogue." Reading order:
top→bottom; within a row, left→right for `ttb`/`ltr`, right→left for `rtl`. `bbox` is
normalized 0..1 **within its own panel**, `null` when the model is unsure.

**`/api/pipeline/translate`** — the whole chapter, one call.

```ts
// in
{ panels: Array<{ panelId: string;
                  blocks: Array<{ index: number; sourceText: string }> }>;
  language: "ko" | "ja" | "zh";
  context: { seriesTitle: string; synopsis: string | null; chapterNumber: number; }; }
// out
{ translations: Array<{ panelId: string; index: number; baseTranslation: string }> }
```

Prompt intent: literal, faithful base translation into English, with the whole chapter
visible at once so pronouns, forms of address and callbacks stay consistent across panels.
Preserve sentence breaks and honorific intent. No added content, no censorship, no
localization yet. One entry per input block, keyed by `panelId` + `index`.

**`/api/pipeline/proofread`** — the whole chapter, one call.

```ts
// in
{ panels: Array<{ panelId: string;
                  blocks: Array<{ index: number; sourceText: string;
                                  baseTranslation: string }> }>;
  glossary: Array<{ sourceTerm: string; targetTerm: string; category: string }>;
  context: { seriesTitle: string; synopsis: string | null; chapterNumber: number; }; }
// out
{ results: Array<{ panelId: string; index: number; finalText: string }>;
  terms: Array<{ sourceTerm: string; targetTerm: string; category: string }>; }
```

Prompt intent: natural English in comic register, consistent voice across the chapter,
enforce every glossary `targetTerm` exactly where its `sourceTerm` appears, preserve speaker
intent and tone, no added content. Then separately return any **new** recurring proper nouns
the chapter introduced (character names, places, honorifics, items, terms) with a proposed
English target and category — **excluding anything already in the glossary**, and
**deduplicated across panels** (this is why the pass is chapter-wide: one `terms` array, not
forty overlapping ones). `terms` may be empty.

### 5.4 Client orchestrator `lib/pipeline.ts`

```ts
export type RunStage = "extract" | "translate" | "proofread" | "done";

// Alias of PanelPipelineState["status"] from §4.1 — one union, defined there, never duplicated.
export type PanelRunState = PanelPipelineState["status"];

export type RunState = {
  running: boolean;
  stage: RunStage;
  totalPanels: number;
  extracted: number;      // drives "Reading panels n / total"
  batchIndex: number;     // 1-based, for the stage strip
  batchCount: number;
  panels: Record<string, PanelRunState>;
  error: { code: string; message: string } | null;
};

startRun(chapterId: string, actor: string): Promise<void>
retryFailed(chapterId: string, actor: string): Promise<void>
cancelRun(): void
subscribeRun(listener: () => void): () => void
getRunState(): RunState
```

Run sequence:

1. `setChapterStatus(processing)` if currently `draft`.
2. `const batches = splitIntoBatches(panels, PANEL_BATCH_MAX)` — the rule from §1.1, in
   `lib/ai/batch.ts`.
3. For each batch, sequentially: mark its panels `extracting`, POST `extract` as multipart,
   then `setPanelBlocks` for every returned panel and mark them `extracted`. **Blocks are
   written per batch as they land**, so text appears progressively instead of all at the end.
   A failed batch marks only its own panels `failed` with the error code; the loop continues.
4. If no panel reached `extracted`, stop — the chapter stays `processing` and the stage strip
   shows the failure count.
5. `translate` once, with every `extracted` panel's blocks in upload order. Write
   `baseTranslation` to each block. Failure sets `error` and leaves the stage at `translate`
   so `Retry` re-runs only the text stages — panels keep their extracted source text.
6. `proofread` once, with all blocks plus `activeGlossaryTerms(seriesId)`. Write `finalText`,
   call `upsertAutoTerms(chapterId, terms)` **once**, mark panels `done`.
7. If no panel is `failed` and both text stages succeeded, `setChapterStatus(ready)`.
   Otherwise the chapter stays `processing` with `{n} panels failed` surfaced.

`retryFailed` re-runs `extract` only for panels in `failed` state, then re-runs steps 5–6 for
the whole chapter. `cancelRun` stops after the in-flight request and does not advance status,
so a mid-run cancel leaves completed batches intact.

A run is client-driven, so closing the tab stops it. Documented limitation; extracted text
and any completed text stage keep their content.

### 5.5 Panel compression `lib/panel-image.ts`

Mirrors `lib/series-cover.ts` in style, different target — **tuned for ten panels per
request, not one**:

- Accept `image/*`; reject over 10 MB with `That image is too large. Pick one under 10 MB.`
- Decode (`createImageBitmap`, `Image` + object URL fallback).
- Downscale so the longest edge ≤ **1600 px** (panels are tall; a width cap alone is wrong).
- Export `image/webp` quality **`0.75`**; if the result exceeds **400 KB**, retry once at
  `0.62`.
- Still over 400 KB → reject with `That panel is still too large after compression.`
- Return `{ blob, width, height, byteSize }`.
- Marked comment: swap for a Supabase Storage upload later; consumers only see blobs.

**The trade-off, stated plainly.** Ten panels at 1600 px / 400 KB is ~4 MB, which fits a
4.5 MB function body once sent as multipart. Ten panels at the old 2000 px / 0.82 would be
~10 MB and simply would not send. Resolution is what OCR quality is bought with, so if Lite
misreads small lettering in §15 step 20, the fix is `PANEL_BATCH_MAX = 5` **and** longest edge
2000 px — halving the batch buys back the resolution. Change both together, never one.

---

## 6. Permissions

| Action | Owner | Manager | Staff |
|---|:--:|:--:|:--:|
| Create chapter | ✅ any series | ✅ any series | ✅ assigned series |
| Upload panels | ✅ | ✅ | assigned series |
| Run / retry pipeline | ✅ | ✅ | assigned series |
| Edit block text | ✅ | ✅ | assigned series |
| Delete chapter | ✅ | ✅ | ❌ |
| Submit | ✅ | ✅ | assigned series |
| Approve / reject / reopen | ✅ | ✅ | ❌ |
| Edit series + rate | ✅ | ✅ | ❌ |
| Add / edit / dismiss glossary terms | ✅ | ✅ | assigned series |
| View chapter / workspace | ✅ | ✅ | assigned series |

Enforced in `lib/chapters.ts`, `lib/glossary.ts`, and `lib/series.ts`. Hiding a control is
never the boundary. Platform admin (`noddy`) gets no group content access unless a member.

**Decorate, don't fork:** `canManageSeries(role)` already exists and covers
create/edit/delete/approve. Add `canEditChapter(role)` = Owner/Manager or assigned Staff.

---

## 7. Routes and navigation

| Route | Purpose |
|---|---|
| `/series/[id]` | Existing page. Chapters panel becomes real, `New chapter` added, `Edit` added. |
| `/chapters/[id]/workspace` | The workspace. |

No `/chapters/[id]` overview page in this build — creating a chapter goes straight to the
workspace, and the rail is the way between chapters.

Breadcrumbs (existing `trail` prop):

- Workspace → `Workspace / Groups / {group} / {series} / Chapter {number}` with each
  segment linked except the last.
- Rail active key stays `groups` (series live under Groups).

Every page: `metadata` with `title` and `robots: { index: false, follow: false }`.
`app/chapters/[id]/workspace/page.tsx` awaits `params`.

Access rules:

- Not signed in → `/login`.
- Chapter missing → centred `Chapter not found` panel, back to `/groups`.
- Viewer not in the chapter's group → `not found or no access`.
- Staff not assigned to the series → `You don't have access to this chapter.`
- Owner/Manager of the group → always allowed.

---

## 8. Workspace layout

Route `/chapters/[id]/workspace`. Shell root:

```html
<div class="dash-shell ws-shell" data-workspace="true">
  <DashboardRail … collapsed />
  <div class="dash-body">
    <DashboardTopbar … />
    <main class="dash-main" id="main">
      <div class="ws-grid">
        <aside class="ws-rail">…</aside>
        <section class="ws-center">…</section>
        <aside class="ws-viewer">…</aside>
      </div>
    </main>
  </div>
</div>
```

### 8.1 Collapsed main rail

- `ws-shell { --dash-rail: 4.5rem; }` — this is the existing mechanism, since
  `.dash-body { margin-left: var(--dash-rail) }` at ≥1024px. Do not fork the shell.
- `DashboardRail` gains `collapsed?: boolean`. When true:
  - `.dash-nav-text`, `.dash-rail-label`, `.dash-user-meta` are visually hidden (keep the
    markup for screen readers — `.sr-only` pattern, not `display:none` on the link text
    alone).
  - Links become centred 2.25rem squares with `title={link.label}` and
    `aria-label={link.label}`; active state keeps the existing accent treatment.
  - The logo shrinks to the monogram; the sign-out button stays, icon-only.
  - No collapse toggle. The rail is collapsed **only** on the chapter workspace, and every
    other page keeps today's 17rem rail.
- Under 1024px the rail stays the existing off-canvas drawer (unchanged behaviour); the
  `collapsed` prop only affects ≥1024px.

### 8.2 Workspace grid

```css
.ws-grid {
  display: grid;
  grid-template-columns: 16rem minmax(0, 1fr) minmax(20rem, 38%);
  height: calc(100dvh - var(--dash-topbar));
  min-height: 0;
}
```

- Chapter rail `16rem`, viewer `minmax(20rem, 38%)`, centre flexible.
- Column dividers are 1px `var(--border)`, not shadows.
- Each column scrolls independently (`min-height: 0; overflow-y: auto`).
- ≤1280px: rail `14rem`, viewer `minmax(18rem, 34%)`.
- ≤1023px: replace the whole grid with the existing mobile notice pattern —
  `Best viewed on desktop` + one line explaining the workspace needs a wide screen + a
  back link. Do not attempt a stacked workspace.

### 8.3 Left rail `ws-rail`

**Sticky tab bar** (always pinned, never scrolls away):

```
[ Chapters 12 ] [ Glossary 8 ]
```

- Buttons, not links. `role="tablist"`, `role="tab"`, `aria-selected`, arrow-key nav.
- Count chip on each tab: chapter count for the series; **active** glossary term count.
- Underline or soft pill for the active tab, tokens only.
- Below it, a scroll region holding the active tab's content.

**Chapters tab** — Discord-style list:

```
Chapter 1        ●
Chapter 2        ●
Chapter 3        ●
```

- One row per chapter, ascending by `number`.
- Label: `Chapter {number}`, plus `· {title}` in muted type when a title exists.
- Status dot on the right: 8px circle, `--status-dot` primitive.
  - `approved` → mint/green
  - `rejected` → danger/red
  - `draft`, `ready` → muted grey
  - `processing`, `submitted` → amber; `processing` pulses (respect reduced motion)
- Current chapter: `aria-current="page"`, filled surface, accent left bar.
- Owner/Manager: hovering a row reveals a 1.5rem trash button in the row's right gutter.
  It must be reachable by keyboard focus too (`:focus-visible`), with
  `aria-label="Delete Chapter 3"`. Click opens the delete confirm dialog (§10.2).
- Hover/focus transitions 120 ms.
- Empty state (series with no chapters): not reachable — you are always in a chapter here.
- Footer of the rail: `Preview build — chapters and translations stay in this browser.`

**Glossary tab**:

```
[+ Add term]
Name            Auto    지훈 → Jihun
Place           Manual  서울 → Seoul
Honorific       Auto    -님 → -nim
```

- Header row: `Add term` button (`btn btn-ghost btn-sm` + `Plus`) opening the add form.
- Each term row: `sourceTerm → targetTerm`, a category chip, and an **`Auto` / `Manual`**
  provenance chip (Auto = muted, Manual = accent). This distinction is required.
- Owner/Manager and assigned Staff can edit the target inline (click → input → Enter/blur
  saves, Escape cancels).
- Dismiss action (`X`) on auto terms, with an undo toast affording `Undo` for 5 s. Dismissed
  terms disappear from the list and from prompts.
- Filter chips above the list: `All` · `Auto` · `Manual`, default `All`.
- Add form (inline panel, not a modal): source term, target term, category select
  (Character / Place / Honorific / Item / Term), `Save` / `Cancel`. Validation: both fields
  required, ≤ 60 chars, duplicate source shows
  `That term is already in the glossary — edit it instead.`
- Empty state: `No glossary terms yet. Run the translation tool and they'll appear here, or
  add one by hand.`
- Read-only for users without edit rights: rows render, no add/edit/dismiss.

### 8.4 Centre column `ws-center`

Vertical order:

1. **Chapter header bar** (sticky at the top of the column, 1px bottom border):
   - `Chapter {number}` as an editable inline number input for Owner/Manager/assigned Staff
     (commit on Enter/blur; duplicate number shows the store message inline).
   - Optional title input next to it (muted, placeholder `Untitled chapter`).
   - Status chip (`.chip` + tone per status, `Approved` / `Rejected` / `Draft` / `Processing` /
     `Ready` / `Submitted`).
   - Right side: lifecycle actions — `Submit` (staff/manager/owner when `ready` or
     `rejected`), `Approve` + `Reject` (Owner/Manager when `submitted`), `Reopen` (Owner/
     Manager when `approved`). Actions are disabled with a reason tooltip when invalid.
2. **Panel heading**: `Panel {n} of {total}`, and on the right a small step indicator while
   running (`Extracting…` / `Translating…` / `Proofreading…`).
3. **Bubble list** for the current panel only.
4. **Empty / failure states** (§9).

**Bubble row** (the core editing surface):

```
 1  ┌───────────────────────────────────────────────┐
    │ It's been three years since the gate opened.  │  ← editable English, first
    │ 문이 열린 지 삼 년이 지났어                        │  ← CJK source, muted, small
    └───────────────────────────────────────────────┘
```

- Order top→bottom by `block.index`.
- **English text is rendered first and is the editable element; the original CJK source
  sits below it in muted, smaller type.** This ordering is deliberate and was specified.
- The English field is a `contentEditable`-free, borderless, auto-growing `<textarea>`
  (rows auto-sized to content, no inner scrollbar). It reads as text until focused, then
  gets a focus ring.
- Saves on blur and on `Cmd/Ctrl + Enter`. Enter inserts a newline. `Escape` reverts to the
  last saved value. A transient `Saved` indicator (1.5 s) confirms the write.
- An edited block gets `isEdited = true`, `editedBy`, `editedAt`, and a small `Edited` chip.
- A block whose `finalText` is empty shows a placeholder
  `Type the English for this bubble…`.
- **Separation:** bubbles are separated by a vertical gap (`1.25rem`) plus a **thin 1px
  divider line that does not touch the column edges** — inset by `1rem` on both sides, i.e.
  `margin-inline: 1rem`. This is the specified "thin line with unconnected margins".
- Bubble index badge (`1`, `2`, `3…`) sits to the left of the field in muted tabular type.
- Low-confidence blocks (`confidence != null && < 0.5`) get a subtle amber left edge and a
  tooltip `Low OCR confidence — check against the raw panel.`
- **Hovering or focusing a bubble row outlines its `bbox` on the raw panel in the right
  column** (§8.5). This is the two-way link between text and art; it is why the extract pass
  returns boxes at all.

**Panel navigation**: discrete arrow buttons flanking the bubble column — one vertically
centred on the left edge, one on the right edge of `ws-center`, each a 2.25rem circular
`btn-ghost` with `ArrowLeft` / `ArrowRight`, `aria-label="Previous panel"` /
`"Next panel"`, disabled at the ends. They move exactly one panel; no wrap. Keyboard:
`[` and `]` as accelerators, documented in the button `title`.

Scrolling resets to the top of the bubble list when the panel changes.

### 8.5 Right viewer `ws-viewer`

- Header row: `Raw panel` eyebrow + `Panel {n} of {total}`, and on the **far right the
  `Run translation` button** (`btn btn-primary btn-sm`, `Wand` icon). While running it
  becomes `Translating… {done}/{total}` and is disabled; `Cancel` appears beside it.
- Below: the panel image, `object-fit: contain`, full width of the column, on a subtly
  tinted surface, with 1px border and 12 px radius.
- While images load, a skeleton block of the same aspect ratio (no layout shift).
- Empty state (no panels uploaded): drop zone (§10.1) plus
  `Upload raw panels to start this chapter.`
- Failure state (image purged or unreadable): `This panel image isn't available. Re-upload
  it to continue.`
- Under the image: `Panel {n}` with a click-to-zoom action opening a full-screen lightbox
  (`Escape` closes, arrows move panels). Zoom is a nicety; the lightbox must not block the
  run button.
- **Bubble boxes.** Every block with a `bbox` draws a 2 px rounded outline over the image,
  positioned with percentages from the normalized `{x, y, w, h}` so it scales with the
  rendered image size (`position: absolute` inside a wrapper that is exactly the image box —
  never the padded column).
  - Resting state: invisible (or at 12 % opacity for `.5 s` after a run completes, fading out).
  - Hover/focus a bubble row → its box goes to full accent opacity and **every other box
    dims**, so the eye lands on one bubble.
  - Click a bubble row → pins the box until you click elsewhere. `Escape` clears the pin.
  - A `Show boxes` toggle in the viewer header shows all boxes at once, persisted per user in
    localStorage (`hwaflow.workspace.prefs.v1`) — useful when checking reading order.
  - Boxes are decorative and non-interactive (`pointer-events: none`), so they never block a
    click on the image, and are `aria-hidden`.
  - When `bbox` is `null` the row simply has no box — no placeholder, no error.
- A thin **stage strip** under the image while running: `Reading panels 12 / 40 · batch 2 of
  4`, then `Translating chapter`, then `Proofreading chapter`, with a determinate bar. The
  viewer itself only ever shows the panel you're on — it never turns into a per-panel queue.
  On failure the strip turns red with one `Retry` for the failed group.

### 8.6 Top bar

Existing `DashboardTopbar` with the breadcrumb trail from §7. The notification bell stays
as built. No new top-bar controls — all chapter actions live inside the workspace columns.

---

## 9. States

| State | Where | Copy / behaviour |
|---|---|---|
| Loading | Whole page | Existing `dash-loading` spinner; show until auth + groups + series + chapters are ready |
| Not found | Whole page | `Chapter not found` + `This link may be stale…` + back to `/groups` |
| No access | Whole page | `You don't have access to this chapter.` + back link |
| No panels | Viewer + centre | Drop zone in the viewer; centre shows `Upload raw panels to start this chapter.` |
| Panels, never run | Centre | `No text yet. Hit Run translation above the raw panel.` |
| Running — extract | Centre + viewer | Stage strip `Reading panels {n} / {total}`, batch counter `{i} of {b}`, `Run translation` disabled |
| Running — text | Centre + viewer | Strip advances to `Translating chapter`, then `Proofreading chapter`; button stays disabled |
| Panel failed | Centre + viewer | Red rows for the failed panels only, one `Retry` for the group, other batches and all extracted text untouched |
| Missing key | Both | The exact `missing-key` copy from §5.4, plus a one-line hint that `.env.local` needs `GEMINI_API_KEY` |
| Chapter rejected | Header | Red chip, `Rejected` note shown under the header when present, `Submit` re-enabled |
| Mobile | Whole page | `Best viewed on desktop` notice, back link |
| Storage full | Top of centre | `This browser is out of storage. Delete a chapter or clear old panels.` |

---

## 10. Dialogs and actions

All dialogs use `useDialogA11y` (Tab trap, Escape, body-scroll lock, focus restore) and a
dimmed backdrop. Centred modal, not a side drawer.

### 10.1 Upload

- `ws-viewer` empty state is a drop zone: dashed border, `UploadCloud` icon,
  `Drop raw panels here` + `or choose files` button.
- Accepts `image/*`, multiple. Files process in the browser one at a time through
  `lib/panel-image.ts`, appending panels in selection order.
- While compressing: `Preparing panel {n} of {m}…` and the drop zone disabled.
- Each rejection (too large / unreadable) is reported inline with the file name and a
  `Retry` affordance, without discarding the panels already added.
- Also reachable from a `+ Add panels` button in the viewer header once panels exist.
- Uploading never starts the pipeline.

### 10.2 Delete chapter confirm

Centred dialog, title `Delete Chapter {number}?`, body
`This removes its panels and everything you've translated. It can't be undone.`
Buttons: `Cancel` (default focus) and `Delete chapter` (`btn` + danger tone).
On confirm: `deleteChapter`, delete images, route to the next chapter by number, or to the
series page if none remain. Success toast `Chapter {n} was deleted.` (reuse the
`grp-notice` pattern with `ch-` scoping if needed).

Triggered from the series chapter list or the chapter rail, hover/focus only, Owner/Manager
only.

### 10.3 Edit series dialog

Opened from the series page (`Edit` button, Owner/Manager only). Fields in order: title,
cover (reuse `SeriesCoverField`), genre (`<datalist>` suggestions as today), description,
release day (Mon–Sun segmented control), **rate** (number input prefixed with the group
currency symbol, step `0.01`, min `0`, max `9999.99`). Footer `Cancel` / `Save changes`.
On save `updateSeries`, success toast `Series updated.`, page reflects the new values.

The same rate field is added to the create-series dialog, positioned after release day.

### 10.4 Reject

Small dialog: `Reject Chapter {number}?` + optional textarea
`Why is this going back? (optional)` (≤ 300 chars) + `Cancel` / `Reject chapter`. Saves
into `rejectionNote` and shows it under the workspace header for the submitter.

---

## 11. Series page changes

`components/series/series-view.tsx`:

- Header actions (Owner/Manager): `Edit` button next to the existing content, opening §10.3.
- Chapters panel replaces the `Coming soon` placeholder:
  - Header right: count chip + `New chapter` (`btn btn-primary btn-sm`, `Plus`).
  - `New chapter` → `createChapter({ seriesId, actor })` → `router.push('/chapters/{id}/workspace')`.
    No dialog, no confirm. On store error, show the message as a toast and stay put.
  - List rows: `Chapter {number}`, optional title, status dot + chip, submitter, relative
    date. Whole row links to the workspace.
  - Hover/focus row action for Owner/Manager: trash → §10.2.
  - Empty state: `No chapters yet` + `Create the first chapter to start translating.` +
    `New chapter` button (Owner/Manager) / `A Manager or Owner will create the first
    chapter.` (Staff).
  - Staff see only chapters of series they are assigned to — already guaranteed by the
    series-level access gate.
  - Keep the existing honest-zero discipline: no invented counts.
- At-a-glance panel gains a `Rate` row (`formatMoney(series.rateAmount, group.currency)` +
  `per approved chapter`).

---

## 12. Earnings and dashboard wiring

- `lib/earnings.ts` real (see §4.4).
- `components/dashboard/dashboard-home.tsx`: money panel uses
  `totalEarningsThisMonth(user.username)`; keep the existing zero-state copy
  (`No approved chapters yet. Credit appears here when a Manager approves work.`) and only
  show the trend chip / sparkline when the value is non-zero. Hero line uses
  `approvedChaptersThisMonth(user.username)`.
- Group detail stats already call `groupEarningsThisMonth` / `memberEarningsThisMonth` —
  they become truthful with no UI change. Same for the admin group chapters count, which
  should now read `countChaptersForSeries` summed per group and drop the
  `Available with the chapter module` note.
- `/settings/members` member rows may additionally show approved-chapter counts via
  `countApprovedChaptersForMember` if a column is already free; otherwise leave as is. Do
  not restructure that page for this.

---

## 13. Files

### New

```
lib/chapters.ts
lib/use-chapters.ts
lib/glossary.ts
lib/use-glossary.ts
lib/pipeline.ts
lib/use-pipeline.ts
lib/panel-store.ts
lib/panel-image.ts
lib/ai/gemini.ts
lib/ai/prompts.ts
lib/ai/types.ts
lib/ai/batch.ts

app/chapters/layout.tsx
app/chapters/chapters.css
app/chapters/[id]/workspace/page.tsx

app/api/pipeline/extract/route.ts
app/api/pipeline/translate/route.ts
app/api/pipeline/proofread/route.ts

components/chapters/workspace-view.tsx
components/chapters/chapter-rail.tsx
components/chapters/glossary-panel.tsx
components/chapters/chapter-list.tsx          (series-page chapter list)
components/chapters/block-editor.tsx
components/chapters/bubble-row.tsx
components/chapters/panel-viewer.tsx
components/chapters/panel-dropzone.tsx
components/chapters/run-progress.tsx
components/chapters/chapter-status-dot.tsx
components/chapters/delete-chapter-dialog.tsx
components/chapters/reject-chapter-dialog.tsx
components/series/edit-series-dialog.tsx

.env.example
```

### Modified

```
lib/series.ts                              rateAmount, updateSeries, invalid-rate
lib/earnings.ts                            real derivation
lib/groups.ts                              drop the placeholder chapterCountFor stub
lib/format.ts                              formatMoney, formatRelativeTime
app/series/layout.tsx                      import the chapter stylesheet for the series page
components/dashboard/dashboard-rail.tsx    collapsed prop
components/dashboard/dashboard-home.tsx    real earnings
components/dashboard/dashboard-topbar.tsx  unchanged unless a breadcrumb segment needs a link
components/groups/create-series-dialog.tsx rate field
components/series/series-view.tsx          real chapters panel, Edit, New chapter
components/admin/group-detail.tsx          real chapter count
docs/ARCHITECTURE.md                       page inventory, decision log, pipeline section
```

Icons already present, no additions expected: `ScanText`, `Languages`, `Glossary`,
`UploadCloud`, `Wand`, `Stamp`, `Play`, `Trash`, `Clock`, `Plus`, `X`, `Check`,
`AlertCircle`, `ArrowLeft`, `ArrowRight`, `ChevronDown`, `Sparkles`, `Coins`, `Settings`.
Only add an icon if one is genuinely missing.

---

## 14. Edge cases

- Two users create a chapter in the same series simultaneously → both succeed if numbers
  differ; the second gets `That chapter number is already taken.` on duplicate.
- Chapter `number` edited to an existing number → inline error, no write.
- Deleting the last chapter → route to `/series/{seriesId}`.
- Deleting the currently open chapter from another tab → workspace shows the not-found panel
  on the next store event.
- Upload with zero files, or files that all fail compression → nothing added, inline error.
- Uploading while a run is in flight → allowed for a later run; the new panel is `idle` and
  is not part of the current run's `total`, and it is not added to any in-flight batch.
- More than 10 panels → split per §1.1. A failure in batch 2 never blocks batch 3, and
  batches already written keep their text.
- An encoded batch over `BATCH_MAX_BYTES` → halved and sent as two requests automatically,
  with no user-visible difference except a slightly longer stage.
- A chapter large enough to truncate a text-stage response (>20 panels) → the panel list is
  halved once and each half retried before `bad-response` is reported.
- `Retry` after a *text*-stage failure re-runs both text stages over the whole chapter,
  including panels that already had text — harmless, the passes are idempotent, and it keeps
  one voice across the chapter rather than patching a hole with a second pass.
- Run with no panels → button disabled, tooltip `Upload a panel first.`
- Run with a missing key → every panel fails with `missing-key`; the rest of the app works.
- Run interrupted by a tab close → completed panels keep text; chapter stays `processing`
  until a successful run marks it `ready`. A `Mark as ready` manual action is available to
  Owner/Manager/assigned Staff as an escape hatch.
- Rate is `0` → approval still works, money stays `$0.00`, no special-casing.
- Rate edited after approval → historical earnings unchanged (snapshot).
- Reopen an approved chapter → money disappears immediately from all surfaces.
- Submitter removed from the group later → their existing earnings remain visible to
  Owner/Manager; do not delete chapter records.
- Glossary term added mid-run → applies to the next run, not the current one.
- Duplicate auto term across panels → one row, `origin` unchanged.
- Manual term added for a dismissed auto term → restored as `manual`.
- Block text edited to empty → allowed, but a chapter with no non-empty blocks cannot be
  submitted (`no-content`).
- IndexedDB unavailable (private mode) → panels cannot be added; show
  `This browser is blocking local storage. Turn off private mode and try again.`
- Multiple tabs on the same chapter → store events update both; the pipeline run state is
  per-tab and does not fight (a second run on the same chapter is allowed but guarded by
  the `processing` status check).
- localStorage quota exceeded writing chapters → `ChapterError("storage")` with readable
  copy, never a silent failure.

---

## 15. Verification

No test runner exists. Verify with `npx tsc --noEmit`, `npm run build`, then:

1. Create a chapter from a series → lands on `/chapters/{id}/workspace` with `Chapter 1` and
   an empty viewer.
2. Upload 3 panels at once → they appear in order with thumbnails, no text, nothing running.
3. Click `Run translation` on 3 panels → **one** extract request covers all three (verify in
   the network tab that it is `multipart/form-data` with three `panel-*` parts), the strip
   reads `Reading panels 3 / 3`, then `Translating chapter`, then `Proofreading chapter`.
   All three panels get text after the extract request returns, not one by one.
4. Each bubble shows English first, CJK source muted underneath, and a thin inset divider
   between bubbles.
5. Edit an English line → blur → `Saved`, `Edited` chip, persists after refresh.
6. Arrows move exactly one panel and are disabled at the first and last panel.
7. Main rail is icon-only on the workspace only; icon-only links have accessible names and
   work by keyboard; `/dashboard` still shows the full 17rem rail.
8. Left rail: `Chapters | Glossary` tabs pinned while the list scrolls; chapter rows read
   `Chapter 1`, `Chapter 2`; dots match status.
9. Glossary tab lists auto-detected names/places/honorifics as `Auto`; add one by hand as
   `Manual`; run again → the new term is respected in the output.
10. Staff submits → amber dot; Owner approves → green dot and the submitter's dashboard money
    rises by exactly the series rate; reject with a note → red dot, note visible, chapter
    editable, resubmittable.
11. Change the series rate → already-approved earnings do not move.
12. Reopen an approved chapter → money drops back.
13. Delete a chapter from both the series list and the rail → hover trash, confirm dialog,
    gone everywhere, images cleaned from IndexedDB.
14. `Edit` on the series page changes rate/metadata; Staff never see the button and the store
    rejects a forged call.
15. Remove `GEMINI_API_KEY` → every panel fails with the config message; the rest of the app
    still works.
16. Widths 1440 / 1280 / 1024 / 768 / 390: three columns hold at 1440 and 1280, tighten at
    1024, and below that the desktop notice replaces the grid with no horizontal overflow.
17. Keyboard-only pass: collapsed rail, rail tabs, chapter rows, delete confirm, panel arrows
    (`[` / `]`), bubble fields, glossary add, submit/approve/reject/reopen.
18. Cross-tab: edit a bubble in tab A, see it in tab B without a refresh.
19. Batching, all with `MOCK_PIPELINE=1` so no quota is spent: 7 panels → one batch of 7;
    11 → `6 + 5`; 25 → `9 + 8 + 8`; 40 → `10 + 10 + 10 + 10`; 41 → `9 + 8 + 8 + 8 + 8`.
    The strip's batch counter matches, and `Reading panels` climbs in batch-sized steps.
20. Real run against the API on a single 10-panel chapter — the one step that actually tests
    Lite's vision. Confirm no 400 on the multipart body, no 413, and that returned
    `panelId`s match the panels sent. If bubbles come back missing or garbled, apply the
    §5.5 remedy (`PANEL_BATCH_MAX = 5`, 2000 px) before considering a model swap.

---

## 16. Deferred — do not build

- `/approvals` queue page (inventory page 17).
- Dashboard weekly calendar wiring to real release days.
- Standalone `term_suggestions` review surface (the proofread return is sufficient).
- Export (TXT / JSON / CSV / DOCX).
- Chapter revisions as separate records after approval.
- Supabase schema, RLS migration, Storage buckets.
- `/series` index page, series archive/delete UI.
- Per-series tone/style note fed to the prompt.
- **`Re-read panel` on flagship `gemini-3.8-flash`.** Its 20 RPD goes unused under Lite and
  would make a good on-demand touch-up for a panel Lite read badly — one panel at a time,
  ~3 requests/day of headroom. Deferred until §15 step 20 shows whether Lite needs the help.
- **A second free text provider (Groq, ~1,000 RPD).** Would let translate + proofread run off
  Gemini's quota entirely. Scoped and costed, then dropped: Lite's 500 RPD already covers the
  batched shape with room to spare, so a second signup buys nothing today. The `Translator`
  interface keeps the door open.
- Bubble reordering by drag.
- Panel reordering after upload.
- Sound-effect / narration-block differentiation beyond what extract returns.
- Redrawing, typesetting, inpainting (out of product scope entirely).

---

## 17. Assumptions to verify during implementation

1. `gemini-3.5-flash-lite` accepts image input — **assumed, not yet proven.** Its free-tier
   numbers are measured fact (500 RPD, 15 RPM, 250K TPM, 2026-10-21 in AI Studio), and it is
   listed as a multimodal model, but the first real call is the only proof. If it rejects
   images, swap `GEMINI_MODEL` to `gemini-3.8-flash` and drop `PANEL_BATCH_MAX` to 6 — that
   is the 20 RPD budget, so ~3 chapters/day until the quota question is revisited. Never
   scatter model ids; both constants live in `lib/ai/gemini.ts`.
2. Vision quality at 1600 px / q0.75 is adequate for stylized CJK lettering. This is the one
   assumption that could genuinely hurt, because a misread character propagates silently
   through translate and proofread and lands in front of the reviewer as nonsense. §15 step
   20 is the test; the remedy is halving the batch and raising resolution, not lowering
   quality expectations.
3. Next 16 route handlers accept a ~4 MB `multipart/form-data` body with ten blobs. The
   old JSON-data-URL plan was abandoned precisely because base64 would have pushed this past
   common 4.5 MB function limits. **Resolved 2026-10-22:** the 1 MB `bodySizeLimit` applies
   to *Server Actions*, not to route handlers — `serverActions.md` states it explicitly and
   `route.md` documents no body cap for `request.formData()`. The `BATCH_MAX_BYTES` valve
   stays anyway, as a guard against provider-side limits rather than framework ones.
4. A single text-stage request covering 40 panels does not truncate its JSON schema
   response. If it does, the halving valve handles >20-panel chapters; below that, `terms`
   extraction is the likely casualty, so check that array is non-empty on a real chapter.
5. Quotas are per **project**, not per API key — creating more keys in the same project gains
   nothing, and spreading work across multiple projects is circumvention that Google's
   abuse policy can answer with throttling or suspension. Batching is the answer; key
   multiplication is not. Do not build any key-rotation logic.
6. IndexedDB round-trips a `Blob` unchanged in all target browsers; if a browser needs
   `ArrayBuffer`, convert at the adapter boundary so callers never care.
7. `useDialogA11y` handles a second dialog opened from within a page that already has one;
   if not, give the delete/reject dialogs their own focus restore target.

### Run locally without a key

`MOCK_PIPELINE=1` in `.env.local` short-circuits all three pipeline routes with
deterministic fake bubbles, boxes and terms — no network call, no quota spent. This is
how the workspace was built and how §15 steps 19–20 are checked without an API key.
`.env.example` is the committed template; `.env.local` is gitignored.