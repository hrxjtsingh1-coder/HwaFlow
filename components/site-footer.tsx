import Link from "next/link";
import { Logo } from "./logo";

const productLinks = [
  { href: "#product", label: "What it does" },
  { href: "#pipeline", label: "How it works" },
  { href: "#team", label: "For teams" },
];

const accountLinks = [
  { href: "/register", label: "Create account" },
  { href: "/login", label: "Sign in" },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-border">
      <div className="shell py-14">
        <div className="grid gap-10 sm:grid-cols-2 md:grid-cols-[1.6fr_1fr_1fr]">
          <div>
            <Logo />
            <p className="mt-4 max-w-[17rem] text-[13px] leading-relaxed text-muted">
              Manhwa translation, made simple. Raw panels in, finished text out.
            </p>
            <p className="mt-4 text-[11px] tracking-[0.04em] text-faint">
              Korean · Japanese · Chinese → English
            </p>
          </div>

          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-faint">
              Explore
            </p>
            <ul className="mt-4 space-y-2.5">
              {productLinks.map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    className="text-[13px] text-muted transition-colors hover:text-ink"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-faint">
              Account
            </p>
            <ul className="mt-4 space-y-2.5">
              {accountLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-[13px] text-muted transition-colors hover:text-ink"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-12 border-t border-border pt-6">
          <p className="text-[11px] text-faint">
            © 2026 HwaFlow. Built for scanlation groups.
          </p>
        </div>
      </div>
    </footer>
  );
}
