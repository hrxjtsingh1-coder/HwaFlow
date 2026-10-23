"use server";

/**
 * Notification mutations. RLS scopes every statement to the signed-in user, so
 * the filters here are convenience rather than the security boundary.
 */

import type { AppNotification } from "./notifications";
import { getViewer } from "./session";
import { listNotifications } from "./server/notifications";
import { createClient } from "./supabase/server";

export type NotificationActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; message: string };

async function requireViewer() {
  const viewer = await getViewer();
  if (!viewer) {
    return {
      ok: false as const,
      result: {
        ok: false as const,
        message: "Your session expired. Sign in again to continue.",
      },
    };
  }
  return { ok: true as const, viewer };
}

export async function listNotificationsAction(): Promise<
  NotificationActionResult<{ items: AppNotification[]; unread: number }>
> {
  const auth = await requireViewer();
  if (!auth.ok) return auth.result;

  try {
    const data = await listNotifications();
    return { ok: true, data };
  } catch {
    return { ok: false, message: "Couldn't load notifications." };
  }
}

export async function markNotificationReadAction(
  id: string
): Promise<NotificationActionResult<null>> {
  const auth = await requireViewer();
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
  const auth = await requireViewer();
  if (!auth.ok) return auth.result;

  const supabase = await createClient();
  const { error } = await supabase
    .from("notifications")
    .update({ read: true })
    .eq("read", false);

  if (error) return { ok: false, message: "Couldn't mark those as read." };
  return { ok: true, data: null };
}
