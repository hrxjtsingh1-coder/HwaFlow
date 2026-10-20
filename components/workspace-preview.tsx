import { PanelArt } from "./panel-art";
import {
  CalendarDays,
  Check,
  Glossary,
  Layers,
  Lock,
  ScanText,
  Stamp,
} from "./icons";

const blocks = [
  {
    index: "01",
    source: "그만두겠어. 이번이 진짜 마지막이야.",
    final: "I'm done. This is really the last time.",
    active: true,
  },
  {
    index: "02",
    source: "네가 그렇게 말할 줄 알았어.",
    final: "I knew you'd say that.",
    active: false,
  },
  {
    index: "03",
    source: "…언니, 제발.",
    final: "…Sis, please.",
    active: false,
  },
];

const railIcons = [
  { icon: Layers, active: true },
  { icon: ScanText, active: false },
  { icon: Glossary, active: false },
  { icon: Stamp, active: false },
  { icon: CalendarDays, active: false },
];

export function WorkspacePreview() {
  return (
    <div
      className="relative mx-auto mt-14 max-w-5xl sm:mt-16"
      aria-hidden="true"
    >
      {/* floating status cards */}
      <div className="preview-chip -left-10 -top-5 hidden xl:flex">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-[var(--mint)] text-[var(--mint-ink)]">
          <ScanText className="h-3.5 w-3.5" />
        </span>
        <span>
          <span className="block text-[10px] font-semibold leading-tight text-ink">
            Pages read
          </span>
          <span className="block text-[9px] leading-tight text-faint">
            38 pages · 2m 14s
          </span>
        </span>
      </div>

      <div
        className="preview-chip -right-4 bottom-24 hidden xl:flex"
        style={{ animationDelay: "-3.2s" }}
      >
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-[var(--lavender)] text-[var(--accent-ink)]">
          <Glossary className="h-3.5 w-3.5" />
        </span>
        <span>
          <span className="block text-[10px] font-semibold leading-tight text-ink">
            언니 <span className="text-faint">→</span> sis
          </span>
          <span className="block text-[9px] leading-tight text-faint">
            name kept the same
          </span>
        </span>
        <span className="chip chip-mint">14</span>
      </div>

      <div className="relative overflow-hidden rounded-[1.55rem] border border-border bg-surface shadow-[var(--shadow-float)]">
        {/* window chrome */}
        <div className="flex h-11 items-center gap-3 border-b border-border bg-surface-2/70 px-4">
          <div className="flex gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[#f7b3a7]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#f7d79b]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#a9dfc2]" />
          </div>

          <div className="mx-auto hidden min-w-0 items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1 text-[10px] text-faint sm:flex">
            <Lock className="h-3 w-3 shrink-0" />
            <span className="truncate">
              hwaflow.app / series / villainess-reborn / ch.42
            </span>
          </div>

          <div className="ml-auto flex items-center gap-2 sm:ml-0">
            <div className="hidden -space-x-1.5 sm:flex">
              {["YS", "MK", "JP"].map((initials, index) => (
                <span
                  key={initials}
                  className={`grid h-5 w-5 place-items-center rounded-full border-2 border-surface text-[7px] font-bold ${
                    index === 0
                      ? "bg-[var(--lavender)] text-[var(--accent-ink)]"
                      : index === 1
                        ? "bg-[var(--mint)] text-[var(--mint-ink)]"
                        : "bg-[var(--peach)] text-[var(--warning)]"
                  }`}
                >
                  {initials}
                </span>
              ))}
            </div>
            <span className="chip chip-mint">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--success)]" />
              Live
            </span>
          </div>
        </div>

        <div className="flex">
          {/* icon rail */}
          <aside className="hidden w-14 shrink-0 flex-col items-center gap-1.5 border-r border-border bg-surface-2/40 py-4 md:flex">
            {railIcons.map(({ icon: Icon, active }, index) => (
              <span
                key={index}
                className={`grid h-8 w-8 place-items-center rounded-lg ${
                  active
                    ? "bg-[var(--accent-soft)] text-[var(--accent-ink)]"
                    : "text-faint"
                }`}
              >
                <Icon className="h-4 w-4" />
              </span>
            ))}
          </aside>

          <div className="min-w-0 flex-1">
            {/* chapter header */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border px-4 py-3 sm:px-5">
              <div className="min-w-0">
                <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-faint">
                  Chapter 42
                </p>
                <p className="truncate text-[13px] font-semibold tracking-tight text-ink">
                  The Villainess Reborn
                </p>
              </div>
              <span className="chip chip-mint">Polished</span>
              <span className="chip hidden sm:inline-flex">38 pages</span>
              <div className="ml-auto flex items-center gap-2">
                <span className="hidden text-[10px] text-faint sm:inline">
                  Saved 2m ago
                </span>
                <span className="inline-flex items-center gap-1 rounded-lg bg-[var(--text)] px-2.5 py-1.5 text-[10px] font-semibold text-[var(--bg)]">
                  <Check className="h-3 w-3" />
                  Approve
                </span>
              </div>
            </div>

            {/* workspace body */}
            <div className="grid gap-4 p-4 sm:p-5 lg:grid-cols-[minmax(0,0.88fr)_minmax(0,1.12fr)]">
              {/* page with speech bubbles */}
              <div className="min-w-0">
                <div className="relative h-[280px] overflow-hidden rounded-xl border border-border bg-surface-2 sm:h-[340px] lg:h-[368px]">
                  <PanelArt
                    id="hero-panel"
                    className="absolute inset-0 h-full w-full"
                  />

                  <span className="absolute left-2.5 top-2.5 inline-flex items-center gap-1 rounded-md border border-white/60 bg-white/80 px-2 py-1 text-[8px] font-semibold tracking-wide text-[#3b3540] backdrop-blur">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#e08a6a]" />
                    Original · Page 7
                  </span>

                  <div
                    className="speech-bubble"
                    style={{
                      right: "6%",
                      top: "21%",
                      width: "50%",
                      outline:
                        "2px solid color-mix(in oklab, var(--accent) 55%, transparent)",
                      outlineOffset: "3px",
                    }}
                  >
                    <span className="ko block text-[10px] font-medium sm:text-[11px]">
                      이번이 진짜 마지막이야.
                    </span>
                  </div>

                  <div
                    className="speech-bubble"
                    data-tail="right"
                    style={{ left: "7%", top: "45%", width: "54%" }}
                  >
                    <span className="ko block text-[10px] font-medium sm:text-[11px]">
                      그만두겠어.
                    </span>
                  </div>

                  <div
                    className="speech-bubble"
                    style={{ left: "13%", top: "70%", width: "40%" }}
                  >
                    <span className="ko block text-[10px] font-medium sm:text-[11px]">
                      …언니?
                    </span>
                  </div>

                  <span className="absolute bottom-2.5 right-2.5 chip chip-accent">
                    Text 01 selected
                  </span>
                </div>

                <div className="mt-2 flex items-center justify-between px-0.5 text-[9.5px] text-faint">
                  <span>Page 7 of 38</span>
                  <span>38 pages</span>
                </div>
              </div>

              {/* text blocks */}
              <div className="flex min-w-0 flex-col">
                <div className="flex items-center gap-2 border-b border-border pb-2">
                  <span className="chip chip-accent">Final</span>
                  <span className="text-[10px] text-faint">First draft</span>
                  <span className="ml-auto text-[9.5px] text-faint">
                    Text 01 of 12
                  </span>
                </div>

                <div className="mt-2.5 space-y-2">
                  {blocks.map((block) => (
                    <div
                      key={block.index}
                      className={`rounded-lg border px-2.5 py-2 ${
                        block.active
                          ? "border-[color-mix(in_oklab,var(--accent)_28%,transparent)] bg-accent-soft/55"
                          : "border-border bg-surface"
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`grid h-4 w-4 place-items-center rounded text-[8px] font-bold ${
                            block.active
                              ? "bg-[var(--text)] text-[var(--bg)]"
                              : "bg-surface-2 text-faint"
                          }`}
                        >
                          {block.index}
                        </span>
                        <span className="text-[8px] font-semibold uppercase tracking-[0.12em] text-faint">
                          Text {block.index}
                        </span>
                        <span className="ml-auto inline-flex items-center gap-1 text-[8px] text-faint">
                          <Check className="h-2.5 w-2.5 text-[var(--success)]" />
                          Checked
                        </span>
                      </div>
                      <p className="ko mt-1 truncate text-[9px] text-faint">
                        {block.source}
                      </p>
                      <p className="mt-0.5 truncate text-[11px] font-medium leading-snug text-ink">
                        {block.final}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="mt-auto pt-3">
                  <div className="rounded-lg border border-border bg-surface-2/60 px-2.5 py-2">
                    <div className="flex items-center justify-between text-[9px] text-faint">
                      <span className="inline-flex items-center gap-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-[var(--success)]" />
                        All done
                      </span>
                      <span className="tnum">38 of 38</span>
                    </div>
                    <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-[var(--border)]">
                      <div className="h-full w-full rounded-full progress-fill" />
                    </div>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center justify-between gap-1.5">
                    <span className="inline-flex items-center gap-1 text-[9px] text-faint">
                      <Glossary className="h-3 w-3" />
                      14 names &amp; terms kept consistent
                    </span>
                    <span className="rounded-md border border-border bg-surface px-2 py-1 text-[9px] font-medium text-muted">
                      Download
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
