/**
 * Where a finished engine page lives in the private `renders` bucket.
 *
 * `chapter_pages.original_path` is `{group}/{chapter}/{file}.webp` (see
 * `20261023122000_storage_buckets.sql`), and both the `pages` and `renders`
 * policies authorise on exactly those first two folders. The render therefore
 * has to keep the same prefix — only the file name changes.
 *
 * The page id, not the original file name, is what makes the object unique:
 * re-uploading a panel can change its `original_path`, but its row id cannot,
 * so a re-run overwrites the same object instead of piling up orphans.
 */

export function renderObjectPath(originalPath: string, pageId: string): string {
  const trimmed = originalPath.replace(/^\/+/, "").trim();
  const slash = trimmed.lastIndexOf("/");
  const directory = slash > 0 ? trimmed.slice(0, slash) : "";
  const name = `${pageId}.png`;
  return directory ? `${directory}/${name}` : name;
}
