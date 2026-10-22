/**
 * Notification shapes.
 *
 * Storage moved to Supabase (`public.notifications`); this module keeps only the
 * types the UI shares. Reads live in `lib/server/notifications.ts` and writes in
 * `lib/notification-actions.ts`.
 */

export type NotificationTone = "mint" | "lavender" | "peach" | "sky";

export type AppNotification = {
  id: string;
  userId: string;
  kind: string;
  title: string;
  body: string;
  href: string | null;
  tone: NotificationTone;
  read: boolean;
  createdAt: string;
};
