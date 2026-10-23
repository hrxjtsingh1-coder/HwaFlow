/**
 * Paginated reads for tables that can outgrow PostgREST's row cap.
 *
 * Supabase answers an unbounded select with at most `db-max-rows` rows (1000 by
 * default) and no error. A dense chapter (150 panels × 8 blocks) and a platform
 * with a few thousand memberships both cross that line silently: the workspace
 * drops the last panels, and `/admin/groups` shows groups with no owner.
 *
 * Every caller supplies its own `range` query, so the select, filters and
 * ordering stay where they are. The helper only walks the pages.
 */

export type PageFetcher<T> = (from: number, to: number) => Promise<T[]>;

const DEFAULT_PAGE_SIZE = 1000;
const MAX_PAGES = 50;

export async function selectAllPages<T>(
  fetchPage: PageFetcher<T>,
  pageSize = DEFAULT_PAGE_SIZE
): Promise<T[]> {
  const size = Math.max(1, Math.floor(pageSize));
  const rows: T[] = [];

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const from = page * size;
    const batch = await fetchPage(from, from + size - 1);
    rows.push(...batch);
    if (batch.length < size) return rows;
  }

  throw new Error(
    `selectAllPages: more than ${MAX_PAGES * size} rows; add a filter instead of paging further`
  );
}
