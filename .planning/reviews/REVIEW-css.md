---
status: issues_found
reviewed: 2026-10-24
scope: uncommitted working-tree restyle (neo-brutalist token rewrite + new landing/motion sheets)
files_reviewed: 10
files_reviewed_list:
  - app/globals.css
  - app/motion.css
  - app/landing.css
  - app/(auth)/auth.css
  - app/admin/admin.css
  - app/chapters/chapters.css
  - app/dashboard/dashboard.css
  - app/groups/groups.css
  - app/series/series.css
  - app/settings/settings.css
findings:
  critical: 2
  warning: 7
  info: 7
  total: 16
---

# CSS Review — pastel/ink restyle (working tree)

**Reviewed:** 2026-10-24
**Depth:** deep (cross-file cascade, token resolution, JSX cross-reference)
**Files reviewed:** 10 stylesheets (`app/globals.css`, `app/motion.css`, `app/landing.css`, and the seven route sheets)
**Status:** issues found

## Summary

The restyle is structurally sound: tokens resolve, no `@keyframes` are missing or duplicated across bundles, `prefers-reduced-motion` in `globals.css:970-989` still neutralises the new motion layer, and the SVG underline trick works because `components/hero.tsx:35` sets `pathLength="100"`.

What does not hold up is the **theme flip**. The rewrite made `--text`, `--bg`, `--surface*` and `--edge` invert between themes while `--ink`, `--paper*` and every pastel stay fixed. Every rule that mixes a fixed primitive with a flipping surface — or a fixed pastel text colour with a flipping background — is now broken in one of the two themes. The document itself states the intended contract (`docs/ARCHITECTURE.md:450-453`, `:495-497`): *pastels are fills, never text colours; text on a pastel is ink; all text pairs meet WCAG AA.* The CSS violates that contract in several places, and the worst case makes a headline word **1.25:1 in dark mode** — effectively invisible.

Contrast numbers below were computed from the actual `oklch()` values in `globals.css` (converted to sRGB, WCAG relative luminance), not estimated. Token resolution was done against both `:root` and `:root[data-theme="dark"]`.

---

## Critical

### CR-01: `.run-band .display-serif` is near-invisible in dark mode (1.25:1)

**File:** `app/landing.css:1754-1757` (band background at `:1735-1740`, token pair at `app/globals.css:27,56,109`)

```css
.run-band { background: var(--text); color: var(--bg); }   /* flips */
.run-band .display-serif { color: var(--peach); text-decoration-color: var(--bg); }
```

**What is wrong.** `--peach` is a fixed light apricot (`oklch(0.885 0.075 59.4)` → `#ffcea8`) in **both** themes, but `.run-band`'s background is `var(--text)`, which flips. In the dark theme the band becomes cream (`#f3efe3`) and the emphasised word renders peach-on-cream: **1.25:1**. In light mode the same rule is 13.07:1, so the bug is invisible unless you test dark mode.

This is the only `color: var(--<pastel>)` on a theme-flipping background in the codebase (verified by full-tree grep), so it is a one-off, not a pattern.

**Why it matters.** `components/pipeline.tsx:33` renders the word "release" inside this span, in the section headline `One run, from folder to release.` The word disappears; only the `--bg` underline remains. It also directly contradicts `docs/ARCHITECTURE.md:451` ("pastels are always fills, never text colours") and `:495` ("all text pairs meet WCAG AA").

**Fix.** Use the band's own contrast pair, which flips with the band, and keep the apricot as decoration only:

```css
.run-band .display-serif {
  color: var(--bg);                    /* paper in light, near-black in dark: 16.9:1 / 17:1 */
  text-decoration-color: var(--peach); /* apricot rule on both */
}
```

### CR-02: `.proof-ledger-row.is-new` uses primitive `--ink` on a theme-flipping background (1.73:1 in dark)

**File:** `app/landing.css:1609-1618`

