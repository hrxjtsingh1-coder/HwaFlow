"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatRelativeTime } from "@/lib/format";
import {
  listNotificationsAction,
  markAllNotificationsReadAction,
  markNotificationReadAction,
  unreadNotificationsAction,
} from "@/lib/notification-actions";
import type { AppNotification } from "@/lib/notifications";
import { Bell, ChevronRight, Menu } from "../icons";
import { Logo } from "../logo";
import { ThemeToggle } from "../theme-toggle";

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
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const result = await listNotificationsAction();
    if (!result.ok) return;
    setItems(result.data.items);
    setUnread(result.data.unread);
  }, []);

  // The badge is all the closed popover shows, so mounting costs one count
  // instead of twenty rows. The list is fetched when it is actually opened.
  const loadCount = useCallback(async () => {
    const result = await unreadNotificationsAction();
    if (!result.ok) return;
    setUnread(result.data);
  }, []);

  useEffect(() => {
    void loadCount();
  }, [loadCount]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const visible = items.slice(0, 6);

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

  const markRead = async (id: string) => {
    const target = items.find((item) => item.id === id);
    if (!target || target.read) return;

    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, read: true } : item))
    );
    setUnread((current) => Math.max(0, current - 1));

    const result = await markNotificationReadAction(id);
    if (!result.ok) void load();
  };

  const markAllRead = async () => {
    setItems((current) => current.map((item) => ({ ...item, read: true })));
    setUnread(0);

    const result = await markAllNotificationsReadAction();
    if (!result.ok) void load();
  };

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
        <ThemeToggle />
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
                onClick={markAllRead}
                disabled={!unread}
              >
                Mark all read
              </button>
            </div>

            {visible.length === 0 ? (
              <p className="dash-notif-empty">
                You&apos;re all caught up. When someone assigns you a series,
                it appears here.
              </p>
            ) : (
              <ul className="dash-notif-list">
                {visible.map((item) => {
                  const body = (
                    <>
                      <span
                        className="dash-notif-dot"
                        data-tone={item.tone}
                        aria-hidden="true"
                      />
                      <span className="dash-notif-body">
                        <span className="dash-notif-title">{item.title}</span>
                        <span className="dash-notif-copy">{item.body}</span>
                        <span className="dash-notif-time">
                          {formatRelativeTime(item.createdAt)}
                        </span>
                      </span>
                    </>
                  );

                  return (
                    <li
                      key={item.id}
                      className="dash-notif"
                      data-unread={item.read ? "false" : "true"}
                    >
                      {item.href ? (
                        <Link
                          href={item.href}
                          className="dash-notif-link"
                          onClick={() => {
                            markRead(item.id);
                            setOpen(false);
                          }}
                        >
                          {body}
                        </Link>
                      ) : (
                        <button
                          type="button"
                          className="dash-notif-link"
                          onClick={() => markRead(item.id)}
                        >
                          {body}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}

            {items.length > visible.length ? (
              <p className="dash-notif-more">
                +{items.length - visible.length} older notification
                {items.length - visible.length === 1 ? "" : "s"}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  );
}
