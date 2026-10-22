import type { ComponentType, ReactNode, SVGProps } from "react";
import { Reveal } from "./reveal";
import { SectionIntro } from "./section-intro";
import { PanelArt } from "./panel-art";
import { Check, Coins, Glossary, Languages, ScanText } from "./icons";

type IconType = ComponentType<SVGProps<SVGSVGElement>>;

function FeatureCard({
  tone,
  className = "",
  children,
}: {
  tone: "mint" | "lavender" | "peach" | "sky";
  className?: string;
  children: ReactNode;
}) {
  return (
    <article data-tone={tone} className={`feature-card h-full p-6 sm:p-7 ${className}`}>
      {children}
    </article>
  );
}

function CardHead({
  icon: Icon,
  title,
  copy,
}: {
  icon: IconType;
  title: string;
  copy: string;
}) {
  return (
    <>
      <span className="icon-tile">
        <Icon className="h-[18px] w-[18px]" />
      </span>
      <h3 className="mt-5 text-[1.0625rem] font-semibold tracking-[-0.02em] text-ink">
        {title}
      </h3>
      <p className="mt-2 max-w-md text-[13.5px] leading-relaxed text-muted">
        {copy}
      </p>
    </>
  );
}

const glossaryRows = [
  { source: "언니", target: "sis", category: "name" },
  { source: "회귀", target: "regression", category: "word" },
  { source: "폐하", target: "Your Majesty", category: "title" },
];

const ledgerRows = [
  { chapter: "Ch. 42", event: "approved", amount: "+$4.50", tone: "text-ink" },
  { chapter: "Ch. 41", event: "approved", amount: "+$4.50", tone: "text-ink" },
  {
    chapter: "Ch. 40",
    event: "approval undone",
    amount: "−$4.50",
    tone: "text-[var(--danger)]",
  },
];

