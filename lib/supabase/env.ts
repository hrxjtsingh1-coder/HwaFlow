/**
 * Public Supabase configuration, read in both server and browser bundles.
 *
 * Only the publishable key belongs here. It is designed to be shipped to the
 * browser: Row Level Security is what actually protects the data. The secret
 * key lives in `lib/supabase/admin.ts`, which is marked `server-only`.
 *
 * `process.env.NEXT_PUBLIC_*` must be referenced statically (exactly as below)
 * for Next to inline it at build time. `process.env[name]` would be `undefined`
 * in the browser.
 */

export type SupabasePublicConfig = {
  url: string;
  publishableKey: string;
};

export function supabasePublicConfig(): SupabasePublicConfig {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  const missing: string[] = [];
  if (!url) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!publishableKey) missing.push("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");

  if (missing.length > 0) {
    throw new Error(
      `Missing Supabase environment variable${missing.length > 1 ? "s" : ""}: ` +
        `${missing.join(", ")}. Copy the values from the Supabase dashboard ` +
        `(Connect dialog) into .env.local, then restart the dev server. ` +
        `See .env.example.`
    );
  }

  return { url: url as string, publishableKey: publishableKey as string };
}
