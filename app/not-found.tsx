import type { Metadata } from "next";
import Link from "next/link";
import { NotFoundState } from "@/components/not-found-state";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = {
  title: "Page not found",
  description:
    "This page isn’t in the chapter. Head back to HwaFlow or see how the workspace fits together.",
};

export default function NotFound() {
  return (
    <div className="landing notfound-page">
      <SiteHeader />
      <main id="main" className="notfound-main">
        <div className="shell">
          <NotFoundState
            variant="page"
            title="This page isn’t in the chapter."
            copy="The link may be old, or the page was moved. The rest of the story is still here."
            href="/"
            action="Back to the homepage"
            secondaryHref="/#pipeline"
            secondaryAction="How HwaFlow works"
          />

          <div className="notfound-escapes">
            <p>Or pick up the thread</p>
            <Link href="/#product">What it does</Link>
            <Link href="/#team">For teams</Link>
            <Link href="/login">Sign in</Link>
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
