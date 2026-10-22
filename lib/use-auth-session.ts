"use client";

import { useEffect, useState } from "react";

import type { AuthUser } from "./auth";

/**
 * Who is signed in, for client components.
 *
 * The session lives in an httpOnly cookie, so the browser cannot read it
 * directly. The first consumer on a page fetches `/api/auth/viewer`; every
 * other consumer shares that result through a module-level cache. Sign-in and
 * sign-out do a full page load, so the cache never outlives its session.
 */

type Snapshot = { user: AuthUser | null; ready: boolean };

let snapshot: Snapshot = { user: null, ready: false };
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function publish(next: Snapshot) {
  snapshot = next;
  for (const listener of listeners) listener();
}

function load(): Promise<void> {
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const response = await fetch("/api/auth/viewer", {
        cache: "no-store",
        headers: { accept: "application/json" },
        // A stalled endpoint must not leave every shell on its loading state
        // forever. Failing closed (signed out) is recoverable; spinning is not.
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw new Error(`viewer ${response.status}`);
      const body = (await response.json()) as { user?: AuthUser | null };
      publish({ user: body.user ?? null, ready: true });
    } catch {
      // A failed lookup means "not signed in" for rendering purposes. The
      // proxy still blocks protected routes, so this cannot be used to bypass
      // anything.
      publish({ user: null, ready: true });
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

export function useAuthSession() {
  const [state, setState] = useState<Snapshot>(snapshot);

  useEffect(() => {
    const listener = () => setState(snapshot);
    listeners.add(listener);

    // The effect runs after mount, so this never disagrees with SSR.
    listener();
    if (!snapshot.ready) void load();

    return () => {
      listeners.delete(listener);
    };
  }, []);

  return state;
}
