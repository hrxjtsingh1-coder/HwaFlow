"use client";

import { useEffect, useState } from "react";
import {
  getNotificationsState,
  subscribeNotifications,
  type NotificationsState,
} from "./notifications";

/**
 * Reads the browser-local notifications store after mount (so SSR and
 * hydration agree) and keeps every consumer in sync across components, tabs
 * and same-tab writes.
 */
export function useNotifications() {
  const [state, setState] = useState<NotificationsState | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setState(getNotificationsState());
    setReady(true);
    return subscribeNotifications(() => setState(getNotificationsState()));
  }, []);

  return { state, ready };
}
