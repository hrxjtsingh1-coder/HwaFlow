import { Layers, LayoutGrid, Users } from "../icons";
import type { RailLink } from "./dashboard-rail";

/**
 * The workspace rail is identical on every signed-in surface. Keeping the list
 * in one place means Groups / Members never drift out of order.
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
    {
      key: "members",
      href: "/settings/members",
      label: "Members",
      icon: Users,
    },
  ];
}
