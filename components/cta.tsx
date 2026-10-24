import Link from "next/link";
import { Reveal } from "./reveal";
import { ArrowRight } from "./icons";

export function Cta() {
  return (
    <section className="cta-close">
      <div className="shell cta-grid">
        <Reveal className="cta-copy">
          <p className="cta-kicker">
            <span aria-hidden="true" className="cta-mark" />
            Start
          </p>
          <h2>
            Your <span className="display-serif">next chapter</span> starts here.
          </h2>
          <p>
            Create an account, join your group, and let HwaFlow handle the
            boring part. The first chapter is the hardest; after that it becomes
            a rhythm.
          </p>
          <p className="cta-note">No card. No trial timer. Just the work.</p>
        </Reveal>

        <Reveal delay={80}>
          <div className="cta-slip">
            <p className="cta-slip-label">Open a group</p>
            <Link href="/register" className="btn btn-primary btn-lg">
              Create your account
              <ArrowRight className="btn-icon h-4 w-4" />
            </Link>
            <Link href="/login" className="btn btn-ghost btn-lg">
              Sign in
            </Link>
            <p className="cta-slip-foot">
              Free to start. Your group owns the text, the glossary, and the
              credit.
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