```css
.proof-ledger-row.is-new {
  background: color-mix(in oklab, var(--peach) 24%, var(--surface));
  color: var(--ink);
}
.proof-ledger-row.is-new .proof-ledger-type { color: var(--ink); }
```

**What is wrong.** The background is `24% peach + 76% var(--surface)`. `--surface` flips (light `#fffdf6`, dark `oklch(0.197 0.004 286.03)`), so the fill becomes `#fff2e4` in light and `#453b36` in dark. The text colour is `--ink`, which is a **fixed** near-black (`#121212`) in both themes. Result: **17.0:1 in light, 1.73:1 in dark**. The `.proof-ledger-type` override repeats the same mistake for the "auto" tag.

**Why it matters.** This is the highlighted row of the "Remember" feature card — the whole row (`새 이름 / new name / auto`, `components/features.tsx:97-101`) becomes unreadable in dark mode. It also breaks the document's "ink on every pastel ≥ 11:1" claim, because a 24% mix with a flipping surface is not a pastel block.

**Fix.** Never use `--ink`/`--paper` as a foreground on `--bg`/`--surface*`; use the semantic pair that flips with the background:

```css
.proof-ledger-row.is-new {
  background: color-mix(in oklab, var(--peach) 24%, var(--surface));
  color: var(--text);            /* #121212 on #fff2e4 / #f3efe3 on #453b36 */
}
.proof-ledger-row.is-new .proof-ledger-type { color: var(--muted); }
```

---

## Warnings

### WR-01: Pastel/status foregrounds on `--surface` mixes fail AA in dark mode (token regression)

**Files:** `app/admin/admin.css:1276-1294`, `app/(auth)/auth.css:1140`, tokens at `app/globals.css:25-29,99-126`

```css
.admin-icon-monogram[data-accent="mint"]  { background: color-mix(in oklab, var(--mint) 72%, var(--surface)); color: var(--mint-ink); }
.admin-icon-monogram[data-accent="peach"] { background: color-mix(in oklab, var(--peach) 68%, var(--surface)); color: var(--warning); }
.admin-icon-monogram[data-accent="sky"]   { background: color-mix(in oklab, var(--sky) 68%, var(--surface)); color: color-mix(in oklab, var(--accent-ink) 70%, var(--text)); }
.auth-success-badge                        { background: color-mix(in oklab, var(--mint) 62%, var(--surface)); color: var(--mint-ink); }
```

**What is wrong.** In `HEAD` the dark theme overrode the pastels to dark values (`--mint: #19392e`, `--mint-ink: #83e3be`), so `pastel + surface` stayed dark and the light ink stayed readable. The rewrite made pastels theme-invariant (`globals.css:119-120`) but did **not** re-tune `--mint-ink`, and it kept mixing the now-light pastel with the now-dark `--surface`. The mixes land mid-tone while the foregrounds do not move:

| Rule | light | dark |
|---|---|---|
| `.admin-icon-monogram[data-accent="peach"]` (warning `#f0b056` on `#ac8d76`) | 4.62:1 | **1.62:1** |
| `.admin-icon-monogram[data-accent="mint"]` (`#0f6b45` on `#7bab97`) | 5.34:1 | **2.52:1** |
| `.admin-icon-monogram[data-accent="sky"]` (`#e0d7f7` on `#7594ad`) | 10.24:1 | **2.32:1** |
| `.auth-success-badge` icon (`#0f6b45` on `#6c9483`) | 5.49:1 | **1.92:1** |

**Why it matters.** `.admin-icon-monogram` is real text (`groupMonogram(...)`, `components/admin/group-icon-field.tsx:82-87`) at 1.5rem — large-text AA needs 3:1, so mint/sky fail and peach fails badly. The auth badge check icon falls below the 3:1 non-text minimum (`WCAG 1.4.11`). `docs/ARCHITECTURE.md:497` claims "status colours were darkened for AA on their pastel fills"; in the dark theme `--warning`/`--danger` went *lighter*, so the claim no longer holds.

**Fix.** Follow the documented pastel rule — text on a pastel is ink — and stop mixing pastels with a flipping token for large fills:

