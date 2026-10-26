/**
 * Signed URLs for private Storage buckets.
 *
 * Every image read in the app goes through this module. Buckets are private,
 * so a row stores an object path and the page mints a short-lived URL per
 * render. Batch calls keep a roster of avatars to one round trip.
 */

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

const SIGNED_URL_TTL_SECONDS = 60 * 60;
const BATCH_SIZE = 100;

export type StorageBucket = "group-icons" | "covers" | "pages" | "renders";

export async function signedUrlFor(
  client: SupabaseClient,
  bucket: StorageBucket,
  path: string | null | undefined
): Promise<string | null> {
  if (!path) return null;

  const { data, error } = await client.storage
    .from(bucket)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);

  if (error || !data) return null;
  return data.signedUrl;
}

/**
 * Signs many paths at once and returns `path -> url`. Missing or unreadable
 * objects are omitted, so callers fall back to a monogram instead of failing
 * the whole page.
 */
export async function signedUrlMap(
  client: SupabaseClient,
  bucket: StorageBucket,
  paths: Array<string | null | undefined>
): Promise<Map<string, string>> {
  const unique = Array.from(
    new Set(paths.filter((path): path is string => Boolean(path)))
  );
  const urls = new Map<string, string>();

  for (let index = 0; index < unique.length; index += BATCH_SIZE) {
    const chunk = unique.slice(index, index + BATCH_SIZE);
    const { data, error } = await client.storage
      .from(bucket)
      .createSignedUrls(chunk, SIGNED_URL_TTL_SECONDS);

    if (error || !data) continue;

    for (const item of data) {
      if (item.path && item.signedUrl) urls.set(item.path, item.signedUrl);
    }
  }

  return urls;
}
