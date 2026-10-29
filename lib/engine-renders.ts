/**
 * Where a finished engine page lives in the private `renders` bucket.
 *
 * Original pages use `{group}/{chapter}/{file}.png` (legacy rows may be WebP),
 * and both the `pages` and `renders` policies authorize on those first two
 * folders. The render therefore keeps the same prefix; only its filename changes.
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
