"use client";

import { getInitials, type AuthUser } from "@/lib/auth";
import { demoGroup } from "@/lib/dashboard-data";
import {
  Activity,
  BookOpen,
  Coins,
  Glossary,
  Inbox,
  LayoutGrid,
  Layers,
  LogOut,
  Users,
  X,
} from "../icons";
import { Logo } from "../logo";

const links = [
  { href: "#overview", label: "Overview", icon: LayoutGrid },
  { href: "#review", label: "Review queue", icon: Inbox, review: true },
  { href: "#series", label: "Series", icon: BookOpen },
  { href: "#activity", label: "Activity", icon: Activity },
  { href: "#glossary", label: "Glossary", icon: Glossary },
  { href: "#team", label: "Team", icon: Users },
  { href: "#earnings", label: "Earnings", icon: Coins },
];

type DashboardRailProps = {
  user: AuthUser;
  reviewCount: number;
  open: boolean;
  onClose: () => void;
  onSignOut: () => void;
};

export function DashboardRail({
  user,
  reviewCount,
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
            {links.map((link, index) => (
              <a
                key={link.href}
                href={link.href}
                className="dash-nav-link"
                data-active={index === 0 ? "true" : undefined}
                aria-current={index === 0 ? "page" : undefined}
                onClick={onClose}
              >
                <link.icon className="h-4 w-4 shrink-0" />
                <span className="dash-nav-text">{link.label}</span>
                {link.review && reviewCount > 0 ? (
                  <span className="dash-nav-badge">{reviewCount}</span>
                ) : null}
              </a>
            ))}
          </nav>

          <div className="dash-group-card">
            <div className="dash-group-top">
              <span className="dash-group-mark" aria-hidden="true">
                <Layers className="h-4 w-4" />
              </span>
              <span className="chip chip-mint">On track</span>
            </div>
            <p className="dash-group-name">{demoGroup.name}</p>
            <p className="dash-group-meta">
              {demoGroup.role} · {demoGroup.members} members
            </p>
            <div className="dash-group-foot">
              <span>{demoGroup.activeSeries} active series</span>
              <a href="#team" className="dash-group-link" onClick={onClose}>
                Manage
              </a>
            </div>
          </div>
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
