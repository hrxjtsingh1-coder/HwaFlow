"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { signOut } from "@/lib/auth";
import {
  approvedThisMonth,
  earningBars,
  earningsThisMonth,
  initialWeek,
  type Release,
} from "@/lib/dashboard-data";
import { useAuthSession } from "@/lib/use-auth-session";
import {
  ArrowUpRight,
  CalendarDays,
  Clock,
  LayoutGrid,
  ShieldCheck,
  TrendingUp,
  X,
} from "../icons";
import { Logo } from "../logo";
import { DashboardRail } from "./dashboard-rail";
import { DashboardTopbar } from "./dashboard-topbar";

/* ------------------------------------------------------------------ */
/* Focus tracking                                                      */
/* ------------------------------------------------------------------ */

const FOCUS_KEY = "hwaflow.focus.v1";
const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

type CalendarDay = {
  key: string;
  label: string;
  long: string;
  date: number;
  isToday: boolean;
  seconds: number;
  releases: Release[];
};

function dayKey(date = new Date()): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function readFocusLog(): Record<string, number> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(FOCUS_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const log: Record<string, number> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "number" && Number.isFinite(value) && value > 0) {
        log[key] = Math.floor(value);
      }
    }
    return log;
  } catch {
    return {};
  }
}

function writeFocusLog(log: Record<string, number>): void {
  try {
    window.localStorage.setItem(FOCUS_KEY, JSON.stringify(log));
  } catch {
    /* Focus tracking is a nicety, never a requirement. */
  }
}

function formatFocus(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);

  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  if (minutes > 0) return `${minutes}m ${String(total % 60).padStart(2, "0")}s`;
  return `${total}s`;
}

/**
 * Reveals a number from zero once on mount, then follows the live value.
 * The snapshot is taken on first render so a ticking value (time spent) does
 * not restart the count.
 */
function CountUp({
  value,
  delay = 0,
  format,
}: {
  value: number;
  delay?: number;
  format: (value: number) => string;
}) {
  const [shown, setShown] = useState(0);
  const [done, setDone] = useState(false);
  const snapshot = useRef(value);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(snapshot.current);
      setDone(true);
      return;
    }

    const duration = 620;
    const start = performance.now() + delay;
    let frame = requestAnimationFrame(function step(now) {
      const progress = Math.min(1, Math.max(0, (now - start) / duration));
      const eased = 1 - Math.pow(1 - progress, 3);
      setShown(snapshot.current * eased);
      if (progress < 1) {
        frame = requestAnimationFrame(step);
      } else {
        setDone(true);
      }
    });

    return () => cancelAnimationFrame(frame);
  }, [delay]);

  return <>{format(done ? value : shown)}</>;
}

/** Human label for a day relative to today, e.g. "Today" or "In 2 days". */
function relativeDay(day: CalendarDay): string {
  const target = new Date(`${day.key}T00:00:00`);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.round((target.getTime() - today.getTime()) / 86_400_000);

  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  if (diff > 1) return `In ${diff} days`;
  return `${Math.abs(diff)} days ago`;
}

/** Monday-to-Sunday week around today, with the live session folded into today. */
function buildWeek(
  log: Record<string, number>,
  liveSeconds: number
): { days: CalendarDay[]; releases: number } {
  const now = new Date();
  const todayKey = dayKey(now);
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  const longDate = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const days: CalendarDay[] = WEEKDAY_LABELS.map((label, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);
    const key = dayKey(date);
    return {
      key,
      label,
      long: longDate.format(date),
      date: date.getDate(),
      isToday: key === todayKey,
      seconds: key === todayKey ? liveSeconds : (log[key] ?? 0),
      releases: initialWeek[index]?.releases ?? [],
    };
  });

  return {
    days,
    releases: days.reduce((total, day) => total + day.releases.length, 0),
  };
}

function releaseChip(status: Release["status"]) {
  if (status === "Approved") return "chip chip-mint";
  if (status === "Scheduled") return "chip chip-accent";
  return "chip";
}