```css
.admin-icon-monogram[data-accent] { color: var(--fill-edge); }     /* fixed ink, per ARCHITECTURE:451 */
.admin-icon-monogram[data-accent="mint"]  { background: var(--mint); }
.admin-icon-monogram[data-accent="peach"] { background: var(--peach); }
.admin-icon-monogram[data-accent="sky"]   { background: var(--sky); }
.auth-success-badge { background: var(--mint); color: var(--fill-edge); }
```

### WR-02: `.hero-title` 374px fallback is dead — landing overrides it at 479px

**Files:** `app/globals.css:298-311`, `app/landing.css:2980-2983`

```css
/* globals.css */
.hero-title { font-size: clamp(2.6rem, calc(4.4vw + 1.1rem), 4.9rem); }
@media (max-width: 374px) { .hero-title { font-size: 2rem; } }

/* landing.css */
@media (max-width: 479px) { .hero-title { font-size: 2.35rem; } }
```

**What is wrong.** Both queries match at ≤374px. `app/layout.tsx:7-9` imports `globals.css`, then `motion.css`, then `landing.css`, so the later `2.35rem` wins and the deliberate 2rem small-screen guard never applies. This is the only selector declared in both root sheets with conflicting declarations (`globals.css` is the base layer, `landing.css` is supposed to be page-scoped).

**Why it matters.** At 320-374px the headline renders 17% larger than designed. It wraps rather than overflowing today, so this is a broken rule rather than a broken page — but the guard is gone and nobody will notice it is gone.

**Fix.** Move the narrow query into `landing.css` (below the 479px rule) or drop it from `globals.css`:

```css
/* landing.css, after the 479px block */
@media (max-width: 374px) {
  .hero-title { font-size: 2rem; }
}
```

### WR-03: Landing mock and real workspace share `.ws-grid` / `.ws-rail` / `.ws-viewer` — outcome depends on bundle order

**Files:** `app/landing.css:530-542,937-945` vs `app/chapters/chapters.css:14-25,36-40`

| Selector | `landing.css` (mock) | `chapters.css` (workspace) |
|---|---|---|
| `.ws-grid` | `grid-template-columns: 12.5rem minmax(0,1fr) minmax(15rem,33%)`, `min-height: 25rem` | `16rem minmax(0,1fr) minmax(20rem,38%)`, `height: calc(100dvh - var(--dash-topbar))`, `min-height: 0` |
| `.ws-rail` | `border-right: 2px solid var(--edge)`, `background: var(--surface-2)` | `border-right: 1px solid var(--border)`, `min-height: 0` |
| `.ws-viewer` | `display: flex`, `gap .45rem`, `border-left: 2px solid var(--edge)`, `padding .65rem` | `display: flex`, `min-height: 0` (no border-left, no padding) |

**What is wrong.** `app/landing.css` is imported by the **root** layout (`app/layout.tsx:9`), so these three generic names are live on every route. `components/workspace-preview.tsx` and `components/chapters/workspace-view.tsx:746-748` both render `ws-grid`/`ws-rail`/`ws-viewer`. Today the chapters layout imports `chapters.css` after the root sheet, so the real workspace wins and the landing mock is unaffected — but nothing in the files enforces that. If the chunks are ordered the other way (dev vs prod, route-group splits, a future page importing `landing.css` directly), the workspace grid silently becomes `12.5rem / 33%` with `min-height: 25rem`, breaking the full-height workspace layout, and the mock's `2px --edge` borders appear on the real viewer.

**Why it matters.** Two modules own the same class names with contradictory declarations; correctness rests on an implicit import order across layouts, which is exactly the kind of thing that regresses silently.

**Fix.** Namespace the mock and remove the collision:

```css
/* landing.css — scope the mock, raises specificity above route CSS */
.ws-preview .ws-grid { ... }
.ws-preview .ws-rail { ... }
.ws-preview .ws-viewer { ... }
```

(or rename to `.wsp-*`). Then `.ws-grid`/`.ws-rail`/`.ws-viewer` unambiguously belong to `chapters.css`.

