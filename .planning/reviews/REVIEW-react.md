---
phase: react-surface-refresh
reviewed: 2026-10-24T00:00:00Z
depth: deep
files_reviewed: 47
files_reviewed_list:
  - .env.example
  - app/(auth)/auth.css
  - app/admin/admin.css
  - app/chapters/chapters.css
  - app/dashboard/dashboard.css
  - app/globals.css
  - app/groups/groups.css
  - app/landing.css
  - app/layout.tsx
  - app/motion.css
  - app/not-found.tsx
  - app/page.tsx
  - app/series/series.css
  - app/settings/settings.css
  - app/theme-preview/layout.tsx
  - app/theme-preview/page.tsx
  - app/theme-preview/preview-toggle.tsx
  - app/theme-preview/preview.css
  - components/admin/admin-shell.tsx
  - components/admin/group-detail.tsx
  - components/auth/auth-experience.tsx
  - components/chapters/chapter-rail.tsx
  - components/chapters/workspace-view.tsx
  - components/cta.tsx
  - components/dashboard/dashboard-home.tsx
  - components/dashboard/dashboard-topbar.tsx
  - components/features.tsx
  - components/groups/group-detail-view.tsx
  - components/hero-atmosphere.tsx
  - components/hero.tsx
  - components/icons.tsx
  - components/landing/translation-strip.tsx
  - components/not-found-state.tsx
  - components/panel-art.tsx
  - components/pipeline.tsx
  - components/release-slip.tsx
  - components/section-head.tsx
  - components/section-intro.tsx (deleted)
  - components/series/series-view.tsx
  - components/site-footer.tsx
  - components/site-header.tsx
  - components/team.tsx
  - components/theme-toggle.tsx
  - components/tilt-frame.tsx
  - components/workspace-preview.tsx
  - lib/theme.ts
  - package.json
findings:
  critical: 2
  warning: 7
  info: 6
  total: 15
status: issues_found
---

# Code Review — React surface refresh (landing, theme, not-found, workspace preview)

**Reviewed:** 2026-10-24
**Depth:** deep
**Files Reviewed:** 47
**Status:** issues_found

## Summary

This diff replaces the marketing surface (new `app/landing.css`, `app/motion.css`, `SectionHead`, `TranslationStrip`, `ReleaseSlip`, rebuilt hero/pipeline/features/CTA/team), adds a real light/dark theme (attribute-driven, `lib/theme.ts` + pre-paint script), consolidates all "missing" states into `NotFoundState`, and rebuilds `WorkspacePreview` / `TiltFrame` / `PanelArt`.

`npx tsc --noEmit` passes. The React logic in the new client components (`tilt-frame.tsx`, `lib/theme.ts`, `reveal.tsx`) is sound: rAF loops are cancelled, listeners are removed, refs are guarded, and the theme hook reconciles with the pre-paint attribute correctly. The dominant defect class is **colour tokens**: `--ink` is a fixed light-theme primitive, and it is used as a text/icon colour on theme-aware surfaces in four places, producing text at ~1.0:1 contrast in the new dark theme. A second token bug (`#fff` on `--danger`) only fails in dark mode.

Two block-level issues, seven warnings, six info items. The `.env.example` change is the only change with a security-adjacent consequence (route protection silently disabled in a fresh clone); it is not an authorization bypass because RLS is the actual boundary.

---

## Critical Issues

### CR-01: `--ink` used as text on theme-aware surfaces — content is invisible in dark theme

**File:** `app/globals.css:21`, `app/globals.css:99-126` (root cause); `components/site-header.tsx:122`; `app/landing.css:857-860`; `app/landing.css:1019-1024`; `app/landing.css:1609-1618`

**Issue:** `--ink` is defined once as a fixed primitive, `oklch(0.182 0 89.88)` (`globals.css:21`), and is **never redefined** in `:root[data-theme="dark"]` (`globals.css:99-126` redefines `--bg`, `--surface`, `--text`, etc., but not `--ink`). Meanwhile `--text` is theme-aware. Four rules paint `--ink` on a background that *is* theme-aware, so dark mode renders near-black on near-black:

