/**
 * Browser Supabase client.
 *
 * Uses only the publishable key, so every query is subject to RLS as the
 * signed-in user. `@supabase/ssr` persists the session in cookies rather than
 * localStorage, which is what lets server components read the same session.
 */

import "client-only";

import { createBrowserClient } from "@supabase/ssr";

import { supabasePublicConfig } from "./env";

export function createClient() {
  const { url, publishableKey } = supabasePublicConfig();

  // `createBrowserClient` returns a singleton per page by default, so calling
  // this from many components is cheap.
  return createBrowserClient(url, publishableKey);
}
