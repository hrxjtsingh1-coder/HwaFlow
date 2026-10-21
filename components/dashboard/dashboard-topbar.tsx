"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { notifications } from "@/lib/dashboard-data";
import { Bell, ChevronRight, Menu } from "../icons";
import { Logo } from "../logo";

export type Crumb = {
  label: string;
  href?: string;
};

type DashboardTopbarProps = {
  onOpenMenu: () => void;
  /** Breadcrumb trail, root first. The last entry is the current page. */
  trail?: Crumb[];
};

const DEFAULT_TRAIL: Crumb[] = [
  { label: "Workspace" },
  { label: "Overview" },
];

export function DashboardTopbar({
  onOpenMenu,
  trail = DEFAULT_TRAIL,
}: DashboardTopbarProps) {
  const [open, setOpen] = useState(false);
  const [readAll, setReadAll] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const unread = readAll
    ? 0
    : notifications.filter((item) => item.unread).length;

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <header className="dash-topbar">
      <div className="dash-topbar-left">
        <button
          type="button"
          className="dash-icon-btn dash-menu-btn"
          onClick={onOpenMenu}
          aria-label="Open menu"
          aria-controls="dashboard-rail"
        >
          <Menu className="h-[18px] w-[18px]" />
        </button>

        <div className="dash-mobile-logo">
          <Logo href="/dashboard" />
        </div>

        <nav className="dash-crumb" aria-label="Breadcrumb">
          {trail.map((crumb, index) => {
            const last = index === trail.length - 1;
            return (
              <span className="dash-crumb-item" key={`${crumb.label}-${index}`}>
                {index > 0 ? <ChevronRight className="h-3 w-3" /> : null}
                {last ? (
                  <span className="dash-crumb-current" aria-current="page">
                    {crumb.label}
                  </span>
                ) : crumb.href ? (
                  <Link href={crumb.href} className="dash-crumb-muted dash-crumb-link">
                    {crumb.label}
                  </Link>
                ) : (
                  <span className="dash-crumb-muted">{crumb.label}</span>
                )}
              </span>
            );
          })}
        </nav>
      </div>

      <div className="dash-topbar-actions">
        <div className="dash-notif-wrap" ref={wrapRef}>
          <button
            type="button"
            className="dash-icon-btn"
            onClick={() => setOpen((value) => !value)}
            aria-label={
              unread
                ? `Notifications, ${unread} unread`
                : "Notifications, all read"
            }
            aria-expanded={open}
            aria-haspopup="true"
          >
            <Bell className="h-[18px] w-[18px]" />
            {unread > 0 ? (
              <span className="dash-unread" aria-hidden="true" />
            ) : null}
          </button>

          <div className="dash-popover" data-open={open ? "true" : "false"}>
            <div className="dash-popover-head">
              <div>
                <p className="dash-popover-title">Notifications</p>
                <p className="dash-popover-sub">
                  {unread ? `${unread} unread` : "All caught up"}
                </p>
              </div>
              <button
                type="button"
                className="dash-link"
                onClick={() => setReadAll(true)}
                disabled={!unread}
              >
                Mark all read
              </button>
            </div>

            <ul className="dash-notif-list">
              {notifications.map((item) => {
                const isUnread = item.unread && !readAll;
                return (
                  <li
                    key={item.id}
                    className="dash-notif"
                    data-unread={isUnread ? "true" : "false"}
                  >
                    <span
                      className="dash-notif-dot"
                      data-tone={item.tone}
                      aria-hidden="true"
                    />
                    <span className="dash-notif-body">
                      <span className="dash-notif-title">{item.title}</span>
                      <span className="dash-notif-copy">{item.body}</span>
                      <span className="dash-notif-time">{item.time}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </div>
    </header>
  );
}