| Site | Background | Contrast (computed) |
|---|---|---|
| `site-header.tsx:122` — mobile menu button (`bg-[var(--surface)] text-[var(--ink)]`) | `--surface` dark = `oklch(0.197 …)` | **1.03:1** |
| `landing.css:857-860` — `.ws-bubble.is-active .ws-bubble-index` (`background: var(--ink); color: var(--bg)`) | ink on dark `--bg` | **1.04:1** |
| `landing.css:1019-1024` — `.ws-bbox span` (`background: var(--surface); color: var(--ink)`) | `--surface` dark | **1.03:1** |
| `landing.css:1609-1618` — `.proof-ledger-row.is-new` + `.proof-ledger-type` on `color-mix(peach 24%, --surface)` | mixed dark surface | **3.92:1** (fails AA; 11px and 7px text) |

**Why it matters:** In dark mode the mobile navigation button icon is literally invisible (only its cream border remains), the active bubble number vanishes, the panel bounding-box numbers vanish, and the "just added" glossary row fails AA. `docs/ARCHITECTURE.md:495-497` claims "all text pairs meet WCAG AA … ink on every pastel ≥ 11:1", which these sites contradict. This is the shipped dark theme, not an experimental path.

**Fix:** Never use the `--ink` primitive as a foreground on a semantic surface. Use `--text` on `--surface`, and keep `--ink` only for pastel fills (which are fixed light in both themes).

```css
/* app/landing.css */
.ws-bubble.is-active .ws-bubble-index {
  background: var(--text);
  color: var(--bg);
}

.ws-bbox span {
  background: var(--surface);
  color: var(--text); /* was var(--ink) */
}

.proof-ledger-row.is-new,
.proof-ledger-row.is-new .proof-ledger-type {
  color: var(--text); /* was var(--ink) */
}
```

```tsx
// components/site-header.tsx:122
className="grid h-10 w-10 place-items-center border-2 border-[var(--edge)] bg-[var(--surface)] text-[var(--text)] …"
```

If a fixed "ink on light chip" colour is genuinely needed, add a semantic token instead of reusing the primitive:

```css
:root { --on-pastel: var(--ink); }
:root[data-theme="dark"] { --on-pastel: var(--ink); } /* pastels stay light */
```

and reserve `--ink` for those pastel-only rules.

### CR-02: White text on `--danger` fails contrast in dark theme on destructive actions and error notices

**File:** `app/globals.css:445-449` and `app/globals.css:760-763`; `app/chapters/chapters.css:1308-1312` and `app/chapters/chapters.css:1504-1507`

**Issue:** `--danger` becomes a *light* red in dark mode (`oklch(0.72 0.17 27)`, `globals.css:122`) while the foreground is hardcoded to near-white (`#fff` / `oklch(0.99 0 0)`). Computed contrast: **2.67:1 in dark** vs 5.85:1 in light. Affected selectors:

- `.btn-danger` — `color: oklch(0.99 0 0)` (`globals.css:447`)
- `.account-signout:hover` — `color: oklch(0.99 0 0)` (`globals.css:762`)
- `.ch-danger-btn` — `color: #fff` (`chapters.css:1311`)
- `.ch-notice[data-tone="error"]` — `color: #fff` (`chapters.css:1506`)

**Why it matters:** `.ch-notice[data-tone="error"]` is the surface that reports failed chapter actions (upload failed, status transition rejected). At 2.67:1 the failure message is the least legible text on screen, in the theme the diff is introducing. Destructive buttons (delete/remove) are also rendered with an unreadable label.

**Fix:** Use the themed canvas token for the foreground, which is dark on the light-red dark-theme fill and light on the dark-red light-theme fill:

```css
/* app/globals.css */
.btn-danger { color: var(--bg); }
.account-signout:hover { color: var(--bg); }

/* app/chapters/chapters.css */
.ch-danger-btn { color: var(--bg); }
.ch-notice[data-tone="error"] { color: var(--bg); }
```

Better: define `--danger-ink` in both theme blocks next to `--danger` and use it, so the pair can be tuned together. Add these four to the contrast table in `docs/ARCHITECTURE.md` §9 with dark-theme values.

---

## Warnings

### WR-01: `.env.example` no longer documents the Supabase keys the app requires

**File:** `.env.example` (Supabase block deleted, lines 14-16 now end at `MOCK_PIPELINE`)

