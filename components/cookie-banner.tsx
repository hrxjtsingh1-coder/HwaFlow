"use client";

import { useEffect, useState } from "react";

/**
 * Consent banner. One decision, stored in localStorage, never shown again.
 *
 * There is no ad or third-party tracker on the site, so "essential only" and
 * "accept all" currently differ only in what we are allowed to measure later —
 * the banner is honest about that instead of implying a choice that does
 * nothing.
 */

const KEY = "hwaflow.cookie-consent.v1";

export function CookieBanner() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      setOpen(window.localStorage.getItem(KEY) === null);
    } catch {
      // Storage blocked: no way to remember a choice, so don't nag.
      setOpen(false);
    }
  }, []);

  const choose = (value: "all" | "essential") => {
    try {
      window.localStorage.setItem(KEY, value);
    } catch {
      // Ignore: the prompt is dismissed for this page either way.
    }
    setOpen(false);
  };

  if (!open) return null;

  return (
    <div
      className="cookie-banner"
      role="dialog"
      aria-labelledby="cookie-title"
      aria-describedby="cookie-copy"
    >
      <p className="cookie-copy" id="cookie-copy">
        <strong id="cookie-title">Cookies.</strong> We use one to keep you
        signed in, plus anonymous speed measurements. No ads, nothing sold.
      </p>

      <div className="cookie-actions">
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => choose("all")}
        >
          Accept all
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => choose("essential")}
        >
          Essential only
        </button>
      </div>
    </div>
  );
}
