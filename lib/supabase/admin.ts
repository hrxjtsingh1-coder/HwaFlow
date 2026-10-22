/**
 * Privileged Supabase client — bypasses RLS.
 *
 * `server-only` is a build-time guard, not a comment: importing this module
 * from a client component fails the build instead of shipping the secret key
 * to the browser. Supabase also refuses secret keys from browsers at request
 * time, but that is a second net, not the first.
 *
 * Use only for operations that cannot be expressed as a policy:
 *   - platform-admin writes (create group, transfer ownership, deactivate user)
 *   - auth admin (create user, reset password — no email flow exists)
 *   - seeding and one-off maintenance
 *
 * Anything a signed-in user does on their own behalf must go through the
 * publishable-key client so RLS stays the boundary.
 */

import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

export function createAdminClient() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;

  const missing: string[] = [];
  if (!url) missing.push("SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL)");
  if (!secretKey) missing.push("SUPABASE_SECRET_KEY");

  if (missing.length > 0) {
    throw new Error(
      `Missing Supabase environment variable${missing.length > 1 ? "s" : ""}: ` +
        `${missing.join(", ")}. Add them to .env.local (server-only, never ` +
        `NEXT_PUBLIC_) and restart the dev server.`
    );
  }

  if (process.env.NEXT_PUBLIC_SUPABASE_SECRET_KEY) {
    throw new Error(
      "SUPABASE_SECRET_KEY is also set as NEXT_PUBLIC_SUPABASE_SECRET_KEY. " +
        "Delete the NEXT_PUBLIC_ copy — anything prefixed that way is inlined " +
        "into the browser bundle."
    );
  }

  return createSupabaseClient(url as string, secretKey as string, {
    auth: {
      // A service client has no user to persist and no token to refresh.
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
