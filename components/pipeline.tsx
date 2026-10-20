import { Reveal } from "./reveal";
import { SectionIntro } from "./section-intro";
import { Stamp, UploadCloud, Wand } from "./icons";

const steps = [
  {
    number: "01",
    icon: UploadCloud,
    title: "Upload",
    copy: "Drop in your pages. HwaFlow gets them ready — no extra software, no renaming files.",
    meta: ["Drag & drop", "No setup"],
  },
  {
    number: "02",
    icon: Wand,
    title: "Translate",
    copy: "HwaFlow reads the text, translates it, then gives it a second pass so it sounds natural. You can watch, or come back later.",
    meta: ["Works in the background", "Picks up where it left off"],
  },
  {
    number: "03",
    icon: Stamp,
    title: "Approve",
    copy: "Your team checks the words next to the page. A manager approves, and the work is credited. Changed your mind? You can undo it.",
    meta: ["Easy to review", "Can be undone"],
  },
];

export function Pipeline() {
  return (
    <section
      id="pipeline"
      className="scroll-mt-24 border-y border-border bg-surface-2/40 py-24 sm:py-28"
    >
      <div className="shell">
        <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          <Reveal>
            <SectionIntro
              eyebrow="How it works"
              title={
                <>
                  Three steps from{" "}
                  <span className="display-serif text-accent-ink">folder</span> to
                  release.
                </>
              }
              copy="A chapter can take a while, so HwaFlow keeps working in the background. Close the tab if you like — your progress will be waiting."
            />
          </Reveal>
          <Reveal delay={100}>
            <p className="max-w-[17rem] text-[12px] leading-relaxed text-faint lg:text-right">
              No lost work. No starting over.
              <br className="hidden lg:block" /> If things get busy, it slows
              down instead of giving up.
            </p>
          </Reveal>
        </div>

        <div className="pipeline-grid mt-12 grid gap-4 md:grid-cols-3">
          {steps.map((step, index) => (
            <Reveal key={step.number} delay={index * 80}>
              <article className="step-card group h-full p-6 sm:p-7">
                <div className="flex items-start justify-between">
                  <span className="display-serif text-[2.6rem] leading-none text-faint">
                    {step.number}
                  </span>
                  <span className="grid h-10 w-10 place-items-center rounded-xl border border-border bg-surface-2 text-muted transition-colors duration-300 group-hover:text-ink">
                    <step.icon className="h-[18px] w-[18px]" />
                  </span>
                </div>
                <h3 className="mt-7 text-lg font-semibold tracking-[-0.025em] text-ink">
                  {step.title}
                </h3>
                <p className="mt-2 text-[13.5px] leading-relaxed text-muted">
                  {step.copy}
                </p>
                <div className="mt-6 flex flex-wrap gap-1.5">
                  {step.meta.map((item) => (
                    <span key={item} className="chip">
                      {item}
                    </span>
                  ))}
                </div>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