### WR-04: Motion layer clobbers `translateY(-50%)` centring on the lightbox/panel arrows

**Files:** `app/motion.css:165-179,181-193`; base rules `app/chapters/chapters.css:649-663` (`.ch-panel-arrow`) and `:1057-1067` (`.ch-lightbox-arrow`)

```css
/* chapters.css */
.ch-panel-arrow { position: absolute; top: 50%; width: 2.25rem; height: 2.25rem;
                  transform: translateY(-50%); }

/* motion.css */
:root[data-theme] .ch-panel-arrow:not(:disabled):hover { transform: translate(-1px, -1px); }
:root[data-theme] .ch-panel-arrow:not(:disabled):active { transform: translate(1px, 1px); }
```

**What is wrong.** Both arrows are vertically centred *with* a transform. The motion rule replaces the whole `transform` property, so the `-50%` term is lost while hovered or pressed: the 2.25rem panel arrow drops 1.125rem, the 2.5rem lightbox arrow drops 1.25rem. They snap back on mouse-out. The same class of override also silently discards the route's press feedback on `.dash-icon-btn:active { transform: scale(0.94) }` (`dashboard.css:283`) and `.admin-icon-btn:active` (`admin.css:360`), because `motion.css` sets `translate(1px,1px)` with higher specificity.

**Why it matters.** Hovering a lightbox arrow visibly jumps it out of alignment — a regression that appears only on interaction, which is why it survives casual review.

**Fix.** Express the press/hover offsets with the independent `translate` property, which composes with `transform` instead of replacing it:

```css
:root[data-theme] .ch-panel-arrow:not(:disabled):hover,
:root[data-theme] .ch-lightbox-arrow:not(:disabled):hover { translate: -1px -1px; }

:root[data-theme] .ch-panel-arrow:not(:disabled):active,
:root[data-theme] .ch-lightbox-arrow:not(:disabled):active { translate: 1px 1px; }
```

Apply the same swap wherever `motion.css` fights a route `transform` (icon buttons, nav links).

### WR-05: `.footer-langs` uses `!important` to win a specificity fight it should not be in

**File:** `app/landing.css:2408-2421`

```css
.footer-brand p { font-size: 0.8125rem; color: var(--muted); }   /* (0,1,1) */
.footer-langs { font-size: 0.5625rem !important; color: var(--faint) !important; } /* (0,1,0) */
```

**What is wrong.** `components/site-footer.tsx:26` renders `<p className="footer-langs">` inside `.footer-brand`, so the element selector beats the class selector and `!important` is used to force the smaller mono treatment. This is the only `!important` in `landing.css` outside the reduced-motion block.

**Why it matters.** The `!important` freezes the value against future, legitimate overrides (a narrow-screen tweak, a print sheet). The conflict is purely a selector-specificity mistake.

**Fix.**

```css
.footer-brand .footer-langs { font-size: 0.5625rem; color: var(--faint); }  /* (0,2,0) */
```

### WR-06: Hero mock labels vanish in dark mode (`--ink` on `--surface`, `--bg` on `--ink`)

**Files:** `app/landing.css:1019-1028` (`.ws-bbox span`), `app/landing.css:857-860` (`.ws-bubble.is-active .ws-bubble-index`)

```css
.ws-bbox span { background: var(--surface); color: var(--ink); }          /* 18.4:1 light → 1.03:1 dark */
.ws-bubble.is-active .ws-bubble-index { background: var(--ink); color: var(--bg); } /* 1.04:1 dark */
```

**What is wrong.** Both rules pair a fixed primitive with a flipping token. `.ws-bbox span` holds the panel callouts `01/02/03` (`components/workspace-preview.tsx:206-214`): in dark mode `--surface` is `#151517` and `--ink` is `#121212`, so the numbers are black-on-black. The active bubble index is `--bg` (near-black in dark) on `--ink` (fixed near-black).

