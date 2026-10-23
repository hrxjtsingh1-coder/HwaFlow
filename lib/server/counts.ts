/**
 * Row counting for list surfaces.
 *
 * The admin grid and the members page show "3 series" without loading a single
 * title. This keeps that arithmetic in one tested place instead of inline
 * `?? 0` fallbacks, which is how the counts drifted to a hardcoded zero.
 */

export function countByKey<T, K extends keyof T>(
  rows: readonly T[],
  key: K
): Map<T[K], number> {
  const counts = new Map<T[K], number>();
  for (const row of rows) {
    const value = row[key];
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return counts;
}
