"use client";

/**
 * Light / dark theme preference.
 *
 * The first visit follows the operating system. The moment someone presses
 * the toggle we store an explicit choice, which then wins everywhere —
 * including the marketing pages, so the site never flips theme mid-journey.
 *
 * The stored value is read once before paint by an inline script in
 * `app/layout.tsx`; this module is the runtime half of the same contract.
 */

import { useEffect, useState } from "react";
import {
  THEME_COLOR,
  THEME_KEY,
  type Theme,
} from "./theme-contract";

export type { Theme };
export type ThemePreference = Theme | "system";

/** Viewport-space origin for the circle reveal. */
export type ThemeToggleOrigin = {
  /** Centre of the pressed toggle, in viewport pixels. */
  x: number;
  y: number;
  /** Radius that already covers the toggle, so the reveal starts behind it. */
  startRadius: number;
};

export const THEME_EVENT = "hwaflow:theme";

// Each frame repaints a full-page snapshot, so the reveal keeps a tight budget.
const REVEAL_MS = 320;
const REVEAL_EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

/*
 * Tokens an in-flight reveal. A second toggle owns the screen, so an older
 * transition must not lift the freeze from under the newer one.
 */
let revealToken = 0;

export function getStoredPreference(): ThemePreference {
  if (typeof window === "undefined") return "system";

  try {
    const raw = window.localStorage.getItem(THEME_KEY);
    return raw === "light" || raw === "dark" ? raw : "system";
  } catch {
    return "system";
  }
}

export function systemTheme(): Theme {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function resolveTheme(preference: ThemePreference): Theme {
  return preference === "system" ? systemTheme() : preference;
}

/** Paint the theme: attribute, native form controls, browser chrome. */
export function applyTheme(theme: Theme): void {
  if (typeof document === "undefined") return;

  const root = document.documentElement;
  root.dataset.theme = theme;
  root.style.colorScheme = theme;

  /*
   * There is one meta per OS preference (see `viewport` in app/layout.tsx);
   * the browser picks whichever matches. An explicit choice has to win over
   * that, so every entry is rewritten to the chosen colour.
   */
  document
    .querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')
    .forEach((meta) => {
      meta.content = THEME_COLOR[theme];
    });
}

export function setPreference(preference: ThemePreference): void {
  if (typeof window === "undefined") return;

  try {
    if (preference === "system") {
      window.localStorage.removeItem(THEME_KEY);
    } else {
      window.localStorage.setItem(THEME_KEY, preference);
    }
  } catch {
    // A blocked localStorage must not break the page.
  }

  applyTheme(resolveTheme(preference));
  window.dispatchEvent(new Event(THEME_EVENT));
}

/**
 * `theme` is the resolved value that is actually on screen.
 * `preference` keeps "system" until the person makes an explicit choice.
 */
export function useTheme() {
  const [preference, setPref] = useState<ThemePreference>("system");
  const [theme, setTheme] = useState<Theme>("light");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const sync = () => {
      const nextPreference = getStoredPreference();
      setPref(nextPreference);
      setTheme(resolveTheme(nextPreference));
      setReady(true);
    };

    // The inline script already painted the right theme; adopt it.
    const painted = document.documentElement.dataset.theme;
    if (painted === "light" || painted === "dark") {
      setTheme(painted);
      setPref(getStoredPreference());
      setReady(true);
    } else {
      sync();
    }

    window.addEventListener(THEME_EVENT, sync);
    window.addEventListener("storage", sync);

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onSystemChange = () => {
      if (getStoredPreference() !== "system") return;
      applyTheme(systemTheme());
      sync();
    };
    media.addEventListener("change", onSystemChange);

    return () => {
      window.removeEventListener(THEME_EVENT, sync);
      window.removeEventListener("storage", sync);
      media.removeEventListener("change", onSystemChange);
    };
  }, []);

  /**
   * Flip the theme. When the caller passes the pressed toggle's position and
   * the browser supports same-document view transitions, the incoming theme
   * is revealed through a circle that grows out from underneath that button.
   * Everything else (reduced motion, unsupported browsers) takes the instant
   * path, so the preference and first-paint contract never change.
   */
  const toggle = (origin?: ThemeToggleOrigin) => {
    // Prefer the painted value over React state: the DOM attribute is the
    // source of truth if a storage event changed the theme while this
    // component's state was still catching up.
    const painted =
      typeof document === "undefined"
        ? undefined
        : document.documentElement.dataset.theme;
    const current: Theme =
      painted === "light" || painted === "dark" ? painted : theme;
    const next: Theme = current === "dark" ? "light" : "dark";

    const commit = () => {
      setPreference(next);
      setPref(next);
      setTheme(next);
    };

    if (
      !origin ||
      typeof document === "undefined" ||
      typeof document.startViewTransition !== "function" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      commit();
      return;
    }

    const endRadius = Math.hypot(
      Math.max(origin.x, window.innerWidth - origin.x),
      Math.max(origin.y, window.innerHeight - origin.y)
    );

    const root = document.documentElement;
    const token = ++revealToken;
    // Freeze colour transitions while the snapshots are taken: otherwise the
    // incoming snapshot captures their old values and the page pops at the end.
    root.dataset.themeReveal = "";
    const unfreeze = () => {
      if (token === revealToken) delete root.dataset.themeReveal;
    };

    const transition = document.startViewTransition(commit);

    // An interrupted transition rejects both promises. The newer toggle owns
    // the screen, so there is nothing to recover.
    transition.finished.then(unfreeze, unfreeze);

    transition.ready
      .then(() => {
        document.documentElement.animate(
          {
            clipPath: [
              `circle(${origin.startRadius}px at ${origin.x}px ${origin.y}px)`,
              `circle(${endRadius}px at ${origin.x}px ${origin.y}px)`,
            ],
          },
          {
            duration: REVEAL_MS,
            easing: REVEAL_EASE,
            pseudoElement: "::view-transition-new(root)",
          }
        );
      })
      .catch(() => {
        // `ready` also rejects when a newer toggle skips this transition.
        unfreeze();
      });
  };

  return { theme, preference, ready, toggle };
}
