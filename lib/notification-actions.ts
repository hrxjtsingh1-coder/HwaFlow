"use server";

/**
 * Notification mutations. RLS scopes every statement to the signed-in user, so
 * the filters here are convenience rather than the security boundary.
 */

import type { AppNotification } from "./notifications";
import {
  countUnreadNotifications,
  listNotifications,
} from "./server/notifications";
import { createClient } from "./supabase/server";

export type NotificationActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; message: string };

/**
 * These actions never read the viewer's profile — RLS already scopes every row
 * to `auth.uid()`. Validating the session is enough, and it saves the extra
 * `profiles` round trip that `getViewer()` makes. This runs after every
 * navigation, so that trip is the difference between a 700 ms and a 400 ms
 * request.
 */
async function requireSession(): Promise<
  { ok: true } | { ok: false; result: { ok: false; message: string } }
> {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return {
      ok: false,
      result: {
        ok: false,
        message: "Your session expired. Sign in again to continue.",
      },
    };
  }
  return { ok: true };
}

export async function listNotificationsAction(): Promise<
  NotificationActionResult<{ items: AppNotification[]; unread: number }>
> {
  const auth = await requireSession();
  if (!auth.ok) return auth.result;

  try {
    const data = await listNotifications();
    return { ok: true, data };
  } catch {
    return { ok: false, message: "Couldn't load notifications." };
  }
}

/**
 * Badge-only read. The top bar calls this on mount; the full list is fetched
 * when the popover opens.
 */
export async function unreadNotificationsAction(): Promise<
  NotificationActionResult<number>
> {
  const auth = await requireSession();
  if (!auth.ok) return auth.result;

  try {
    return { ok: true, data: await countUnreadNotifications() };
  } catch {
    return { ok: false, message: "Couldn't load notifications." };
  }
}

export async function markNotificationReadAction(
  id: string
): Promise<NotificationActionResult<null>> {
  const auth = await requireSession();
  if (!auth.ok) return auth.result;

  const supabase = await createClient();
  // `.select()` makes PostgREST return the rows it touched. Without it an
  // update that matched nothing (deleted, or someone else's id) looks exactly
  // like a success, and the caller clears a badge that is still there.
  const { data, error } = await supabase
    .from("notifications")
    .update({ read: true })
    .eq("id", id)
    .select("id");

  if (error) return { ok: false, message: "Couldn't mark that as read." };

  if (!data || data.length === 0) {
    return { ok: false, message: "That notification is already gone." };
  }

  return { ok: true, data: null };
}

export async function markAllNotificationsReadAction(): Promise<
  NotificationActionResult<null>
> {
  const auth = await requireSession();
  if (!auth.ok) return auth.result;

  const supabase = await createClient();
  const { error } = await supabase
    .from("notifications")
    .update({ read: true })
    .eq("read", false);

  if (error) return { ok: false, message: "Couldn't mark those as read." };
  return { ok: true, data: null };
}
