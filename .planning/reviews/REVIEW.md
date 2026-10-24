---
status: issues
scope: uncommitted working tree (tracked modifications + new untracked CSS/routes)
base_commit: c15c7d7
files_reviewed: 35
findings:
  critical: 2
  warning: 10
  info: 5
  total: 17
---

# Code Review — working tree (dark-theme token restyle)

Scope: the uncommitted restyle — 10 route stylesheets, the new `app/landing.css` and
`app/motion.css`, 22 React components, `app/layout.tsx`, `package.json`, `.env.example`.
Base commit `c15c7d7`. HEAD moved to `25acf18` mid-review (5 commits landed in parallel);
findings below were re-verified against the files as they stand now.

Every finding here was independently verified by re-reading the cited code. Contrast ratios
were recomputed from the actual `oklch()` values (OKLab → linear sRGB → WCAG 2.x), not taken
from a prior report. Claims that could not be reproduced are listed at the end under
**Dropped** so you know they were considered and rejected.

## Root cause

The restyle split the tokens into two families with different theming behaviour:

- **flips in dark** — `--bg`, `--surface*`, `--text`, `--border`, `--edge`, `--accent-ink`, `--warning`, `--danger`
- **fixed** — `--ink`, `--mint-ink`, `--peach`, `--mint`, `--sky`, `--lavender`, `--blush`

`--ink` is a new token (`globals.css:21`) that is *only* declared in the light `:root` and never
redeclared in `:root[data-theme="dark"]` (`globals.css:99-140`). Any rule that mixes the two
families is correct in exactly one theme. That single mistake produces both criticals.

---

## Critical

### CR-01: fixed-family colour on a theme-flipping surface — text disappears in dark

`color: var(--ink)` (`--ink: oklch(0.182 0 89.88)`, unchanged in dark) painted onto
`var(--surface)` (dark: `oklch(0.197 0.004 286.03)`) is dark-on-dark. Four live call sites,
all on the dark landing page:

| Site | Rule | Measured (dark) |
|---|---|---|
| `components/pipeline.tsx:33` | `landing.css:1754` `.run-band .display-serif { color: var(--peach) }` on `background: var(--text)` | **1.25:1** — the word "release" vanishes |
| `components/features.tsx:97` | `landing.css:1609` `.proof-ledger-row.is-new { color: var(--ink) }` on `color-mix(peach 24%, var(--surface))` | **1.73:1** |
| `components/workspace-preview.tsx:164` | `landing.css:857` `.ws-bubble.is-active .ws-bubble-index { background: var(--ink); color: var(--bg) }` | **1.04:1** |
| `components/workspace-preview.tsx:206-213` | `landing.css:1019` `.ws-bbox span { color: var(--ink) }` on `background: var(--surface)` | **1.03:1** |

Light mode passes all four (13.07:1, 17.01:1, 16.9:1, 18.4:1), which is why this survives a
light-mode eyeball check.

**Fix (one place):** define the primitive in the dark block so it tracks the theme —

```css
:root[data-theme="dark"] { --ink: oklch(0.952 0.016 91.55); }  /* same value as --text */
```

Then audit the reverse direction: `.ws-bubble-index { background: var(--ink); color: var(--bg) }`
is an intentional "invert" that only stays coherent once `--ink` follows the theme. Alternatively
keep `--ink` fixed and switch each of the four sites to `--text`; the token fix is smaller and
fixes the class rather than four instances.

### CR-02: white text on `--danger` fails in dark — the error surfaces

`.ch-danger-btn` and `.ch-notice[data-tone="error"]` both set `background: var(--danger);
color: #fff`. `--danger` lightens from `oklch(0.529 0.193 29.56)` to `oklch(0.72 0.17 27)` in
dark (`globals.css:122`), so white lands at **2.59:1** (light: 5.68:1).

Live sites:
- `components/chapters/reject-chapter-dialog.tsx:92` — reject confirm
- `components/chapters/delete-chapter-dialog.tsx:78` — delete confirm
- `app/chapters/chapters.css:1504` `.ch-notice[data-tone="error"]` — **the toast that reports failed chapter actions**
- `app/globals.css:760` `.account-signout:hover`

The buttons that confirm destructive actions, and the toast that reports failures, are the
hardest to read exactly when the user needs to read them.

