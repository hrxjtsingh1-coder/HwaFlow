import { Reveal } from "./reveal";
import { SectionIntro } from "./section-intro";

const steps = [
  {
    number: "01",
    title: "Upload",
    copy: "Drop in your pages. HwaFlow gets them ready, with no extra software and no renaming files.",
  },
  {
    number: "02",
    title: "Translate",
    copy: "HwaFlow reads the text, translates it, then gives it a second pass so it sounds natural. You can watch, or come back later. Close the tab if you like; your progress will be waiting.",
  },
  {
    number: "03",
    title: "Approve",
    copy: "Your team checks the words next to the page. A manager approves, and the work is credited. Changed your mind? You can undo it.",
  },
];

export function Pipeline() {
  return (
    <section
      id="pipeline"
      className="scroll-mt-24 border-y border-border bg-surface-2/40 py-24 sm:py-28"
    >
      <div className="shell">
        <Reveal>
          <SectionIntro
            title="Three steps from folder to release."
            copy="A chapter can take a while, so HwaFlow keeps working in the background. If things get busy it slows down instead of giving up, and no part of the work is lost."
          />
        </Reveal>

        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {steps.map((step, index) => (
            <Reveal key={step.number} delay={index * 80}>
              <article className="step-card h-full p-6 sm:p-8">
                <div className="flex items-center gap-3">
                  <span className="tnum text-[11px] font-semibold tracking-[0.14em] text-faint">
                    {step.number}
                  </span>
                  <span aria-hidden="true" className="h-px flex-1 bg-border" />
                </div>
                <h3 className="mt-5 text-lg font-semibold tracking-[-0.025em] text-ink">
                  {step.title}
                </h3>
                <p className="mt-2 text-[13.5px] leading-relaxed text-muted">
                  {step.copy}
                </p>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
