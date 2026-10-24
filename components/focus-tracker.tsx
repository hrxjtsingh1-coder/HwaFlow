"use client";

/**
 * Session time, counted once for the whole app.
 *
 * Mounted in the root layout so every signed-in surface counts, not just the
 * dashboard. Totals live in `focus_time` (one row per member per day), so the
 * counter survives a refresh, a second device, and signing out.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

/** Seconds shipped to the server per request. A tick is one second. */
const FLUSH_SECONDS = 30;

type FocusState = {
  /** Active seconds today, earlier sessions included. */
  todaySeconds: number;
  /** Active seconds since this tab loaded. */
  sessionSeconds: number;
  /** Visible and focused, so the tick is running right now. */
  tracking: boolean;
};

type FocusDay = { day: string; seconds: number };

const FocusContext = createContext<FocusState>({
  todaySeconds: 0,
  sessionSeconds: 0,
  tracking: false,
});

/** Today in the viewer's own timezone — the key `focus_time` rows use. */
export function dayKey(date = new Date()): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function useFocus(): FocusState {
  return useContext(FocusContext);
}

export function FocusTracker({ children }: { children: ReactNode }) {
  const [todaySeconds, setTodaySeconds] = useState(0);
  const [sessionSeconds, setSessionSeconds] = useState(0);
  const [focused, setFocused] = useState(false);
  // null until the seed request settles: public pages never start the tick.
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const pending = useRef(0);

  /*
   * Ship whatever this tab counted since the last request. `beacon` is for the
   * paths where the page is going away and a normal fetch would be cancelled.
   */
  const flush = useCallback((beacon = false) => {
    const seconds = pending.current;
    if (seconds <= 0) return;
    pending.current = 0;

    const body = JSON.stringify({ day: dayKey(), seconds });
    if (beacon && navigator.sendBeacon) {
      navigator.sendBeacon(
        "/api/focus-time",
        new Blob([body], { type: "application/json" })
      );
      return;
    }

    void fetch("/api/focus-time", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { total?: number } | null) => {
        // The RPC answers with the day's stored total, so time logged by an
        // earlier session or another tab is adopted rather than counted twice.
        const total = typeof data?.total === "number" ? data.total : 0;
        setTodaySeconds((value) => Math.max(value, total));
      })
      .catch(() => {
        // Offline: the next tick carries on counting from here.
      });
  }, []);

  // Resume today's stored total before the first tick, so the counter picks up
  // where the last session left off instead of restarting at zero.
  useEffect(() => {
    let cancelled = false;

    void fetch("/api/focus-time", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { days?: FocusDay[] } | null) => {
        if (cancelled) return;
        setSignedIn(Boolean(data?.days));
        const today = dayKey();
        setTodaySeconds(
          data?.days?.find((entry) => entry.day === today)?.seconds ?? 0
        );
      })
      .catch(() => {
        if (!cancelled) setSignedIn(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // A hidden or closed tab still reports what it counted.
  useEffect(() => {
    if (signedIn !== true) return;

    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush(true);
    };
    const onBlur = () => flush();
    const onPageHide = () => flush(true);

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [signedIn, flush]);

  // Focused means the tab is visible *and* the window has focus.
  useEffect(() => {
    const sync = () =>
      setFocused(
        document.visibilityState === "visible" && document.hasFocus()
      );

    sync();
    window.addEventListener("focus", sync);
    window.addEventListener("blur", sync);
    document.addEventListener("visibilitychange", sync);
    return () => {
      window.removeEventListener("focus", sync);
      window.removeEventListener("blur", sync);
      document.removeEventListener("visibilitychange", sync);
    };
  }, []);

  const tracking = signedIn === true && focused;

  useEffect(() => {
    if (!tracking) return;
    const id = window.setInterval(() => {
      setSessionSeconds((value) => value + 1);
      setTodaySeconds((value) => value + 1);
      pending.current += 1;
      if (pending.current >= FLUSH_SECONDS) flush();
    }, 1000);
    return () => {
      window.clearInterval(id);
      // Leaving a page mid-tick should not throw away the seconds since the
      // last flush.
      flush();
    };
  }, [tracking, flush]);

  const value = useMemo(
    () => ({ todaySeconds, sessionSeconds, tracking }),
    [todaySeconds, sessionSeconds, tracking]
  );

  return <FocusContext.Provider value={value}>{children}</FocusContext.Provider>;
}
