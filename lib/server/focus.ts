/**
 * Focus time reads.
 *
 * The dashboard shows a Monday-to-Sunday strip; which local day a row belongs
 * to is decided in the browser (it knows the viewer's timezone), so this module
 * returns the last eight days as they are and the strip looks up the keys it
 * needs. RLS keeps every row to its owner.
 */

import "server-only";

import type { AuthUser } from "../identity";
import { createClient } from "../supabase/server";

export type FocusDay = { day: string; seconds: number };

/** Signed-in seconds per day for the last eight days. */
export async function recentFocusDays(viewer: AuthUser): Promise<FocusDay[]> {
  const supabase = await createClient();

  const since = new Date();
  since.setDate(since.getDate() - 7);

  const { data, error } = await supabase
    .from("focus_time")
    .select("day, seconds")
    .eq("user_id", viewer.id)
    .gte("day", since.toISOString().slice(0, 10));

  if (error) throw new Error(`[focus:recentFocusDays] ${error.message}`);

  return ((data ?? []) as Array<{ day: string; seconds: number }>).map((row) => ({
    day: row.day,
    seconds: Number(row.seconds),
  }));
}
