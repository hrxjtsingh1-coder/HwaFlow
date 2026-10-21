/**
 * Earnings are always derived from approved work, never stored as a running
 * total (see ARCHITECTURE.md R4). The chapters/approvals module does not exist
 * yet, so every helper returns an honest zero. The signatures stay stable so
 * the chapter module can fill them in without touching the UI.
 *
 *   amount = sum(series.rate_amount) for chapters in scope where
 *            status = 'approved' and approved_at falls in the current month.
 */

export function totalEarningsThisMonth(username: string): number {
  void username;
  return 0;
}

export function approvedChaptersThisMonth(): number {
  return 0;
}

/** Owner-only group stat. */
export function groupEarningsThisMonth(groupId: string): number {
  void groupId;
  return 0;
}

/** Manager/Staff stat: only the viewer's own approved work in this group. */
export function memberEarningsThisMonth(
  groupId: string,
  username: string
): number {
  void groupId;
  void username;
  return 0;
}
