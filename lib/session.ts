/**
 * Server-side viewer lookup.
 *
 * `getViewer()` is the only way the app learns who is signed in. It validates
 * the session against the Auth server (`getUser`, not `getSession`, which
 * trusts the cookie blindly) and then reads that user's own profile row — which
 * RLS allows, and only for that row.
 *
 * `server-only` is load-bearing: importing this from a client component would
 * pull `next/headers` into the browser bundle and fail at build time instead of
 * silently shipping a broken client.
 */

import "server-only";

import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { AuthUser } from "./identity";
import { toCurrency } from "./money";
import { createClient } from "./supabase/server";

type ProfileRow = {
  id: string;
  username: string;
  display_name: string;
  is_platform_admin: boolean;
  display_currency: string | null;
};

export function toViewer(row: ProfileRow): AuthUser {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    isPlatformAdmin: row.is_platform_admin,
    displayCurrency: toCurrency(row.display_currency),
  };
}

/**
 * Reads a profile row with an already-authenticated client. Separate from
 * `getViewer` so signup/login can reuse the client they just used and skip a
 * second round trip to the Auth server.
 */
export async function viewerFor(
  client: SupabaseClient,
  userId: string
): Promise<AuthUser | null> {
  const { data, error } = await client
    .from("profiles")
    .select("id, username, display_name, is_platform_admin, display_currency")
    .eq("id", userId)
    .maybeSingle();

  if (error || !data) return null;
  return toViewer(data as ProfileRow);
}

/**
 * The viewer for the current request, validated once.
 *
 * `React.cache` scopes the result to a single request: a page, a layout and
 * every component below them share one `getUser()` round trip and one
 * `profiles` read instead of repeating them per caller. The cache does not
 * outlive the request, so one user's viewer can never be served to another.
 *
 * Outside a render (server actions, route handlers) `cache` is a pass-through,
 * so callers keep the same behaviour they had before.
 */
export const getViewer = cache(async (): Promise<AuthUser | null> => {
  const supabase = await createClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) return null;
  return viewerFor(supabase, user.id);
});