export function Features() {
  return (
    <section id="product" className="scroll-mt-24 py-24 sm:py-32">
      <div className="shell">
        <Reveal>
          <SectionIntro
            title="Everything after the raw upload."
            copy="From a folder of panels to clean English text your typesetter can use. Your team stays in charge of the words; HwaFlow handles the busywork."
          />
        </Reveal>

        <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-12">
          {/* OCR */}
          <Reveal className="lg:col-span-7" delay={0}>
            <FeatureCard tone="sky">
              <CardHead
                icon={ScanText}
                title="Every panel gets read."
                copy="Long manhwa pages are read in careful sections, so sentences don’t get cut in half or counted twice. Fancy fonts and vertical text get a fair shot, too."
              />
              <div className="relative mt-6 h-44 overflow-hidden rounded-xl border border-border">
                <PanelArt
                  id="ocr-panel"
                  className="absolute inset-0 h-full w-full"
                  showFigure={false}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#12131a]/50 via-transparent to-transparent" />
                <div className="absolute inset-x-0 top-1/3 border-t border-dashed border-white/45" />
                <div className="absolute inset-x-0 top-2/3 border-t border-dashed border-white/45" />

                <span className="absolute right-2.5 top-[7%] rounded bg-[#1b1c22]/45 px-1.5 py-0.5 text-[7.5px] font-semibold tracking-[0.14em] text-white/90 backdrop-blur-sm">
                  PART 01
                </span>
                <span className="absolute right-2.5 top-[40%] rounded bg-[#1b1c22]/45 px-1.5 py-0.5 text-[7.5px] font-semibold tracking-[0.14em] text-white/90 backdrop-blur-sm">
                  PART 02
                </span>
                <span className="absolute right-2.5 top-[73%] rounded bg-[#1b1c22]/45 px-1.5 py-0.5 text-[7.5px] font-semibold tracking-[0.14em] text-white/90 backdrop-blur-sm">
                  PART 03
                </span>

                <span className="absolute inset-x-3 bottom-3 w-fit rounded-md border border-white/30 bg-black/30 px-2 py-1 text-[9px] font-medium text-white backdrop-blur">
                  read in parts, put back together
                </span>
              </div>
            </FeatureCard>
          </Reveal>

          {/* Two-pass */}
          <Reveal className="lg:col-span-5" delay={70}>
            <FeatureCard tone="lavender">
              <CardHead
                icon={Languages}
                title="Then it gets a second read."
                copy="First it translates what’s there. Then it reads again, the way an editor would, so the English sounds natural and still means the same thing. You can compare both versions."
              />
              <div className="mt-6 space-y-2">
                <div className="rounded-xl border border-border bg-surface-2/50 px-3 py-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-faint">
                      First draft
                    </span>
                    <span className="text-[9px] text-faint">word for word</span>
                  </div>
                  <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">
                    “I will quit. This time is really the last.”
                  </p>
                </div>
                <div className="relative overflow-hidden rounded-xl border border-[color-mix(in_oklab,var(--accent)_25%,transparent)] bg-[color-mix(in_oklab,var(--accent-soft)_65%,transparent)] px-3 py-2.5">
                  <div className="relative flex items-center justify-between">
                    <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--accent-ink)]">
                      Polished
                    </span>
                    <span className="chip chip-mint">Ready</span>
                  </div>
                  <p className="relative mt-1.5 text-[12.5px] font-medium leading-relaxed text-ink">
                    “I’m done. This is really the last time.”
                  </p>
                </div>
                <p className="flex items-center gap-1.5 pt-0.5 text-[10px] text-faint">
                  <Check className="h-3 w-3 text-[var(--success)]" />
                  The first draft stays for comparison, and a human edit always
                  wins.
                </p>
              </div>
            </FeatureCard>
          </Reveal>

          {/* Glossary */}
          <Reveal className="lg:col-span-5" delay={0}>
            <FeatureCard tone="mint">
              <CardHead
                icon={Glossary}
                title="Names that stay the same."
                copy="Keep character names, places, and titles the same in every chapter. HwaFlow remembers your choices and asks before adding a new one."
              />
              <div className="mt-5 space-y-1.5">
                {glossaryRows.map((row) => (
                  <div
                    key={row.source}
                    className="flex items-center gap-2 rounded-lg border border-border bg-surface-2/40 px-2.5 py-2"
                  >
                    <span className="ko text-[11px] font-medium text-ink">
                      {row.source}
                    </span>
                    <span className="text-[10px] text-faint">→</span>
                    <span className="text-[11px] font-medium text-ink">
                      {row.target}
                    </span>
                    <span className="ml-auto text-[8px] uppercase tracking-[0.1em] text-faint">
                      {row.category}
                    </span>
                  </div>
                ))}
                <div className="flex items-center gap-2 rounded-lg border border-dashed border-border px-2.5 py-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--warning)]" />
                  <span className="ko text-[10.5px] text-muted">새 이름</span>
                  <span className="text-[10px] text-faint">→</span>
                  <span className="text-[10.5px] text-muted">new name</span>
                  <span className="ml-auto text-[8px] uppercase tracking-[0.1em] text-faint">
                    check
                  </span>
                </div>
              </div>
            </FeatureCard>
          </Reveal>

          {/* Credits */}
          <Reveal className="lg:col-span-7" delay={70}>
            <FeatureCard tone="peach">
              <CardHead
                icon={Coins}
                title="Credit where it’s due."
                copy="Your earnings are based on chapters that actually get approved. If an approval is undone, the balance updates on its own."
              />
              <div className="mt-5 rounded-xl border border-border bg-surface-2/50 p-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:gap-5">
                  <div className="sm:w-[52%]">
                    <span className="block text-[9px] font-semibold uppercase tracking-[0.14em] text-faint">
                      Earned · October
                    </span>
                    <div className="mt-1 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                      <p className="tnum text-2xl font-semibold tracking-[-0.03em] text-ink">
                        $184.50
                      </p>
                      <span className="chip chip-mint">+$36.00 this week</span>
                    </div>
                    <p className="mt-1 text-[10px] leading-relaxed text-faint">
                      32 approved chapters · $5.77 average
                    </p>
                  </div>

                  <div className="border-t border-border pt-3 sm:flex-1 sm:border-l sm:border-t-0 sm:pl-5 sm:pt-0">
                    <span className="block text-[9px] font-semibold uppercase tracking-[0.14em] text-faint">
                      Recent
                    </span>
                    <ul className="mt-1.5 space-y-1.5">
                      {ledgerRows.map((row) => (
                        <li
                          key={row.chapter}
                          className="flex items-baseline gap-2 text-[10.5px]"
                        >
                          <span className="shrink-0 font-medium text-ink">
                            {row.chapter}
                          </span>
                          <span className="truncate text-faint">{row.event}</span>
                          <span className={`tnum ml-auto ${row.tone}`}>
                            {row.amount}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </FeatureCard>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
