"use client";

import type { MouseEvent } from "react";
import { useTheme, type ThemeToggleOrigin } from "@/lib/theme";
import { Moon, Sun } from "./icons";

/**
 * Two-state light/dark switch. The icon is driven by the `data-theme`
 * attribute on <html>, which the pre-paint script sets before first paint —
 * so there is no hydration mismatch and no flash.
 *
 * The click position is handed to the theme hook so the new theme can spread
 * out from underneath this button instead of crossfading the whole page.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggle } = useTheme();
  const label =
    theme === "dark" ? "Switch to light mode" : "Switch to dark mode";

  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const origin: ThemeToggleOrigin = {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
      // Half the diagonal covers the corners of the button; the extra 6px
      // clears the 2px border and the hard hover shadow.
      startRadius: Math.hypot(rect.width, rect.height) / 2 + 6,
    };
    toggle(origin);
  };

  return (
    <button
      type="button"
      className={className ? `theme-toggle ${className}` : "theme-toggle"}
      onClick={handleClick}
      aria-label={label}
      title={label}
    >
      <Sun className="theme-toggle-sun" />
      <Moon className="theme-toggle-moon" />
    </button>
  );
}