**Issue:** The diff removes the entire Supabase section (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`) plus the health-check instructions. Those variables are still required by `proxy.ts:19-20`, `app/api/health/supabase/route.ts`, and every `lib/*-actions.ts`. A developer following `.env.example` verbatim gets a server that boots, but `proxy.ts:27-29` takes the "missing env" branch and returns `NextResponse.next()` — i.e. **route protection is silently disabled** and `/api/health/supabase` is the only thing that would explain why.

**Why it matters:** Fail-open on missing config is deliberate (the comment says so), but removing the only documentation of the required keys turns a loud misconfiguration into a silent one. Auth pages render, sessions never refresh, and the app looks broken rather than unconfigured.

**Fix:** Restore the block (it contains no secrets) and keep it next to `GEMINI_API_KEY`; if the intent was to move it, link the new location from the file header:

```dotenv
# ---------------------------------------------------------------------------
# Supabase (required for auth, groups, chapters, storage)
# Copy from the dashboard's Connect dialog, then restart the dev server.
# ---------------------------------------------------------------------------
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=

# Server-only. Never prefix either of these with NEXT_PUBLIC_.
SUPABASE_URL=
SUPABASE_SECRET_KEY=
```

Separately, consider making `proxy.ts` log a one-line warning when it takes the fail-open branch, so the disabled-protection state is observable.

### WR-02: Theme storage key and theme colours are duplicated between `lib/theme.ts` and `app/layout.tsx`

**File:** `app/layout.tsx:78`; `lib/theme.ts:19-26`

**Issue:** `lib/theme.ts` exports `THEME_KEY = "hwaflow.theme.v1"` and `THEME_COLOR = { light: "#F6F3EA", dark: "#0C0C0D" }`, but the pre-paint script hardcodes `"hwaflow.theme.v1"`, `"#0C0C0D"` and `"#F6F3EA"` independently. `THEME_KEY` and `THEME_COLOR` are never imported anywhere. The comment in `layout.tsx:74-77` calls this "the same contract" — it is two copies of the contract.

**Why it matters:** Changing the key (e.g. for a v2 preference) or a theme colour in one place silently breaks the other. A key mismatch is the exact failure mode the module comment claims to prevent: the script reads a stale key and the app permanently flashes/ignores the stored choice. There is no test or type check that can catch it, because the script is a string.

**Fix:** Move the two constants into a dependency-free module that both the client runtime and the server layout can import, then generate the script from them:

```ts
// lib/theme-contract.ts  (no "use client" — importable from both graphs)
export const THEME_KEY = "hwaflow.theme.v1";
export const THEME_COLOR = { light: "#F6F3EA", dark: "#0C0C0D" } as const;
```

```tsx
// app/layout.tsx
import { THEME_KEY, THEME_COLOR } from "@/lib/theme-contract";

const THEME_BOOTSTRAP =
  `(function(){try{var d=document.documentElement;` +
  `var p=localStorage.getItem(${JSON.stringify(THEME_KEY)});` +
  `var t=(p==="light"||p==="dark")?p:(window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light");` +
  `d.dataset.theme=t;d.style.colorScheme=t;` +
  `var m=document.querySelector('meta[name="theme-color"]');` +
  `if(m)m.setAttribute("content",t==="dark"?${JSON.stringify(THEME_COLOR.dark)}:${JSON.stringify(THEME_COLOR.light)});` +
  `}catch(e){document.documentElement.dataset.theme="light";}` +
  `document.documentElement.classList.add("js");})();`;
```

`lib/theme.ts` then imports `THEME_KEY`/`THEME_COLOR` from the contract module and re-exports nothing new, which keeps the string in exactly one place.

### WR-03: Header and footer section links are dead on the 404 page

**File:** `components/site-footer.tsx:5-9,36`; `components/site-header.tsx:9-13`; consumed by `app/not-found.tsx:16,37`

**Issue:** `productLinks` and the header `links` use bare fragments (`#product`, `#pipeline`, `#team`). `SiteFooter`/`SiteHeader` are only rendered by `app/page.tsx` (which has those anchors) and `app/not-found.tsx` (which has none — `#product`/`#team` only exist on `/`). On a 404, every "Explore" link and every primary nav link does nothing (the browser appends the hash to `/404` and stays put). `app/not-found.tsx:25,31,32` already uses the correct `/#product` form, which shows the intended pattern.

**Why it matters:** The 404 page is the one page where navigation is the entire job. Its header and footer are the two most prominent navigation surfaces, and both are inert.

**Fix:** Make the shared links absolute fragments (`/#product`, `/#pipeline`, `/#team`) exactly as `app/not-found.tsx` does, or make the arrays a function of the current route. Absolute fragments work on `/` as well (the browser scrolls to the in-page anchor).

### WR-04: `ThemeToggle` announces the wrong action and exposes no state

**File:** `components/theme-toggle.tsx:15-21`

**Issue:** The button always has `aria-label="Toggle dark mode"` and `title="Toggle dark mode"`, regardless of the current theme, and has no `aria-pressed`. In dark mode the accessible name says "Toggle dark mode" for a control that switches to light. The icon swap is CSS-only (`.theme-toggle-sun`/`-moon`, `globals.css:801-816`), and both icons are `aria-hidden`, so the accessible name is the only signal — and it is static. `useTheme()` already returns `theme`; `ThemeToggle` destructures only `toggle`.

**Why it matters:** A screen-reader user cannot determine the current theme or what pressing the button will do. This is a new control added to three shells (landing header ×2, dashboard topbar, admin topbar), so the defect is multiplied.

**Fix:**

```tsx
const { theme, toggle } = useTheme();
const next = theme === "dark" ? "light" : "dark";

<button
  type="button"
  onClick={toggle}
  aria-label={`Switch to ${next} theme`}
  title={`Switch to ${next} theme`}
  aria-pressed={theme === "dark"}
  …
>
```

(If `aria-pressed` is used, drop the label's verb and use a stable name: `aria-label="Dark theme"` + `aria-pressed`.)

### WR-05: `NotFoundState` shows "404 · Missing" for permission-denied and other in-app states

**File:** `components/not-found-state.tsx:38`

**Issue:** The kicker is hardcoded to `404 · Missing`, but the component is used for a 403-style state (`series-view.tsx:45-56`, `accessDenied` → "No access to this series"), a group-access state (`group-detail-view.tsx:128-135`, "You may not have access, or this group was removed"), and three different entity-missing states. Only the route-level `/not-found` is actually a 404.

**Why it matters:** A user who lacks permission is told the resource is "Missing / 404", which is factually wrong and encourages them to retry a link that will never work. The series state in particular distinguishes "not found" from "no access" in its title, then contradicts itself in the kicker.

**Fix:** Make the kicker a prop with a sane default:

```tsx
type NotFoundStateProps = {
  …
  kicker?: string; // default "404 · Missing"
};
…
<p className="notfound-kicker">{kicker}</p>
```

Then pass `kicker="403 · No access"` from `series-view.tsx`, `group-detail-view.tsx` and `admin/group-detail.tsx` when the state is an authorization failure, and `kicker="Missing"` where the entity is simply gone.

### WR-06: `@vercel/speed-insights` added but never used

**File:** `package.json:13`

**Issue:** `"@vercel/speed-insights": "^2.0.0"` (and its lockfile entry) were added, but there is no `import { SpeedInsights }` anywhere in the repo — not in `app/layout.tsx`, not in any route. The package is dead weight.

**Why it matters:** It adds a dependency (install time, supply-chain surface, audit noise) with zero functionality, and it implies telemetry is being collected when it is not. Either state is a defect: if the intent was to enable it, the work is incomplete; if not, the dependency should not be in the diff.

**Fix:** Either wire it up in the root layout:

```tsx
import { SpeedInsights } from "@vercel/speed-insights/next";
…
<body>
  …
  <SpeedInsights />
</body>
```

or remove it from `package.json` and the lockfile.

### WR-07: Access-matrix highlight is mouse-only, and the copy asks for hover

**File:** `components/team.tsx:138,142-166`

**Issue:** The role rows are plain `<div>`s with `onMouseEnter` / `onMouseLeave` only — no `tabIndex`, no focus handlers, no keyboard equivalent. The section copy explicitly instructs "Hover a role to see what it can do." (`team.tsx:138`).

**Why it matters:** Keyboard and touch users never see the column highlight, and the copy tells them to perform an action they cannot perform with their input device. The matrix data itself remains readable (all values are always rendered), so this is not information loss — but it is a hover-only affordance in a codebase that otherwise uses `@media (hover: hover) and (pointer: fine)` guards and real buttons for interactive rows.

**Fix:** Use real buttons for the role rows and drive state from both pointer and focus:

```tsx
<button
  type="button"
  className="role-row"
  data-active={active === index}
  onMouseEnter={() => setActive(index)}
  onFocus={() => setActive(index)}
  onBlur={() => setActive(null)}
  aria-pressed={active === index}
>
```

and change the copy to "Select a role to see what it can do." Keep the `.role-ladder` `onMouseLeave` reset.

---

## Info

### IN-01: Dead CSS left behind by the `NotFoundState` / hero refactors

**File:** `app/chapters/chapters.css:1520-1543`; `app/series/series.css:302-330`; `app/groups/groups.css:739-766`; `app/admin/admin.css:1623-1647`; `app/globals.css:891-919`; `app/globals.css:854`

**Issue:** These class families have no remaining JSX references (verified across all `.tsx`):
`.ch-notfound*`, `.sr-notfound*`, `.grp-notfound*`, `.admin-notfound*` (all replaced by `NotFoundState`, which is styled in `landing.css`), `.speech-bubble*` (no consumer), and `.hero-wash` (the `<div className="hero-wash">` was deleted from `hero.tsx`).

**Fix:** Delete them. `.speech-bubble` is additionally broken in dark mode (fixed `--ink` on `--surface`, same class as CR-01) — resurrecting it as-is would ship an invisible bubble.

### IN-02: Neutralised rules left as empty bodies with `display: none`

**File:** `app/admin/admin.css:15-24`; scattered through `app/(auth)/auth.css`, `app/dashboard/dashboard.css`, `app/settings/settings.css`, `app/series/series.css`

**Issue:** The refactor replaced decorative declarations (radial gradients, gradients, blur) with blank lines plus `display: none`, leaving rules such as:

```css
.admin-shell::before {
  content: "";
  position: fixed;
  inset: 0;
  z-index: -1;
  pointer-events: none;


  display: none;
}
```

The same pattern repeats for the auth glow layers. The elements still exist in the DOM, still get a pseudo-element, and still get `position: fixed; inset: 0` — all for no visual result.

**Fix:** Remove the rule (and the corresponding empty element/pseudo-element) rather than disabling it in place. If the decorative layer is meant to come back, keep it off with a comment explaining why, not a bare `display: none` after blank lines.

### IN-03: `PanelArt.showFigure` is a dead prop

**File:** `components/panel-art.tsx:8,12,91`

**Issue:** `showFigure = true` is never overridden at any call site (`workspace-preview.tsx:154,205` are the only consumers), so the `showFigure ? … : null` branch at line 91 is unreachable.

**Fix:** Remove the prop and the conditional, or pass it where the figure is not wanted. Keeping an unreachable branch in a presentational component is a maintenance trap.

### IN-04: `lib/theme.ts` exports eight symbols that nothing consumes

**File:** `lib/theme.ts:19-79,88,133`

**Issue:** Only `useTheme` is imported (by `theme-toggle.tsx`). `THEME_KEY`, `THEME_EVENT`, `getStoredPreference`, `systemTheme`, `resolveTheme`, `applyTheme`, `setPreference` are used only inside the module, yet all are exported. `useTheme` also returns `ready`, which `ThemeToggle` never reads. There is no ESLint config in the repo and `noUnusedLocals` is off in `tsconfig.json`, so none of this is caught by tooling.

**Fix:** Drop the `export` keyword from the internal helpers (or keep `THEME_KEY`/`THEME_COLOR` exported only if WR-02's fix imports them), and either use `ready` to disable the toggle until the theme is known or stop returning it.

### IN-05: Throwaway `app/theme-preview` route is present in the change set

**File:** `app/theme-preview/page.tsx`, `app/theme-preview/layout.tsx`, `app/theme-preview/preview.css`, `app/theme-preview/preview-toggle.tsx`

**Issue:** A complete alternate landing design ships as a public route. It is self-contained (tokens scoped under `.lt`, `robots: { index: false, follow: false }`) and its own UI says "not linked, safe to delete". It is not linked from anywhere.

**Fix:** Confirm this is intentionally kept in the branch; otherwise delete the folder before merge. If it stays, note it in `docs/ARCHITECTURE.md` next to the `data-temp="theme-review"` toggle so the next cleanup pass knows both are disposable.

### IN-06: "Back to top" uses an up-right arrow and targets `#main`

**File:** `components/site-footer.tsx:60-63`

**Issue:** The control reads "Back to top", renders `ArrowUpRight` (a diagonal external-link arrow), and links to `#main` — which scrolls to the start of `<main>`, not the top of the document (the header sits above it, and `#main` excludes the header's own height).

**Fix:** Use an up arrow icon (`ArrowUp`) and either `href="#top"` with an `id="top"` on the document root wrapper or a `scrollTo({ top: 0 })` button. At minimum, the icon should match the action.

---

_Reviewed: 2026-10-24_
_Reviewer: gsd-code-reviewer_
_Depth: deep_
