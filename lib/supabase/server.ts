/**
 * Server Supabase client — server components, route handlers, server actions.
 *
 * Create a new client per request; never cache one across requests. The session
 * is read from the request cookies via `@supabase/ssr`, which is why the same
 * browser session works in RSC and in route handlers.
 */

import "server-only";

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

import { supabasePublicConfig } from "./env";

export async function createClient() {
  const { url, publishableKey } = supabasePublicConfig();

  // Next 16: `cookies()` is async. The pre-15 synchronous call fails here.
  const cookieStore = await cookies();

  return createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          /*
           * Called from a Server Component, where cookies are read-only.
           * Safe to swallow: `proxy.ts` refreshes the session on every request,
           * so the token still gets written to the response there. Removing
           * this catch turns every RSC render into a crash on token refresh.
           */
        }
      },
    },
  });
}
