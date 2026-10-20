"use client";

import { getInitials, type AuthUser } from "@/lib/auth";
import { LayoutGrid, LogOut, X } from "../icons";
import { Logo } from "../logo";

const links = [{ href: "#overview", label: "Dashboard", icon: LayoutGrid }];

type DashboardRailProps = {
  user: AuthUser;
  open: boolean;
  onClose: () => void;
  onSignOut: () => void;
};

export function DashboardRail({
  user,
  open,
  onClose,
  onSignOut,
}: DashboardRailProps) {
  return (
    <>
      <button
        type="button"
        className="dash-overlay"
        data-open={open ? "true" : "false"}
        onClick={onClose}
        aria-label="Close menu"
        tabIndex={open ? 0 : -1}
      />

      <aside
        className="dash-rail"
        id="dashboard-rail"
        data-open={open ? "true" : "false"}
        aria-label="Workspace navigation"
      >
        <div className="dash-rail-head">
          <Logo href="/dashboard" />
          <button
            type="button"
            className="dash-icon-btn dash-drawer-close"
            onClick={onClose}
            aria-label="Close menu"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="dash-rail-scroll">
          <p className="dash-rail-label">Workspace</p>
          <nav className="dash-nav" aria-label="Workspace">
            {links.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="dash-nav-link"
                data-active="true"
                aria-current="page"
                onClick={onClose}
              >
                <link.icon className="h-4 w-4 shrink-0" />
                <span className="dash-nav-text">{link.label}</span>
              </a>
            ))}
          </nav>
        </div>

        <div className="dash-user">
          <span className="dash-user-avatar" aria-hidden="true">
            {getInitials(user.displayName, user.username)}
          </span>
          <span className="dash-user-meta">
            <span className="dash-user-name">{user.displayName}</span>
            <span className="dash-user-handle">@{user.username}</span>
          </span>
          <button
            type="button"
            onClick={onSignOut}
            className="dash-icon-btn"
            aria-label="Sign out"
            title="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </aside>
    </>
  );
}
