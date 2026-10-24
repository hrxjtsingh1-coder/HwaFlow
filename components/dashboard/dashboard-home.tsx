"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { signOut } from "@/lib/auth";
import type {
  DashTone,
  Release,
  ReleaseStatus,
} from "@/lib/dashboard-data";
import { formatMoney } from "@/lib/format";
import type { AuthUser } from "@/lib/identity";
import type { DashboardWeek } from "@/lib/server/chapters";
import {
  CalendarDays,
  Clock,
  ShieldCheck,
  TrendingUp,
  X,
} from "../icons";
import { dayKey, useFocus } from "../focus-tracker";
import { DashboardRail } from "./dashboard-rail";
import { DashboardTopbar } from "./dashboard-topbar";
import { workspaceLinks } from "./workspace-nav";

/* ------------------------------------------------------------------ */
/* Focus tracking                                                      */
/* ------------------------------------------------------------------ */

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

/** Human label for a day relative to `now`, e.g. "Today" or "In 2 days". */
function relativeDay(day: CalendarDay, now: Date): string {
  const target = new Date(`${day.key}T00:00:00`);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.round((target.getTime() - today.getTime()) / 86_400_000);

  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  if (diff > 1) return `In ${diff} days`;
  return `${Math.abs(diff)} days ago`;
}

/** Monday-to-Sunday week around today, with the live session folded into today. */
const TONES: DashTone[] = ["mint", "lavender", "peach", "sky"];

function toneFor(seriesId: string): DashTone {
  let hash = 0;
  for (let index = 0; index < seriesId.length; index += 1) {
    hash = (hash * 31 + seriesId.charCodeAt(index)) | 0;
  }
  return TONES[Math.abs(hash) % TONES.length];
}

function serverRelease(
  entry: DashboardWeek["releases"][number]
): Release | null {
  if (entry.chapterNumber === null) return null;

  const status: ReleaseStatus =
    entry.chapterStatus === "approved" ? "Approved" : "Scheduled";

  return {
    series: entry.title,
    chapter: entry.chapterNumber,
    time: "Release day",
    status,
    tone: toneFor(entry.seriesId),
  };
}

function buildWeek(
  log: Record<string, number>,
  liveSeconds: number,
  releases: DashboardWeek["releases"],
  now: Date
): { days: CalendarDay[]; releases: number } {
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
      releases: releases
        .filter((entry) => entry.weekday === index)
        .map(serverRelease)
        .filter((entry): entry is Release => entry !== null),
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

/* ------------------------------------------------------------------ */

type DashboardHomeProps = {
  viewer: AuthUser;
  /** Currency of the viewer's newest group, or USD before they join one. */
  currency: string;
  week: DashboardWeek;
  earnings: number;
  approved: number;
  /** Seconds per day for the last eight days, read from the account. */
  focus: Array<{ day: string; seconds: number }>;
  /**
   * The server's clock at render time. The first client render must use the
   * same instant or the date and week grid hydrate against different values in
   * a different timezone.
   */
  nowIso: string;
};

export function DashboardHome({
  viewer,
  currency,
  week: serverWeek,
  earnings,
  approved,
  focus,
  nowIso,
}: DashboardHomeProps) {
  // `viewer` keeps the existing JSX readable; the page owns auth now.
  const user = viewer;

  // The server instant is the first paint on both sides; the browser's own
  // clock replaces it after mount so the greeting matches the viewer.
  const [now, setNow] = useState(() => new Date(nowIso));

  useEffect(() => {
    setNow(new Date());
  }, []);

  const [menuOpen, setMenuOpen] = useState(false);
  const [openDay, setOpenDay] = useState<CalendarDay | null>(null);
  // Counted once for the whole app by <FocusTracker>, not here.
  const { todaySeconds, sessionSeconds, tracking } = useFocus();
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

  const handleSignOut = () => {
    void signOut();
  };

  const firstName = user.displayName.trim().split(/\s+/)[0] || user.username;
  const today = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(now);

  const shippedLine =
    approved > 0
      ? `You've shipped ${approved} chapter${
          approved === 1 ? "" : "s"
        } this month.`
      : "You haven't shipped any chapters this month yet.";
  const monthLabel = new Intl.DateTimeFormat("en-US", {
    month: "long",
  }).format(now);

  const focusLog = useMemo(
    () => Object.fromEntries(focus.map((entry) => [entry.day, entry.seconds])),
    [focus]
  );

  const week = buildWeek(focusLog, todaySeconds, serverWeek.releases, now);
  const weekSeconds = week.days.reduce((total, day) => total + day.seconds, 0);
  const peakSeconds = Math.max(1, ...week.days.map((day) => day.seconds));

  return (
    <div className="dash-shell">
      <DashboardRail
        user={user}
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        onSignOut={handleSignOut}
        links={workspaceLinks()}
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
                  Welcome back,{" "}
                  <span className="display-serif text-accent-ink">
                    {firstName}
                  </span>
                  .
                </h1>
                <p className="dash-hero-sub">
                  {week.releases > 0
                    ? `${week.releases} chapter${
                        week.releases === 1 ? "" : "s"
                      } going out this week. ${shippedLine}`
                    : `Nothing scheduled this week yet. ${shippedLine}`}
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
                    <h2 className="dash-panel-title">{monthLabel}</h2>
                  </div>
                  {earnings > 0 ? (
                    <span className="chip chip-mint">
                      <TrendingUp className="h-3 w-3" />
                      Earning this month
                    </span>
                  ) : (
                    <span className="chip">Awaiting approvals</span>
                  )}
                </div>

                <div className="dash-earnings">
                  <p className="dash-earnings-value">
                    <CountUp
                      value={earnings}
                      delay={70}
                      format={(amount) => formatMoney(amount, currency)}
                    />
                  </p>
                  <p className="dash-earnings-sub">
                    {approved > 0
                      ? `${approved} approved chapter${
                          approved === 1 ? "" : "s"
                        } · credited to you`
                      : "No approved chapters yet · credit appears here when a Manager approves work"}
                  </p>

                  <p className="dash-earnings-note">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    This adds up every chapter a Manager approved this month,
                    at its series rate.
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
                  {tracking ? (
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
                    This counts the time this tab is open and on screen, and
                    keeps the week with your account on every device.
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
                Each dot is a chapter due that day. Pick a day to see which
                series are scheduled.
              </p>
            </section>
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
                <p className="eyebrow">{relativeDay(openDay, now)}</p>
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
          </div>
        </div>
      ) : null}
    </div>
  );
}
