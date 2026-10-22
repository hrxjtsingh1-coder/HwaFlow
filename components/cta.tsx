import Link from "next/link";
import { Reveal } from "./reveal";
import { ArrowRight } from "./icons";

export function Cta() {
  return (
    <section className="pb-20 sm:pb-28">
      <div className="shell">
        <Reveal>
          <div className="cta-panel relative overflow-hidden rounded-[2rem] border border-border px-6 py-16 text-center sm:px-12 sm:py-20">
            <div className="relative z-10 mx-auto max-w-2xl">
              <h2 className="text-[clamp(2.1rem,4.8vw,3.5rem)] font-semibold leading-[0.99] tracking-[-0.045em] text-ink">
                Your next chapter starts here.
              </h2>
              <p className="mx-auto mt-5 max-w-xl text-[15px] leading-relaxed text-muted">
                Create an account, join your group, and let HwaFlow handle the
                boring part. The first chapter is the hardest; after that it
                becomes a rhythm.
              </p>

              <div className="mt-8 flex flex-col items-center justify-center gap-2.5 sm:flex-row">
                <Link
                  href="/register"
                  className="btn btn-primary btn-lg w-full sm:w-auto"
                >
                  Create your account
                  <ArrowRight className="btn-icon h-4 w-4" />
                </Link>
                <Link
                  href="/login"
                  className="btn btn-ghost btn-lg w-full sm:w-auto"
                >
                  Sign in
                </Link>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
