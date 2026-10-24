import Link from "next/link";
import type { CSSProperties } from "react";
import { ArrowRight, ChevronDown } from "./icons";
import { HeroAtmosphere } from "./hero-atmosphere";
import { ReleaseSlip } from "./release-slip";
import { TiltFrame } from "./tilt-frame";
import { WorkspacePreview } from "./workspace-preview";

export function Hero() {
  return (
    <HeroAtmosphere>
      <section className="hero">
        <div className="shell hero-inner">
          <div
            className="hero-copy enter"
            style={{ "--delay": "0ms" } as CSSProperties}
          >
            <p className="hero-kicker">
              <span aria-hidden="true" className="hero-kicker-mark" />
              Manhwa translation, end to end
            </p>

            <h1 className="hero-title">
              Raw panels in.
              <br />
              <span className="display-serif hero-emphasis">
                Finished text
                <svg
                  className="hero-emphasis-rule"
                  viewBox="0 0 100 6"
                  preserveAspectRatio="none"
                  aria-hidden="true"
                  focusable="false"
                >
                  <path d="M0 3H100" pathLength="100" />
                </svg>
              </span>{" "}
              out.
            </h1>

            <p className="hero-lede">
              HwaFlow reads Korean, Japanese, or Chinese panels, translates them,
              then gives the English a second pass. Your team checks the words,
              approves the chapter, and gets the credit.
            </p>

            <div className="hero-actions">
              <Link href="/register" className="btn btn-primary btn-lg">
                Create your account
                <ArrowRight className="btn-icon h-4 w-4" />
              </Link>
              <a href="#pipeline" className="btn btn-ghost btn-lg">
                How it works
                <ChevronDown className="btn-chevron h-4 w-4 text-faint" />
              </a>
            </div>

            <p className="hero-fineprint">
              Free to start · No credit card · Your group owns the text
            </p>
          </div>

          <div
            className="hero-proof enter"
            style={{ "--delay": "100ms" } as CSSProperties}
          >
            <ReleaseSlip />
          </div>
        </div>

        <div
          className="shell hero-workspace enter"
          style={{ "--delay": "180ms" } as CSSProperties}
        >
          <div className="hero-workspace-head">
            <p className="hero-workspace-label">The workspace</p>
            <p className="hero-workspace-note">
              Chapter rail · Bubble editor · Raw panel
            </p>
          </div>
          <TiltFrame>
            <WorkspacePreview />
          </TiltFrame>
        </div>
      </section>
    </HeroAtmosphere>
  );
}