**Fix:** add a dedicated on-danger token per theme —
`--on-danger: oklch(0.99 0 0)` in light, `oklch(0.16 0.02 27)` in dark — and use it at all four
sites. Same treatment for `--warning`/`--success` if they ever carry text.

---

## Warning

### WR-01: pastel/status foregrounds on `--surface` mixes fail AA in dark

`admin.css:1276-1293` mixes a fixed pastel with `var(--surface)`. The fill darkens in dark mode
while the foreground token stays light, collapsing contrast:

| Rule | light | dark |
|---|---|---|
| `.admin-icon-monogram[data-accent="mint"]` (`--mint-ink` on mint 72%) | 5.34:1 | **2.52:1** |
| `.admin-icon-monogram[data-accent="peach"]` (`--warning` on peach 68%) | 4.62:1 | **1.62:1** |
| `.admin-icon-monogram[data-accent="sky"]` (accent-ink 70% on sky 68%) | 10.24:1 | **2.32:1** |

**Fix:** mix against `var(--paper-raised)` (fixed) instead of `var(--surface)`, or add a
`--*-on-dark` foreground for the dark block. The light-mode values are the contract; keep the
fill fixed so the foreground keeps working.

### WR-02: motion layer clobbers the vertical centring on the panel arrows

`.ch-panel-arrow` (`chapters.css:662`) and `.ch-lightbox-arrow` (`chapters.css:1067`) are centred
with `transform: translateY(-50%)`. `motion.css:177` sets `transform: translate(-1px, -1px)` on
hover and `motion.css:192` sets `translate(1px, 1px)` on active — replacing, not composing with,
the centring. Both arrows jump ~1.1–1.25rem vertically on hover and stay there while pressed.

**Fix:** `transform: translate(-1px, calc(-50% - 1px));` (and the `+1px` active equivalent), or
centre with `top: 50%; margin-block: -1.125rem` and drop `translateY` from the base rule.

### WR-03: `.env.example` no longer documents the Supabase keys, and `proxy.ts` fails open

`c15c7d7` shipped 36 lines including `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`; the current file is 20 lines with only `GEMINI_API_KEY`
and `MOCK_PIPELINE`. `proxy.ts:27-29` returns `NextResponse.next()` when either key is missing —
deliberately, to avoid opaque 500s — so a fresh clone silently loses the proxy's route protection
and reports nothing.

**Fix:** restore the Supabase block with a comment pointing at `/api/health/supabase`. If RLS in
`supabase/` is the real authorisation boundary, the proxy is defence-in-depth and this is a
warning; if any route relied on the proxy alone, treat it as critical.

### WR-04: theme storage key and colours duplicated between `lib/theme.ts` and the bootstrap script

`app/layout.tsx:78` hardcodes `"hwaflow.theme.v1"`, `#0C0C0D` and `#F6F3EA` inside the pre-paint
script; `lib/theme.ts:19` exports `THEME_KEY` with the same string and nothing consumes it. Change
one and the first paint fights the toggle.

**Fix:** generate the bootstrap string from the exported constants
(`const THEME_BOOTSTRAP = \`(...localStorage.getItem("${THEME_KEY}")...)\``) so the key exists once.

### WR-05: header and footer nav links use bare fragment hrefs — dead on every non-landing route

`site-header.tsx:12-14` and `site-footer.tsx:6-8` declare `#product`, `#pipeline`, `#team`. Those
targets exist (`features.tsx:142`, `pipeline.tsx:25`, `team.tsx:127`) but only on `/`. Rendered on
`/dashboard`, `/admin`, `/not-found`, they scroll nowhere. `app/not-found.tsx:31-32` already does
it correctly with `/#product` — the nav arrays were missed.

**Fix:** use `/#product` etc. in both arrays.

### WR-06: `NotFoundState` hardcodes "404 · Missing" for non-404 states

`components/not-found-state.tsx:38` renders a fixed kicker regardless of the message. The component
is reused for permission/absence states at `series-view.tsx:45`, `group-detail-view.tsx:128`,
`workspace-view.tsx:279`, `admin/group-detail.tsx:58` — a user denied access to a series is told the
page is missing.

**Fix:** take `kicker` (or a `tone: "missing" | "denied"`) as a prop and default it to `404 · Missing`.

### WR-07: `ThemeToggle` exposes no state

`components/theme-toggle.tsx:19-20` has a fixed `aria-label="Toggle dark mode"` and no
`aria-pressed`. A screen-reader user cannot tell the current theme from the control.

