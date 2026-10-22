import Link from "next/link";
import type { CSSProperties } from "react";
import { ArrowRight, ChevronDown } from "./icons";
import { WorkspacePreview } from "./workspace-preview";

export function Hero() {
  return (
    <section className="relative isolate pb-16 pt-32 sm:pb-24 sm:pt-36">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
      >
        <div className="hero-wash absolute inset-x-0 top-0 h-[34rem]" />
      </div>

      <div className="shell relative">
        <div
          className="enter mx-auto max-w-3xl text-center"
          style={{ "--delay": "0ms" } as CSSProperties}
        >
          <h1 className="hero-title font-semibold leading-[0.94] tracking-[-0.05em] text-ink">
            Raw panels in.
            <br />
            <span className="display-serif text-accent-ink">Finished text</span>{" "}
            out.
          </h1>

          <p className="mx-auto mt-6 max-w-[38rem] text-[15px] leading-relaxed text-muted sm:text-[17px]">
            HwaFlow turns Korean, Japanese, or Chinese panels into natural
            English. It reads the text, translates it, then reads it again so
            the result sounds like a person wrote it. Your team checks the
            words, approves the chapter, and gets credit for the work.
          </p>

          <div className="mt-8 flex flex-col items-center justify-center gap-2.5 sm:flex-row">
            <Link
              href="/register"
              className="btn btn-primary btn-lg w-full sm:w-auto"
            >
              Create your account
              <ArrowRight className="btn-icon h-4 w-4" />
            </Link>
            <a href="#pipeline" className="btn btn-ghost btn-lg w-full sm:w-auto">
              How it works
              <ChevronDown className="btn-chevron h-4 w-4 text-faint" />
            </a>
          </div>

          <p className="mt-6 text-[12px] text-faint">
            Free to start, no credit card.
          </p>
        </div>

        <div className="enter" style={{ "--delay": "160ms" } as CSSProperties}>
          <WorkspacePreview />
        </div>
      </div>
    </section>
  );
}
