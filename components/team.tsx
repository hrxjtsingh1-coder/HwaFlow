import type { CSSProperties } from "react";
import { Reveal } from "./reveal";
import { SectionIntro } from "./section-intro";
import { ArrowRight, Check, ShieldCheck } from "./icons";

const roles = [
  {
    name: "Owner",
    badge: "all access",
    copy: "Runs the group: its settings, every series, and every chapter.",
    dot: "bg-[var(--accent)]",
  },
  {
    name: "Manager",
    badge: "guides the series",
    copy: "Adds new series, checks finished chapters, and chooses who works on what.",
    dot: "bg-[var(--success)]",
  },
  {
    name: "Staff",
    badge: "only their series",
    copy: "Works on the series they’re given, sends chapters for review, and sees what they’ve earned.",
    dot: "bg-[var(--warning)]",
  },
];

const days = [
  { label: "M", count: 2, tone: "bg-[var(--lavender)]" },
  { label: "T", count: 1, tone: "bg-[var(--sky)]" },
  { label: "W", count: 3, tone: "bg-[var(--mint)]" },
  { label: "T", count: 2, tone: "bg-[var(--peach)]", active: true },
  { label: "F", count: 1, tone: "bg-[var(--lavender)]" },
  { label: "S", count: 0, tone: "bg-[var(--mint)]" },
  { label: "S", count: 1, tone: "bg-[var(--sky)]" },
];

const bars = [34, 52, 41, 68, 58, 79, 66, 94];

function DashboardMock() {
  return (
    <div className="relative" aria-hidden="true">
      <div className="rounded-[1.75rem] border border-border bg-surface p-3 shadow-[var(--shadow-float)] sm:p-4">
        <div className="flex items-center justify-between px-2 pt-1">
          <div>
            <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-faint">
              Your group
            </p>
            <p className="mt-0.5 text-sm font-semibold tracking-tight text-ink">
              October overview
            </p>
          </div>
          <span className="chip chip-mint">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--success)]" />
            On track
          </span>
        </div>

        <div className="earnings-panel relative mt-4 overflow-hidden rounded-2xl border border-border p-4 sm:p-5">
          <div className="aura-lavender absolute -right-16 -top-16 h-40 w-40 rounded-full opacity-70 blur-2xl" />
          <div className="relative">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-faint">
                Earned this month
              </span>
              <span className="chip chip-mint">+$36.00</span>
            </div>
            <p className="tnum mt-1.5 text-[2rem] font-semibold leading-none tracking-[-0.04em] text-ink">
              $184.50
            </p>
            <p className="mt-1.5 text-[10.5px] text-muted">
              32 approved chapters · about $5.77 each
            </p>

            <div className="mt-4 flex h-14 items-end gap-1.5">
              {bars.map((height, index) => (
                <span
                  key={index}
                  className={`bar flex-1 rounded-t-[2px] ${
                    index === bars.length - 1
                      ? "bg-[var(--accent)]"
                      : "bg-[color-mix(in_oklab,var(--accent)_24%,var(--border))]"
                  }`}
                  style={
                    {
                      height: `${height}%`,
                      "--bar-delay": `${index * 40}ms`,
                    } as CSSProperties
                  }
                />
              ))}
            </div>
            <div className="mt-2 flex justify-between text-[8px] uppercase tracking-[0.12em] text-faint">
              <span>Week 1</span>
              <span>Week 2</span>
              <span>Week 3</span>
              <span>This week</span>
            </div>
          </div>
        </div>

        <div className="mt-3 rounded-2xl border border-border bg-surface-2/40 p-3">
          <div className="flex items-center justify-between px-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-faint">
              Release week
            </p>
            <span className="text-[9px] text-faint">4 series</span>
          </div>
          <div className="mt-2 grid grid-cols-7 gap-1">
            {days.map((day, index) => (
              <div
                key={index}
                className={`rounded-lg border px-1 py-2 text-center ${
                  day.active
                    ? "border-[color-mix(in_oklab,var(--accent)_28%,transparent)] bg-[var(--accent-soft)]"
                    : "border-transparent bg-surface/50"
                }`}
              >
                <p className="text-[8px] font-semibold uppercase tracking-wide text-faint">
                  {day.label}
                </p>
                <p
                  className={`tnum mt-1 text-[11px] font-semibold ${
                    day.active ? "text-[var(--accent-ink)]" : "text-muted"
                  }`}
                >
                  {day.count || "–"}
                </p>
                <div className="mt-1 flex h-1.5 justify-center gap-0.5">
                  {Array.from({ length: Math.min(day.count, 2) }).map(
                    (_, dot) => (
                      <span
                        key={dot}
                        className={`h-1 w-1 rounded-full ${day.tone}`}
                      />
                    )
                  )}
                </div>
              </div>
            ))}
          </div>
          <p className="mt-2 px-1 text-[9px] text-faint">
            Click a day to see what’s due.
          </p>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 px-2 pb-1">
          <span className="text-[9.5px] text-faint">
            Approved work is credited to whoever uploaded it.
          </span>
          <span className="chip chip-accent">Automatic</span>
        </div>
      </div>

      <div
        className="preview-chip -bottom-7 -left-8 hidden lg:flex"
        style={{ animationDelay: "-1.8s" }}
      >
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-[var(--mint)] text-[var(--mint-ink)]">
          <Check className="h-3.5 w-3.5" />
        </span>
        <span>
          <span className="block text-[10px] font-semibold leading-tight text-ink">
            Chapter approved
          </span>
          <span className="block text-[9px] leading-tight text-faint">
            +$4.50 · credited to Mira
          </span>
        </span>
      </div>
    </div>
  );
}

export function Team() {
  return (
    <section id="team" className="scroll-mt-24 py-24 sm:py-32">
      <div className="shell grid items-center gap-14 lg:grid-cols-[1fr_1.02fr] lg:gap-20">
        <div>
          <Reveal>
            <SectionIntro
              eyebrow="For teams"
              title={
                <>
                  The right people see the{" "}
                  <span className="display-serif text-accent-ink">
                    right series.
                  </span>
                </>
              }
              copy="Owners run the group. Managers build the series and approve chapters. Staff only see the series they’ve been given. Everyone sees exactly what they should — on every screen."
            />
          </Reveal>

          <div className="mt-8 space-y-1">
            {roles.map((role, index) => (
              <Reveal key={role.name} delay={index * 60}>
                <div className="role-row group flex items-center gap-3.5 rounded-2xl border border-transparent px-3 py-3.5 hover:border-border hover:bg-surface sm:px-4">
                  <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 self-start rounded-full ${role.dot}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-ink">{role.name}</p>
                      <span className="chip">{role.badge}</span>
                    </div>
                    <p className="mt-0.5 text-[13px] leading-relaxed text-muted">
                      {role.copy}
                    </p>
                  </div>
                  <ArrowRight className="h-4 w-4 shrink-0 -translate-x-1 text-faint opacity-0 transition-all duration-300 group-hover:translate-x-0 group-hover:opacity-100" />
                </div>
              </Reveal>
            ))}
          </div>

          <Reveal delay={200}>
            <p className="mt-6 inline-flex items-center gap-2 px-4 text-[11.5px] text-faint">
              <ShieldCheck className="h-4 w-4 text-[var(--mint-ink)]" />
              Every screen respects your role — not just the menu.
            </p>
          </Reveal>
        </div>

        <Reveal delay={120}>
          <DashboardMock />
        </Reveal>
      </div>
    </section>
  );
}
