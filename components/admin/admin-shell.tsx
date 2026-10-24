"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { getInitials, signOut } from "@/lib/auth";
import { useAuthSession } from "@/lib/use-auth-session";
import { ArrowLeft, LogOut, Menu, ShieldCheck, X } from "../icons";
import { Logo } from "../logo";
import { ThemeToggle } from "../theme-toggle";
import { Forbidden } from "./forbidden";

function AdminLoading({ message }: { message: string }) {
  return (
    <div className="admin-loading">
      <div className="admin-loading-inner">
        <Logo href="/" />
        <div className="admin-loading-card" role="status" aria-live="polite">
          <span className="admin-spinner" aria-hidden="true" />
          <p>{message}</p>
        </div>
      </div>
    </div>
  );
}

export function AdminShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, ready } = useAuthSession();
  const [menuOpen, setMenuOpen] = useState(false);

  const admin = ready && user ? user.isPlatformAdmin : false;

  useEffect(() => {
    if (ready && !user) router.replace("/login");
  }, [ready, user, router]);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  if (!ready) return <AdminLoading message="Checking access…" />;

  if (!user) {
    return <AdminLoading message="Taking you to sign in…" />;
  }

  if (!admin) {
    return (
      <div className="admin-standalone">
        <Forbidden username={user.username} />
      </div>
    );
  }

  const segments = pathname.split("/").filter(Boolean);
  const detailId =
    segments[0] === "admin" && segments[1] === "groups" && segments[2]
      ? segments[2]
      : null;

  const handleSignOut = () => {
    void signOut();
  };

  return (
    <div className="admin-shell">
      <button
        type="button"
        className="admin-overlay"
        data-open={menuOpen ? "true" : "false"}
        onClick={() => setMenuOpen(false)}
        aria-label="Close admin menu"
        tabIndex={menuOpen ? 0 : -1}
      />

      <aside
        className="admin-rail"
        id="admin-rail"
        data-open={menuOpen ? "true" : "false"}
        aria-label="Platform admin navigation"
      >
        <div className="admin-rail-head">
          <Logo href="/admin/groups" />
          <button
            type="button"
            className="admin-icon-btn admin-drawer-close"
            onClick={() => setMenuOpen(false)}
            aria-label="Close menu"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="admin-rail-scroll">
          <p className="admin-rail-eyebrow">
            <ShieldCheck className="h-3 w-3" />
            Platform admin
          </p>

          <nav className="admin-nav" aria-label="Platform admin">
            <Link
              href="/admin/groups"
              className="admin-nav-link"
              data-active="true"
              aria-current="page"
            >
              <span className="admin-nav-icon" aria-hidden="true">
                <ShieldCheck className="h-4 w-4" />
              </span>
              <span className="admin-nav-text">Groups</span>
            </Link>
          </nav>
        </div>

        <div className="admin-rail-foot">
          <Link href="/dashboard" className="admin-back-link">
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to workspace
          </Link>

          <div className="admin-account">
            <span className="admin-account-avatar" aria-hidden="true">
              {getInitials(user.displayName, user.username)}
              <span className="admin-account-shield" aria-hidden="true">
                <ShieldCheck className="h-2.5 w-2.5" />
              </span>
            </span>
            <span className="admin-account-meta">
              <span className="admin-account-name">{user.displayName}</span>
              <span className="admin-account-handle">@{user.username}</span>
            </span>
            <button
              type="button"
              onClick={handleSignOut}
              className="admin-icon-btn"
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      <div className="admin-body">
        <header className="admin-topbar">
          <div className="admin-topbar-left">
            <button
              type="button"
              className="admin-icon-btn admin-menu-btn"
              onClick={() => setMenuOpen(true)}
              aria-label="Open menu"
              aria-controls="admin-rail"
            >
              <Menu className="h-[18px] w-[18px]" />
            </button>

            <div className="admin-mobile-logo">
              <Logo href="/admin/groups" />
            </div>

            <nav className="admin-crumb" aria-label="Breadcrumb">
              <span className="admin-crumb-item">
                <span className="admin-crumb-muted">Admin</span>
              </span>
              <span className="admin-crumb-item">
                <span className="admin-crumb-sep" aria-hidden="true">
                  /
                </span>
                {detailId ? (
                  <Link href="/admin/groups" className="admin-crumb-link">
                    Groups
                  </Link>
                ) : (
                  <span className="admin-crumb-current" aria-current="page">
                    Groups
                  </span>
                )}
              </span>
              {detailId ? (
                <span className="admin-crumb-item">
                  <span className="admin-crumb-sep" aria-hidden="true">
                    /
                  </span>
                  <span className="admin-crumb-current" aria-current="page">
                    Group details
                  </span>
                </span>
              ) : null}
            </nav>
          </div>

          <div className="admin-topbar-right">
            <ThemeToggle />
            <span className="admin-topbar-badge">
              <ShieldCheck className="h-3 w-3" />
              Admin
            </span>
          </div>
        </header>

        <main className="admin-main" id="main">
          <div className="admin-content">{children}</div>
        </main>
      </div>
    </div>
  );
}
