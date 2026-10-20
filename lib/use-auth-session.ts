"use client";

import { useEffect, useState } from "react";
import { getSession, subscribeAuth, type AuthUser } from "./auth";

/**
 * Reads the browser-local session after mount (so SSR and hydration agree)
 * and keeps every consumer in sync when signing in or out.
 */
export function useAuthSession() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setUser(getSession());
    setReady(true);
    return subscribeAuth(() => setUser(getSession()));
  }, []);

  return { user, ready };
}
