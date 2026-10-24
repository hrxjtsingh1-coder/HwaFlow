/**
 * The theme contract shared by the pre-paint script in `app/layout.tsx` and the
 * runtime hook in `lib/theme.ts`.
 *
 * Dependency-free and free of `"use client"` on purpose: a server component
 * cannot read a value out of a client module, and the bootstrap string is
 * generated from these constants so the key exists exactly once.
 */

export type Theme = "light" | "dark";

export const THEME_KEY = "hwaflow.theme.v1";

/** Chrome + browser UI colour per theme. Keep in sync with --bg. */
export const THEME_COLOR: Record<Theme, string> = {
  light: "#F6F3EA",
  dark: "#0C0C0D",
};
