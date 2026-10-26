/**
 * Server-side notification reads. RLS returns only the viewer's rows.
 */

import "server-only";

import type { AppNotification, NotificationTone } from "../notifications";
import { createClient } from "../supabase/server";

type NotificationRow = {
  id: string;
  user_id: string;
  kind: string;
  title: string;
  body: string;
  href: string | null;
  tone: NotificationTone;
  read: boolean;
  created_at: string;
};

function mapNotification(row: NotificationRow): AppNotification {
  return {
    id: row.id,
    userId: row.user_id,
    kind: row.kind,
    title: row.title,
    body: row.body,
    href: row.href,
    tone: row.tone,
    read: row.read,
    createdAt: row.created_at,
  };
}

export async function listNotifications(
  limit = 20
): Promise<{ items: AppNotification[]; unread: number }> {
  const supabase = await createClient();

  const [{ data, error }, { count, error: countError }] = await Promise.all([
    supabase
      .from("notifications")
      .select("id, user_id, kind, title, body, href, tone, read, created_at")
      .order("created_at", { ascending: false })
      .limit(limit),
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("read", false),
  ]);

  if (error) throw new Error(`[notifications:list] ${error.message}`);
  if (countError) throw new Error(`[notifications:unread] ${countError.message}`);

  return {
    items: ((data ?? []) as unknown as NotificationRow[]).map(mapNotification),
    unread: count ?? 0,
  };
}

/**
 * The bell only needs this until it is opened. A HEAD request with a count is
 * one small round trip instead of fetching twenty rows the user never sees.
 */
export async function countUnreadNotifications(): Promise<number> {
  const supabase = await createClient();

  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("read", false);

  if (error) throw new Error(`[notifications:unread] ${error.message}`);
  return count ?? 0;
}
