/**
 * Browser-local notifications store.
 *
 * One localStorage key keeps every notification write atomic. Records are
 * per-recipient so the dashboard bell only reads what belongs to the signed-in
 * account. This mirrors the future `notifications` table:
 *
 *   AppNotification -> public.notifications
 *
 * The store deliberately has no dependency on groups or series; those modules
 * call `pushNotification` with the copy they want.
 */

import { normalizeUsername } from "./auth";

export type NotificationTone = "mint" | "lavender" | "peach" | "sky";

export type AppNotification = {
  id: string;
  username: string;
  kind: "series-assigned";
  title: string;
  body: string;
  href: string | null;
  tone: NotificationTone;
  read: boolean;
  createdAt: string;
};

export type NotificationsState = {
  version: 1;
  items: AppNotification[];
};

const NOTIFICATIONS_KEY = "hwaflow.notifications.v1";
const NOTIFICATIONS_EVENT = "hwaflow:notifications";

/* ------------------------------------------------------------------ */
/* Storage                                                             */
/* ------------------------------------------------------------------ */

function canUseStorage(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const probe = "__hwaflow_notifications_probe__";
    window.localStorage.setItem(probe, "1");
    window.localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

function emptyState(): NotificationsState {
  return { version: 1, items: [] };
}

export function getNotificationsState(): NotificationsState {
  if (!canUseStorage()) return emptyState();
  try {
    const raw = window.localStorage.getItem(NOTIFICATIONS_KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw) as Partial<NotificationsState> | null;
    if (!parsed || typeof parsed !== "object") return emptyState();
    return {
      version: 1,
      items: Array.isArray(parsed.items) ? parsed.items : [],
    };
  } catch {
    return emptyState();
  }
}

function writeState(state: NotificationsState): void {
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(state));
  } catch {
    // Notifications are a nicety. Never break the action that produced them.
    return;
  }
  notifyNotificationsChange();
}

function notifyNotificationsChange(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(NOTIFICATIONS_EVENT));
}

export function subscribeNotifications(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};

  const onStorage = (event: StorageEvent) => {
    if (!event.key || event.key === NOTIFICATIONS_KEY) listener();
  };

  window.addEventListener(NOTIFICATIONS_EVENT, listener);
  window.addEventListener("storage", onStorage);

  return () => {
    window.removeEventListener(NOTIFICATIONS_EVENT, listener);
    window.removeEventListener("storage", onStorage);
  };
}

function createId(): string {
  if (typeof window !== "undefined" && "randomUUID" in window.crypto) {
    return window.crypto.randomUUID();
  }
  const bytes = new Uint8Array(12);
  if (typeof window !== "undefined") {
    window.crypto.getRandomValues(bytes);
  }
  const hex = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
  return `n_${hex}`;
}

/* ------------------------------------------------------------------ */
/* Reads                                                               */
/* ------------------------------------------------------------------ */

export function listNotificationsFor(username: string): AppNotification[] {
  const normalized = normalizeUsername(username);
  if (!normalized) return [];
  return getNotificationsState()
    .items.filter((item) => item.username === normalized)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function unreadCountFor(username: string): number {
  return listNotificationsFor(username).filter((item) => !item.read).length;
}

/* ------------------------------------------------------------------ */
/* Writes                                                              */
/* ------------------------------------------------------------------ */

export type PushNotificationInput = {
  username: string;
  kind: AppNotification["kind"];
  title: string;
  body: string;
  href?: string | null;
  tone?: NotificationTone;
};

export function pushNotification(input: PushNotificationInput): void {
  const username = normalizeUsername(input.username);
  if (!username) return;

  const state = getNotificationsState();
  const notification: AppNotification = {
    id: createId(),
    username,
    kind: input.kind,
    title: input.title,
    body: input.body,
    href: input.href ?? null,
    tone: input.tone ?? "lavender",
    read: false,
    createdAt: new Date().toISOString(),
  };

  writeState({ ...state, items: [notification, ...state.items] });
}

export function markNotificationRead(id: string, username: string): void {
  const normalized = normalizeUsername(username);
  const state = getNotificationsState();
  let changed = false;

  const items = state.items.map((item) => {
    if (item.id === id && item.username === normalized && !item.read) {
      changed = true;
      return { ...item, read: true };
    }
    return item;
  });

  if (changed) writeState({ ...state, items });
}

export function markAllNotificationsRead(username: string): void {
  const normalized = normalizeUsername(username);
  const state = getNotificationsState();
  let changed = false;

  const items = state.items.map((item) => {
    if (item.username === normalized && !item.read) {
      changed = true;
      return { ...item, read: true };
    }
    return item;
  });

  if (changed) writeState({ ...state, items });
}
