import { Layers, LayoutGrid } from "../icons";
import type { RailLink } from "./dashboard-rail";

/**
 * The workspace rail is identical on every signed-in surface. Keeping the list
 * in one place means Dashboard / Groups never drift out of order.
 *
 * There is no "Members" entry: member management belongs to one group, so it
 * lives behind the gear on `/groups/[id]`.
 */
export function workspaceLinks(): RailLink[] {
  return [
    {
      key: "overview",
      href: "/dashboard",
      label: "Dashboard",
      icon: LayoutGrid,
    },
    {
      key: "groups",
      href: "/groups",
      label: "Groups",
      icon: Layers,
    },
  ];
}
