"use client";

import { useEffect, useState } from "react";

import { RETRY_CEILING_MS, retryDelaysMs, sleep } from "./async/retry";
import type { AuthUser } from "./auth";

/**
 * Who is signed in, for client components.
 *
 * The session lives in an httpOnly cookie, so the browser cannot read it
 * directly. The first consumer on a page fetches `/api/auth/viewer`; every
 * other consumer shares that result through a module-level cache. Sign-in and
 * sign-out do a full page load, so the cache never outlives its session.
 *
 * A failed lookup is NOT "signed out". Publishing `user: null` after one
 * timeout bounced a platform admin to /login while their cookie was still
 * valid, and — because the module-level snapshot was already `ready` — nothing
 * ever fetched again until a full reload. So: retry inside the request, then
 * keep the shell in its loading state and re-arm in the background. A genuine
 * 200 with `user: null` is the only thing that means "signed out".
 */

type Snapshot = {
  user: AuthUser | null;
  ready: boolean;
  status: "idle" | "loading" | "ready" | "error";
};

let snapshot: Snapshot = { user: null, ready: false, status: "idle" };
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function publish(next: Snapshot) {
  snapshot = next;
  for (const listener of listeners) listener();
}

function load(): Promise<void> {
  if (inflight) return inflight;

  inflight = (async () => {
    publish({ ...snapshot, status: "loading" });

    const delays = retryDelaysMs();
    for (let attempt = 0; attempt <= delays.length; attempt += 1) {
      try {
        const response = await fetch("/api/auth/viewer", {
          cache: "no-store",
          headers: { accept: "application/json" },
          // A stalled endpoint must not leave every shell on its loading state
          // forever within a single attempt; the loop below decides when to
          // give up and re-arm.
          signal: AbortSignal.timeout(15000),
        });
        if (!response.ok) throw new Error(`viewer ${response.status}`);
        const body = (await response.json()) as { user?: AuthUser | null };
        publish({ user: body.user ?? null, ready: true, status: "ready" });
        return;
      } catch {
        if (attempt < delays.length) await sleep(delays[attempt]);
      }
    }

    // Transient failure: stay in the loading state and let the effect below
    // re-arm. Rendering "signed out" here is what caused the lockout.
    publish({ user: null, ready: false, status: "error" });
  })().finally(() => {
    inflight = null;
  });

  return inflight;
}

export function useAuthSession() {
  const [state, setState] = useState<Snapshot>(snapshot);

  useEffect(() => {
    const listener = () => setState(snapshot);
    listeners.add(listener);

    // The effect runs after mount, so this never disagrees with SSR.
    listener();
    if (snapshot.status !== "ready") void load();

    return () => {
      listeners.delete(listener);
    };
  }, []);

  // Background re-arm after a failed snapshot. Recovers without a reload.
  useEffect(() => {
    if (state.status !== "error") return;
    const timer = window.setTimeout(() => void load(), RETRY_CEILING_MS);
    return () => window.clearTimeout(timer);
  }, [state.status]);

  return state;
}
