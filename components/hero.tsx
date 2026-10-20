import Link from "next/link";
import type { CSSProperties } from "react";
import { ArrowRight, Check, Play } from "./icons";
import { HeroAtmosphere } from "./hero-atmosphere";
import { TiltFrame } from "./tilt-frame";
import { WorkspacePreview } from "./workspace-preview";

const assurances = ["Free to start", "No credit card", "Simple sign-in"];

export function Hero() {
  return (
    <HeroAtmosphere>
      <section className="relative pb-16 pt-32 sm:pb-24 sm:pt-36">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
        >
          <div className="aura-lavender absolute left-1/2 top-[-28rem] h-[52rem] w-[72rem] -translate-x-1/2 rounded-full opacity-80 blur-[110px]" />
          <div className="aura-mint absolute left-[-14rem] top-28 h-[32rem] w-[32rem] rounded-full opacity-70 blur-[100px]" />
          <div className="aura-peach absolute right-[-16rem] top-8 h-[36rem] w-[36rem] rounded-full opacity-60 blur-[110px]" />
          <div className="aura-sky absolute left-1/3 top-[30rem] h-[28rem] w-[28rem] rounded-full opacity-50 blur-[120px]" />
          <div className="grid-field absolute inset-0" />
        </div>

        <div className="shell relative">
          <div className="mx-auto max-w-3xl text-center">
            <div className="enter" style={{ "--delay": "0ms" } as CSSProperties}>
              <span className="inline-flex flex-wrap items-center justify-center gap-2 rounded-full border border-border bg-surface/70 py-1.5 pl-2.5 pr-3.5 text-[11.5px] font-medium text-muted shadow-[inset_0_1px_0_rgba(255,255,255,0.55)] backdrop-blur">
                <span className="status-dot h-1.5 w-1.5" />
                Built for scanlation teams
              </span>
            </div>

            <h1
              className="enter hero-title mt-7 font-semibold leading-[0.94] tracking-[-0.05em] text-ink"
              style={{ "--delay": "70ms" } as CSSProperties}
            >
              Raw panels in.
              <br />
              <span className="display-serif text-accent-ink">Finished text</span> out.
            </h1>

            <p
              className="enter mx-auto mt-6 max-w-[39rem] text-[15px] leading-relaxed text-muted sm:text-[17px]"
              style={{ "--delay": "140ms" } as CSSProperties}
            >
              HwaFlow turns Korean, Japanese, or Chinese panels into natural
              English. It reads the text, translates it, then reads it again — so
              it sounds like a person wrote it. Your team checks the words,
              approves the chapter, and gets credit for the work.
            </p>

            <div
              className="enter mt-8 flex flex-col items-center justify-center gap-2.5 sm:flex-row"
              style={{ "--delay": "210ms" } as CSSProperties}
            >
              <Link href="/register" className="btn btn-primary btn-lg w-full sm:w-auto">
                Create your account
                <ArrowRight className="btn-icon h-4 w-4" />
              </Link>
              <a href="#product" className="btn btn-ghost btn-lg w-full sm:w-auto">
                <Play className="h-4 w-4 text-faint" />
                See how it works
              </a>
            </div>

            <ul
              className="enter mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[11.5px] text-faint"
              style={{ "--delay": "280ms" } as CSSProperties}
            >
              {assurances.map((item) => (
                <li key={item} className="inline-flex items-center gap-1.5">
                  <Check className="h-3 w-3 text-[var(--success)]" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div
            className="enter"
            style={{ "--delay": "360ms" } as CSSProperties}
          >
            <TiltFrame>
              <WorkspacePreview />
            </TiltFrame>
          </div>
        </div>
      </section>
    </HeroAtmosphere>
  );
}