**Fix:** `aria-pressed={theme === "dark"}` plus a label that matches the action ("Switch to dark
mode" / "Switch to light mode").

### WR-08: the access matrix is mouse-only

`components/team.tsx:145-153` sets `onMouseEnter`/`onMouseLeave` on `.role-ladder` items; the rows
have no `tabIndex`, no focus handler and no click handler, so keyboard and touch users get nothing.
The copy at line 138 instructs "Hover a role", which documents the limitation rather than fixing it.

**Fix:** add `onFocus`/`onBlur` and `tabIndex={0}` (or render the content in a `<details>` per row).

### WR-09: the landing mock and the real workspace share a class namespace

`.ws-grid`, `.ws-rail` and `.ws-viewer` are defined both in `landing.css:530/536/937` (the marketing
mock) and `chapters.css:14/21/36` (the real editor), with further overrides at
`landing.css:2701/2834` and `chapters.css:43/1592`. Today this only works because `landing.css` is
imported in the root layout and `chapters.css` later, so the route file wins. Any change to import
order, or to code-splitting, silently restyles one surface with the other's rules.

**Fix:** prefix the mock (`ws-mock-*`) or scope it under `.workspace-preview`.

### WR-10: `globals.css` consumes a duration token that only `motion.css` defines

`--t-pop` is used in `globals.css` and declared only in `motion.css`. Both are imported from
`app/layout.tsx:7-8`, so it resolves on every page today — but `globals.css` is not self-contained,
and any entry point that pulls it alone (the new `app/theme-preview/preview.css` route is exactly
that shape) gets an invalid declaration.

**Fix:** move `--t-pop` into the `:root` token block in `globals.css`.

---

## Info

### IN-01: `@vercel/speed-insights` is an unused dependency
`package.json:15` and its lockfile entries were added; there is no import anywhere in the repo. Remove
it or wire `<SpeedInsights />` into `app/layout.tsx`.

### IN-02: `lib/theme.ts` exports eight symbols nothing consumes
Only `useTheme` is imported (`components/theme-toggle.tsx:3`). `THEME_KEY`, `THEME_EVENT`,
`getStoredPreference`, `systemTheme`, `resolveTheme`, `applyTheme`, `setPreference` and the
`ThemePreference` type are dead — the bootstrap script reimplements the read path instead (see WR-04).

### IN-03: `PanelArt.showFigure` is a dead prop
`components/panel-art.tsx:8/12/91` — defaults to `true`, never overridden by either call site
(`workspace-preview.tsx:154,205`), so the `false` branch is unreachable.

### IN-04: dead CSS, including a dark-mode bug waiting to happen
`.speech-bubble` (`globals.css:891-897`) has no markup anywhere and is exactly the CR-01 pattern
(`--ink` on `--surface`) — it would be invisible in dark the moment it is used. `.btn-danger`
(`globals.css:445`) is likewise unreferenced (the chapter dialogs use `.ch-danger-btn`). The
`NotFoundState`/hero refactor also left neutralised rules behind as empty bodies plus `display: none`.

### IN-05: the throwaway `app/theme-preview` route is in the tree
`app/theme-preview/{page.tsx,preview.css,variants.css}` is an unreferenced dev page. Delete it or
move it out of the route tree before shipping.

---

## Dropped (verified, then rejected)

- **"374px `.hero-title` fallback is dead"** — no 374px rule exists in the current `landing.css`;
  only `@media (max-width: 479px)` at line 2980 sets `font-size: 2.35rem`. Not reproducible.
- **"`.series-cover-initial` is broken in dark"** — the base rule (`groups.css:663`) has no
  background, but every instance renders with `data-accent`, whose rules supply a fixed pastel.
- **"`.footer-langs` `!important` fight"** and **"`.notfound-copy` has no rule"** — not verified in
  this pass; both are cosmetic and can be checked with the broader CSS lint.
- `TiltFrame` rAF/listener cleanup, `Reveal`, `inert={!open}`, `next/font` variables and the
  `prefers-reduced-motion` overrides were inspected and found sound.

## Provenance note

`app/landing.css` and `app/motion.css` are new untracked files, so `git diff HEAD` does not show
them — they are nonetheless the bulk of this change and the source of one critical. Stage them
before the next diff-based review or they will be invisible to the next reviewer, too.