**Why it matters.** The hero preview loses its annotation numbers and the active transcript index in dark mode. Severity is limited because the whole mock is `aria-hidden="true"` (`workspace-preview.tsx:57`) and purely decorative, but it still looks broken in the primary hero visual.

**Fix.**

```css
.ws-bbox span { background: var(--surface); color: var(--text); }
.ws-bubble.is-active .ws-bubble-index { background: var(--ink); color: var(--paper); }
```

### WR-07: `globals.css` depends on a duration token defined only in `motion.css`

**Files:** `app/globals.css:798`, `app/motion.css:14-18`

```css
/* globals.css */
.theme-toggle svg { transition: transform var(--t-pop) var(--ease), opacity var(--t-fast) var(--ease); }
/* motion.css (loaded after) */
:root { --t-pop: 160ms; }
```

**What is wrong.** `--t-pop` is not defined in `globals.css`; it exists only because `layout.tsx` imports `motion.css` immediately after. If that import moves, or the variable is renamed/removed, the whole shorthand becomes invalid at computed-value time and `transition-duration` falls back to `0s` — the toggle stops animating with no error.

**Why it matters.** The root stylesheet is no longer self-contained, and the failure mode is silent.

**Fix.** Define the duration scale once in `globals.css:92-97` next to `--t-fast`/`--t-base`, and let `motion.css` consume it (or add a fallback: `var(--t-pop, 160ms)`).

---

## Info

### IN-01: Dead CSS newly orphaned by this diff

**Files/lines:** `app/globals.css:351-354` (`.tnum`), `:854-856` (`.hero-wash`), `:891-920` (`.speech-bubble` + `::after` + `[data-tail]`), `:952-955` (`.progress-fill`), `app/motion.css:440-442` (`.progress-fill` transition); the four not-found families `app/admin/admin.css:1623,1636,1644`, `app/groups/groups.css:739,753,761`, `app/chapters/chapters.css:1520,1534,1540`, `app/series/series.css:302,316,324`.

**Issue.** Zero occurrences of any of these class names in `app/`, `components/` or `lib/` (whole-tree token match). Each had call sites in `HEAD` that this rewrite removed: `.tnum` at `components/features.tsx:207,231`, `pipeline.tsx:41`, `workspace-preview.tsx:244`; `.hero-wash` at `hero.tsx:16`; `.speech-bubble` at `workspace-preview.tsx:144,160,170`; `.progress-fill` at `workspace-preview.tsx:247`; the `*-notfound*` families in `components/admin/group-detail.tsx:57-60`, `groups/group-detail-view.tsx:127-130`, `chapters/workspace-view.tsx:277-280`, `series/series-view.tsx:44-49`, all superseded by the shared `NotFoundState` component.
**Fix.** Delete them. (`.btn-danger` at `globals.css:445` is also new-and-unused, but `.chip-blush` and the `--shadow-tint`/`--spotlight`/`--glow-*` aliases are deliberate legacy/primitive surface — see `docs/ARCHITECTURE.md:481` and `globals.css:73-90` — so leave those alone.)

### IN-02: `.notfound-copy` is rendered but has no rule

**File:** `components/not-found-state.tsx:37`, stylesheet `app/landing.css:2502-2680`

**Issue.** The wrapper `<div className="notfound-copy">` has no matching selector; its children are styled individually. It works because `.notfound-state` is a grid and the div is a normal block, but the class implies a rule that was lost in the rewrite.
**Fix.** Either drop the class or add the intended rule (e.g. `min-width: 0` inside the two-column grid, which is the usual reason for that wrapper).

### IN-03: `.eyebrow.justify-center` resets properties that no longer exist

**File:** `app/globals.css:338-343`

**Issue.** The override sets `width: auto; height: auto; background: none`, but `.eyebrow::before/::after` (`:326-336`) only set `content`, `color` and `font-weight`. All three declarations are no-ops — leftovers from the previous bracket-pill styling. The rule is only kept alive by `components/auth/auth-experience.tsx:180,246` telling us centred eyebrows were once special.
**Fix.** Delete the block. The brackets are unchanged by centring now, so there is nothing to reset.

