import Link from "next/link";
import { ArrowUp } from "./icons";
import { Logo } from "./logo";

const productLinks = [
  { href: "/#product", label: "What it does" },
  { href: "/#pipeline", label: "How it works" },
  { href: "/#team", label: "For teams" },
];

const accountLinks = [
  { href: "/register", label: "Create account" },
  { href: "/login", label: "Sign in" },
];

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="shell">
        <div className="footer-grid">
          <div className="footer-brand">
            <Logo />
            <p>
              Manhwa translation, made simple. Raw panels in, finished text out.
            </p>
            <p className="footer-langs">
              Korean · Japanese · Chinese → English
            </p>
          </div>

          <div>
            <p className="footer-kicker">Explore</p>
            <ul className="footer-links">
              {productLinks.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="footer-link">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="footer-kicker">Account</p>
            <ul className="footer-links">
              {accountLinks.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="footer-link">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="footer-bottom">
          <p>© 2026 HwaFlow. Built for scanlation groups.</p>
          <a href="#top" className="footer-top-link">
            Back to top
            <ArrowUp className="h-3 w-3" />
          </a>
        </div>
      </div>
    </footer>
  );
}
