"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Logo } from "./logo";
import { ArrowRight, LogOut, Menu, X } from "./icons";
import { getInitials, signOut } from "@/lib/auth";
import { useAuthSession } from "@/lib/use-auth-session";

const links = [
  { href: "#product", label: "What it does" },
  { href: "#pipeline", label: "How it works" },
  { href: "#team", label: "For teams" },
];

export function SiteHeader() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const { user, ready } = useAuthSession();
  const signedIn = ready ? user : null;

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const handleSignOut = () => {
    void signOut();
    setOpen(false);
  };

  return (
    <header className="site-header" data-scrolled={scrolled}>
      <div className="shell flex h-[4.25rem] items-center justify-between gap-4">
        <Logo />

        <nav className="hidden items-center gap-8 md:flex" aria-label="Primary">
          {links.map((link) => (
            <a key={link.href} href={link.href} className="nav-link">
              {link.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          {signedIn ? (
            <div className="account-chip">
              <Link
                href="/dashboard"
                className="account-main"
                aria-label="Open your dashboard"
              >
                <span className="account-avatar" aria-hidden="true">
                  {getInitials(signedIn.displayName, signedIn.username)}
                </span>
                <span className="account-meta">
                  <span className="account-name">{signedIn.displayName}</span>
                  <span className="account-handle">@{signedIn.username}</span>
                </span>
              </Link>
              <button
                type="button"
                onClick={handleSignOut}
                className="account-signout"
                aria-label="Sign out"
                title="Sign out"
              >
                <LogOut className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <>
              <Link href="/login" className="btn btn-ghost btn-sm">
                Sign in
              </Link>
              <Link href="/register" className="btn btn-primary btn-sm">
                Create account
                <ArrowRight className="btn-icon h-4 w-4" />
              </Link>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls="mobile-nav"
          aria-label={open ? "Close menu" : "Open menu"}
          className="grid h-10 w-10 place-items-center rounded-full border border-border bg-surface/70 text-ink backdrop-blur transition-[color,background-color,transform] duration-150 hover:bg-surface active:scale-95 md:hidden"
        >
          {open ? (
            <X className="h-[18px] w-[18px]" />
          ) : (
            <Menu className="h-[18px] w-[18px]" />
          )}
        </button>
      </div>

      <div
        id="mobile-nav"
        aria-hidden={!open}
        inert={!open}
        className={`grid overflow-hidden bg-[var(--header-bg)] backdrop-blur-xl transition-[grid-template-rows,opacity] duration-300 ease-[var(--ease)] md:hidden ${
          open
            ? "grid-rows-[1fr] border-b border-border opacity-100"
            : "grid-rows-[0fr] border-b border-transparent opacity-0"
        }`}
      >
        <div className="min-h-0">
          <nav className="shell flex flex-col gap-1 py-4" aria-label="Mobile">
            {links.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="rounded-xl px-3 py-2.5 text-sm font-medium text-muted transition-colors hover:bg-surface-2 hover:text-ink"
              >
                {link.label}
              </a>
            ))}
            <div className="mt-2 border-t border-border pt-4">
              {signedIn ? (
                <div className="flex items-center justify-between gap-2 rounded-xl border border-border bg-surface px-3 py-2">
                  <Link
                    href="/dashboard"
                    onClick={() => setOpen(false)}
                    className="flex min-w-0 items-center gap-2"
                    aria-label="Open your dashboard"
                  >
                    <span className="account-avatar" aria-hidden="true">
                      {getInitials(signedIn.displayName, signedIn.username)}
                    </span>
                    <span className="min-w-0 leading-tight">
                      <span className="block truncate text-[13px] font-semibold text-ink">
                        {signedIn.displayName}
                      </span>
                      <span className="block truncate text-[11px] text-faint">
                        @{signedIn.username} · Dashboard
                      </span>
                    </span>
                  </Link>
                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="btn btn-ghost btn-sm"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    Sign out
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <Link
                    href="/login"
                    onClick={() => setOpen(false)}
                    className="btn btn-ghost btn-sm w-full"
                  >
                    Sign in
                  </Link>
                  <Link
                    href="/register"
                    onClick={() => setOpen(false)}
                    className="btn btn-primary btn-sm w-full"
                  >
                    Create account
                  </Link>
                </div>
              )}
            </div>
          </nav>
        </div>
      </div>
    </header>
  );
}
