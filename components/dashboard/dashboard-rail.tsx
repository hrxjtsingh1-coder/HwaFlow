"use client";

import type { ComponentType, SVGProps } from "react";
import { getInitials, type AuthUser } from "@/lib/auth";
import { isPlatformAdmin } from "@/lib/groups";
import { Building, LayoutGrid, LogOut, X } from "../icons";
import { Logo } from "../logo";

export type RailLink = {
  key: string;
  href: string;
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
};

type DashboardRailProps = {
  user: AuthUser;
  open: boolean;
  onClose: () => void;
  onSignOut: () => void;
  /** Navigation entries for the workspace shell. */
  links?: RailLink[];
  /** Key of the currently active link. */
  active?: string;
  /** Small heading above the links. */
  sectionLabel?: string;
};

export function DashboardRail({
  user,
  open,
  onClose,
  onSignOut,
  links = [
    { key: "overview", href: "/dashboard", label: "Dashboard", icon: LayoutGrid },
  ],
  active = "overview",
  sectionLabel = "Workspace",
}: DashboardRailProps) {
  const admin = isPlatformAdmin(user.username);

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
          <p className="dash-rail-label">{sectionLabel}</p>
          <nav className="dash-nav" aria-label={sectionLabel}>
            {links.map((link) => (
              <a
                key={link.key}
                href={link.href}
                className="dash-nav-link"
                data-active={link.key === active ? "true" : "false"}
                aria-current={link.key === active ? "page" : undefined}
                onClick={onClose}
              >
                <link.icon className="h-4 w-4 shrink-0" />
                <span className="dash-nav-text">{link.label}</span>
              </a>
            ))}
          </nav>

          {admin ? (
            <>
              <p className="dash-rail-label dash-rail-label--spaced">
                Platform
              </p>
              <nav className="dash-nav" aria-label="Platform">
                <a
                  href="/admin/groups"
                  className="dash-nav-link"
                  data-active="false"
                  onClick={onClose}
                >
                  <Building className="h-4 w-4 shrink-0" />
                  <span className="dash-nav-text">Admin console</span>
                </a>
              </nav>
            </>
          ) : null}
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
