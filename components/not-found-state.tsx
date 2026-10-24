import Link from "next/link";
import { ArrowRight } from "./icons";

type NotFoundStateProps = {
  title: string;
  copy: string;
  href: string;
  action: string;
  secondaryHref?: string;
  secondaryAction?: string;
  variant?: "page" | "panel";
  /** Short status line above the title. 404 only when it really is missing. */
  kicker?: string;
};

/**
 * One missing-state shape for the whole product: a torn panel, a way back,
 * and no dead end. The page variant gets a card; in-app states stay in-flow.
 */
export function NotFoundState({
  title,
  copy,
  href,
  action,
  secondaryHref,
  secondaryAction,
  variant = "panel",
  kicker = "404 · Missing",
}: NotFoundStateProps) {
  return (
    <section className={`notfound-state notfound-state--${variant}`}>
      <div className="notfound-mark" aria-hidden="true">
        <div className="notfound-frame">
          <span className="notfound-frame-line notfound-frame-line--1" />
          <span className="notfound-frame-line notfound-frame-line--2" />
          <span className="notfound-bubble">?</span>
        </div>
      </div>

      <div className="notfound-copy">
        <p className="notfound-kicker">{kicker}</p>
        <h1 className="notfound-title">{title}</h1>
        <p className="notfound-text">{copy}</p>

        <div className="notfound-actions">
          <Link href={href} className="btn btn-primary btn-sm">
            {action}
            <ArrowRight className="btn-icon h-4 w-4" />
          </Link>
          {secondaryHref && secondaryAction ? (
            <Link href={secondaryHref} className="btn btn-ghost btn-sm">
              {secondaryAction}
            </Link>
          ) : null}
        </div>
      </div>
    </section>
  );
}
