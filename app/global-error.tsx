"use client";

/**
 * Last line of defence: only rendered when the root layout itself throws, so it
 * must ship its own <html> and <body> and cannot rely on globals.css tokens.
 */

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "grid",
          placeItems: "center",
          padding: "2rem",
          background: "#F6F3EA",
          color: "#17171A",
          fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif",
        }}
      >
        <main style={{ maxWidth: "34rem" }}>
          <h1 style={{ fontSize: "1.5rem", margin: "0 0 0.6rem" }}>
            HwaFlow couldn&apos;t start.
          </h1>
          <p style={{ lineHeight: 1.55, color: "#4A4A50", margin: "0 0 1.2rem" }}>
            Something failed before the page could load. Reloading usually fixes
            it; nothing you saved has been lost.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              padding: "0.6rem 1rem",
              border: "2px solid #17171A",
              borderRadius: "8px",
              background: "#17171A",
              color: "#F6F3EA",
              fontSize: "0.85rem",
              cursor: "pointer",
            }}
          >
            Reload
          </button>
          {error.digest ? (
            <p style={{ marginTop: "1rem", fontSize: "0.75rem", color: "#6A6A70" }}>
              Reference: {error.digest}
            </p>
          ) : null}
        </main>
      </body>
    </html>
  );
}