### IN-04: `motion-rise` keyframes are never used

**File:** `app/motion.css:20-25`

**Issue.** No `animation:` in any sheet references `motion-rise` (`motion-rise-sm` is the one used). Dead keyframes.
**Fix.** Delete, or switch one of the entrance rules to it if the 8px rise was the intent.

### IN-05: 19 `display: none` blocks leave their blur/will-change/animation declarations behind

**File:** `app/(auth)/auth.css:37,49,61,73,85,101,282,290,298,304,310,357,376,906,1219,1239,1251,1257,1263`

**Issue.** The diff adds `display: none` at the end of each decorative aura/spark/shine rule but keeps `filter: blur(90px)`, `will-change: transform` and infinite `animation:` declarations above it. Nothing renders, so nothing is broken — but these are now dead declarations that will silently come back to life if someone re-enables the element, and they obscure what the auth screen actually styles.
**Fix.** If the decoration is retired, delete the rules (and the JSX) rather than hiding them; `will-change` on a `display: none` element in particular is pure noise.

### IN-06: Route CSS still ships hard-coded colours the design doc forbids

**Files:** `app/chapters/chapters.css:1053-1054,1065-1066,1311,1506` (`rgba(255,255,255,0.14)`, `#fff`)

**Issue.** `docs/ARCHITECTURE.md:468-469` states "Route CSS must not introduce new hex values." These are pre-existing, but the restyle either kept them or added the surrounding rules, and `#fff` on `var(--danger)` is **2.67:1 in dark mode** (`.ch-danger-btn`, `chapters.css:1306-1311`) because `--danger` became lighter in the dark theme.
**Fix.** Add a token for "text on a status fill" (e.g. `--on-danger: oklch(0.99 0 0)` fixed in both themes) and use it; replace the lightbox whites with a scrim-relative token.

### IN-07: First-paint theme contract is only asserted by comment

**Files:** `app/motion.css:1-12` (comment), `app/globals.css:14,99`

**Issue.** Every rule in `motion.css` is scoped `:root[data-theme]` on the stated assumption that the inline bootstrap in `app/layout.tsx` always sets `data-theme` before paint (`docs/ARCHITECTURE.md:487-490`). That holds today, but if the attribute is ever set late (CSP blocking the inline script, a test harness rendering the layout without it), all hover/entrance motion silently disappears. Worth a test rather than a comment-only invariant.
**Fix.** Keep the scoping, but assert the bootstrap in the layout test suite (render `layout.tsx`, check `<html data-theme>`), or add a no-theme fallback for the interaction rules so a missing attribute degrades to static styling instead of dead selectors.

---

## Verified and cleared (not findings)

- `--font-inter`, `--font-archivo`, `--font-plex-mono` (`globals.css:129-131`) are injected by `next/font` in `app/layout.tsx`; `--font-newsreader` only appears in the scratch `app/theme-preview/` route.
- `--spark-angle` / `--spark-distance` (`auth.css:1588-1596`) are set inline per spark in `components/auth/auth-experience.tsx`; `--mx`/`--my`/`--rx`/`--ry` are set by the tilt handler. No undefined-variable failures.
- `.hero-emphasis-rule path` `stroke-dasharray: 100` is correct because `components/hero.tsx:35` sets `pathLength="100"`.
- `prefers-reduced-motion` (`globals.css:970-989`) uses `!important` on `*`, so it neutralises the later-loaded `motion.css`, and the `1s !important` spinner overrides in `admin.css:2179` / `dashboard.css:1350` still win on specificity.
- No `@keyframes` name is defined twice across bundles, and no referenced animation is undefined.
- `.series-cover--lg` is declared in both `groups.css:642` (10.5rem) and `series.css:348` (8rem, inside `@media (max-width:700px)`); the overlap is intentional per-route sizing and predates this diff.
- `app/not-found.tsx` uses valid UTF-8 apostrophes (`E2 80 99`), not mojibake.
