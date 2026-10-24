"use client";

import Link from "next/link";
import { useEffect } from "react";

type ErrorStateProps = {
  error: Error & { digest?: string };
  reset: () => void;
  /** Tag for the console line, e.g. "groups". */
  scope: string;
  title: string;
  copy: string;
  /** Where "go back" points. Defaults to the dashboard. */
  backHref?: string;
  backLabel?: string;
  /**
   * The admin shell already draws `<main id="main">`, so its boundary renders
   * content only. Every other segment owns its chrome, so it draws the page.
   */
  framed?: boolean;
};

/**
 * One error surface for every segment: what broke, what is still safe, and two
 * ways out. Nothing here is stateful, so it survives the crash that drew it.
 */
export function ErrorState({
  error,
  reset,
  scope,
  title,
  copy,
  backHref = "/dashboard",
  backLabel = "Dashboard",
  framed = true,
}: ErrorStateProps) {
  useEffect(() => {
    console.error(`[HwaFlow] ${scope} crash:`, error);
  }, [error, scope]);

  const body = (
    <>
      <p className="eyebrow">Something broke</p>
      <h1 className="error-title">{title}</h1>
      <p className="error-copy">{copy}</p>
      <div className="error-actions">
        <button type="button" className="btn btn-primary" onClick={reset}>
          Try again
        </button>
        <Link href={backHref} className="btn btn-ghost">
          {backLabel}
        </Link>
        {backHref === "/dashboard" ? null : (
          <Link href="/dashboard" className="btn btn-ghost">
            Dashboard
          </Link>
        )}
      </div>
      {error.digest ? (
        <p className="error-digest">Reference: {error.digest}</p>
      ) : null}
    </>
  );

  if (!framed) return <div className="error-page">{body}</div>;

  return (
    <main className="error-page" id="main">
      {body}
    </main>
  );
}