function DashboardLoading() {
  return (
    <div className="dash-loading">
      <div className="dash-loading-inner">
        <Logo href="/" />
        <div className="dash-loading-card" role="status" aria-live="polite">
          <span className="dash-spinner" aria-hidden="true" />
          <p>Opening your workspace…</p>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

export function DashboardHome() {
  const router = useRouter();
  const { user, ready } = useAuthSession();

  const [menuOpen, setMenuOpen] = useState(false);
  const [openDay, setOpenDay] = useState<CalendarDay | null>(null);
  const [tracking, setTracking] = useState(false);
  const [focused, setFocused] = useState(false);
  const [baseToday, setBaseToday] = useState(0);
  const [sessionSeconds, setSessionSeconds] = useState(0);
  const [focusLog, setFocusLog] = useState<Record<string, number>>({});
  const focusLogRef = useRef<Record<string, number>>({});
  const dialogRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const closeDay = () => {
    setOpenDay(null);
    triggerRef.current?.focus();
  };

  // Keep Tab inside the day popup while it is open.
  const trapDayTab = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Tab") return;
    const focusable = event.currentTarget.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  useEffect(() => {
    if (ready && !user) router.replace("/login");
  }, [ready, user, router]);

  useEffect(() => {
    if (!menuOpen && !openDay) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [menuOpen, openDay]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        setOpenDay(null);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!openDay) return;
    dialogRef.current?.focus();
  }, [openDay]);

  // Pick up whatever this browser already tracked for today.
  useEffect(() => {
    const log = readFocusLog();
    focusLogRef.current = log;
    setFocusLog(log);
    setBaseToday(log[dayKey()] ?? 0);
    setTracking(true);
  }, []);

  // Focused means the tab is visible *and* the window has focus.
  useEffect(() => {
    const sync = () =>
      setFocused(
        document.visibilityState === "visible" && document.hasFocus()
      );

    sync();
    window.addEventListener("focus", sync);
    window.addEventListener("blur", sync);
    document.addEventListener("visibilitychange", sync);
    return () => {
      window.removeEventListener("focus", sync);
      window.removeEventListener("blur", sync);
      document.removeEventListener("visibilitychange", sync);
    };
  }, []);

  useEffect(() => {
    if (!tracking || !focused) return;
    const id = window.setInterval(
      () => setSessionSeconds((value) => value + 1),
      1000
    );
    return () => window.clearInterval(id);
  }, [tracking, focused]);

  // Fold the live session into today's stored total.
  useEffect(() => {
    if (!tracking || sessionSeconds === 0) return;

    const key = dayKey();
    const next = { ...focusLogRef.current, [key]: baseToday + sessionSeconds };
    focusLogRef.current = next;
    writeFocusLog(next);
    setFocusLog(next);
  }, [tracking, sessionSeconds, baseToday]);

  const handleSignOut = () => {
    signOut();
    router.replace("/login");
  };

  if (!ready || !user) return <DashboardLoading />;

  const firstName = user.displayName.trim().split(/\s+/)[0] || user.username;
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const today = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date());

  const todaySeconds = baseToday + sessionSeconds;
  const week = buildWeek(focusLog, todaySeconds);
  const weekSeconds = week.days.reduce((total, day) => total + day.seconds, 0);
  const peakSeconds = Math.max(1, ...week.days.map((day) => day.seconds));
  const activeDays = week.days.filter((day) => day.seconds > 0).length;

  return (
    <div className="dash-shell">
      <DashboardRail
        user={user}
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        onSignOut={handleSignOut}
        links={[
          {
            key: "overview",
            href: "/dashboard",
            label: "Dashboard",
            icon: LayoutGrid,
          },
        ]}
        active="overview"
      />

      <div className="dash-body">
        <DashboardTopbar onOpenMenu={() => setMenuOpen(true)} />

        <main className="dash-main" id="main">
          <div className="dash-content">
            <section className="dash-hero dash-enter" id="overview">
              <div className="dash-hero-copy">
                <p className="eyebrow">{today}</p>
                <h1 className="dash-hero-title">
                  {greeting},{" "}
                  <span className="display-serif text-accent-ink">
                    {firstName}
                  </span>
                  .
                </h1>
                <p className="dash-hero-sub">
                  {week.releases > 0
                    ? `${week.releases} chapter${
                        week.releases === 1 ? "" : "s"
                      } going out this week. Your group has shipped ${approvedThisMonth} chapters this month.`
                    : `Nothing scheduled this week yet. Your group has shipped ${approvedThisMonth} chapters this month.`}
                </p>
                <div className="dash-hero-tags">
                  <span className="chip chip-mint">
                    <CalendarDays className="h-3 w-3" />
                    {week.releases} release
                    {week.releases === 1 ? "" : "s"} planned
                  </span>
                </div>
              </div>
            </section>

            <div className="dash-grid dash-grid--split">
              <section
                className="dash-panel dash-enter"
                id="earnings"
                style={{ "--dash-delay": "70ms" } as CSSProperties}
              >
                <div className="dash-panel-head">
                  <div>
                    <p className="eyebrow">Money earned</p>
                    <h2 className="dash-panel-title">October</h2>
                  </div>
                  <span className="chip chip-mint">
                    <TrendingUp className="h-3 w-3" />
                    +$36.00
                  </span>
                </div>

                <div className="dash-earnings">
                  <p className="dash-earnings-value">
                    <CountUp
                      value={earningsThisMonth}
                      delay={70}
                      format={(amount) => `$${amount.toFixed(2)}`}
                    />
                  </p>
                  <p className="dash-earnings-sub">
                    {approvedThisMonth} approved chapters · about $5.77 each
                  </p>

                  <div className="dash-spark" aria-hidden="true">
                    {earningBars.map((height, index) => (
                      <span
                        key={index}
                        style={
                          {
                            height: `${height}%`,
                            "--dash-bar-delay": `${index * 45}ms`,
                          } as CSSProperties
                        }
                      />
                    ))}
                  </div>
                  <div className="dash-spark-axis" aria-hidden="true">
                    <span>Week 1</span>
                    <span>Week 2</span>
                    <span>Week 3</span>
                    <span>This week</span>
                  </div>

                  <p className="dash-earnings-note">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    Credit follows approved work. Undo an approval and it
                    updates.
                  </p>
                </div>
              </section>

              <section
                className="dash-panel dash-enter"
                id="time"
                style={{ "--dash-delay": "115ms" } as CSSProperties}
              >
                <div className="dash-panel-head">
                  <div>
                    <p className="eyebrow">Time spent</p>
                    <h2 className="dash-panel-title">Tab in focus</h2>
                  </div>
                  {focused ? (
                    <span className="chip chip-mint dash-chip-swap">
                      <span className="status-dot h-1.5 w-1.5" />
                      Tracking
                    </span>
                  ) : (
                    <span className="chip dash-chip-swap">Paused</span>
                  )}
                </div>

                <div className="dash-time">
                  <p className="dash-time-value">
                    <CountUp
                      value={todaySeconds}
                      delay={115}
                      format={formatFocus}
                    />
                  </p>
                  <p className="dash-time-sub">
                    today ·{" "}
                    {formatFocus(sessionSeconds)} this session ·{" "}
                    {formatFocus(weekSeconds)} this week
                  </p>

                  <div
                    className="dash-spark"
                    role="img"
                    aria-label={`Focused time this week: ${week.days
                      .map((day) => `${day.label} ${formatFocus(day.seconds)}`)
                      .join(", ")}`}
                  >
                    {week.days.map((day, index) => (
                      <span
                        key={day.key}
                        data-today={day.isToday ? "true" : undefined}
                        style={
                          {
                            height: `${Math.max(
                              8,
                              Math.round((day.seconds / peakSeconds) * 100)
                            )}%`,
                            "--dash-bar-delay": `${index * 45}ms`,
                          } as CSSProperties
                        }
                      />
                    ))}
                  </div>
                  <div className="dash-spark-axis" aria-hidden="true">
                    {week.days.map((day) => (
                      <span key={day.key}>{day.label.slice(0, 1)}</span>
                    ))}
                  </div>

                  <p className="dash-time-note">
                    <Clock className="h-3.5 w-3.5" />
                    Counted only while this tab is open and focused —{" "}
                    {activeDays} of 7 days so far.
                  </p>
                </div>
              </section>
            </div>

            <section
              className="dash-panel dash-enter"
              id="calendar"
              style={{ "--dash-delay": "160ms" } as CSSProperties}
            >
              <div className="dash-panel-head">
                <div>
                  <p className="eyebrow">Calendar</p>
                  <h2 className="dash-panel-title">This week</h2>
                </div>
                <span className="dash-cal-legend">
                  <span className="dash-cal-dot" aria-hidden="true" />
                  {week.releases === 0
                    ? "No releases"
                    : `${week.releases} release${week.releases === 1 ? "" : "s"}`}
                </span>
              </div>

              <div className="dash-calendar">
                {week.days.map((day, index) => {
                  const count = day.releases.length;
                  const names = day.releases
                    .slice(0, 3)
                    .map((release) => release.series)
                    .join(", ");
                  return (
                    <button
                      type="button"
                      key={day.key}
                      id={`cal-day-${day.key}`}
                      className="dash-cal-day"
                      data-today={day.isToday ? "true" : "false"}
                      data-weekend={index > 4 ? "true" : "false"}
                      data-open={openDay?.key === day.key ? "true" : "false"}
                      style={
                        {
                          "--tile-delay": `${260 + index * 35}ms`,
                        } as CSSProperties
                      }
                      disabled={count === 0}
                      onClick={(event) => {
                        triggerRef.current = event.currentTarget;
                        setOpenDay(day);
                      }}
                      onKeyDown={(event) => {
                        if (
                          event.key !== "ArrowLeft" &&
                          event.key !== "ArrowRight"
                        ) {
                          return;
                        }
                        event.preventDefault();
                        const step = event.key === "ArrowRight" ? 1 : -1;
                        for (
                          let cursor = index + step;
                          cursor >= 0 && cursor < week.days.length;
                          cursor += step
                        ) {
                          if (week.days[cursor].releases.length > 0) {
                            document
                              .getElementById(`cal-day-${week.days[cursor].key}`)
                              ?.focus();
                            break;
                          }
                        }
                      }}
                      aria-haspopup={count > 0 ? "dialog" : undefined}
                      aria-label={
                        count > 0
                          ? `${day.long}, ${count} release${
                              count === 1 ? "" : "s"
                            }`
                          : `${day.long}, no releases`
                      }
                      title={
                        count > 0
                          ? `${day.long} · ${count} chapter${
                              count === 1 ? "" : "s"
                            }: ${names}${count > 3 ? "…" : ""}`
                          : `${day.long} · no releases`
                      }
                    >
                      <span className="dash-cal-name">{day.label}</span>
                      <span className="dash-cal-date">{day.date}</span>
                      <span className="dash-cal-dots" aria-hidden="true">
                        {Array.from({ length: Math.min(count, 5) }).map(
                          (_, dot) => (
                            <span
                              className="dash-cal-dot"
                              key={dot}
                              style={
                                {
                                  "--dot-delay": `${dot * 70}ms`,
                                } as CSSProperties
                              }
                            />
                          )
                        )}
                        {count > 5 ? (
                          <span className="dash-cal-more">+{count - 5}</span>
                        ) : null}
                      </span>
                    </button>
                  );
                })}
              </div>

              <p className="dash-panel-foot-note">
                A dot marks a release day. Select one to see every chapter
                scheduled. Times are shown in your local timezone.
              </p>
            </section>

            <footer className="dash-footer">
              <span>
                Preview build — your session and changes stay in this browser.
              </span>
              <Link href="/" className="dash-link">
                Back to the site
                <ArrowUpRight className="h-3 w-3" />
              </Link>
            </footer>
          </div>
        </main>
      </div>

      {openDay && openDay.releases.length > 0 ? (
        <div className="dash-day-layer" onClick={closeDay}>
          <div
            className="dash-day-popup"
            role="dialog"
            aria-modal="true"
            aria-labelledby="dash-day-title"
            tabIndex={-1}
            ref={dialogRef}
            onKeyDown={trapDayTab}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="dash-day-popup-head">
              <span className="dash-day-badge" aria-hidden="true">
                <span className="dash-day-badge-name">{openDay.label}</span>
                <span className="dash-day-badge-date">{openDay.date}</span>
              </span>
              <div className="dash-day-popup-copy">
                <p className="eyebrow">{relativeDay(openDay)}</p>
                <h2 className="dash-panel-title" id="dash-day-title">
                  {openDay.long}
                </h2>
                <p className="dash-day-popup-sub">
                  {openDay.releases.length} chapter
                  {openDay.releases.length === 1 ? "" : "s"} scheduled
                </p>
              </div>
              <button
                type="button"
                className="dash-icon-btn"
                onClick={closeDay}
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <ul className="dash-release-list">
              {openDay.releases.map((release, index) => (
                <li
                  className="dash-release-row"
                  data-tone={release.tone}
                  key={`${release.series}-${release.chapter}`}
                  style={
                    { "--row-delay": `${index * 55}ms` } as CSSProperties
                  }
                >
                  <span className="dash-release-dot" aria-hidden="true" />
                  <span className="dash-release-main">
                    <span className="dash-release-title">
                      {release.series}
                    </span>
                    <span className="dash-release-meta">
                      Chapter {release.chapter} · {release.time}
                    </span>
                  </span>
                  <span className={releaseChip(release.status)}>
                    {release.status}
                  </span>
                </li>
              ))}
            </ul>

            <p className="dash-day-popup-note">
              <Clock className="h-3 w-3" />
              Times are shown in your local timezone.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
