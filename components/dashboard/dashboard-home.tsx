"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type CSSProperties,
  type SVGProps,
} from "react";
import { getInitials, signOut } from "@/lib/auth";
import {
  activityFeed,
  approvedThisMonth,
  demoGroup,
  earningBars,
  earningsThisMonth,
  initialGlossary,
  initialPipeline,
  initialReviewQueue,
  initialWeek,
  seriesList,
  teamMembers,
  type DashTone,
  type GlossaryTerm,
  type ReviewChapter,
  type TeamMember,
  type WeekDay,
} from "@/lib/dashboard-data";
import { useAuthSession } from "@/lib/use-auth-session";
import {
  AlertCircle,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  Clock,
  Coins,
  Inbox,
  Languages,
  ScanText,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  X,
} from "../icons";
import { Logo } from "../logo";
import { PanelArt } from "../panel-art";
import { DashboardRail } from "./dashboard-rail";
import { DashboardTopbar } from "./dashboard-topbar";
import { UploadDialog, type UploadInput } from "./upload-dialog";

type IconType = ComponentType<SVGProps<SVGSVGElement>>;

type Stat = {
  label: string;
  value: string;
  icon: IconType;
  tone: DashTone;
  delta: string;
  deltaKind: "up" | "warn";
  foot: string;
};

type ToastState = {
  title: string;
  detail: string;
};

const statusChips: Record<ReviewChapter["status"], string> = {
  Polished: "chip chip-mint",
  Translated: "chip chip-accent",
  "First pass": "chip chip-peach",
};

const avatarTones: DashTone[] = ["lavender", "mint", "peach", "sky"];

function StageIcon({
  stage,
  className,
}: {
  stage: "Reading panels" | "Translating" | "Polishing";
  className?: string;
}) {
  if (stage === "Reading panels") return <ScanText className={className} />;
  if (stage === "Translating") return <Languages className={className} />;
  return <Sparkles className={className} />;
}

function releaseChip(status: "Published" | "Scheduled" | "Approved") {
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

export function DashboardHome() {
  const router = useRouter();
  const { user, ready } = useAuthSession();

  const [menuOpen, setMenuOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [queueFilter, setQueueFilter] = useState<"you" | "all">("you");
  const [reviewItems, setReviewItems] = useState<ReviewChapter[]>(
    initialReviewQueue
  );
  const [approvedDelta, setApprovedDelta] = useState(0);
  const [week, setWeek] = useState<WeekDay[]>(initialWeek);
  const [selectedDay, setSelectedDay] = useState(2);
  const [pipeline, setPipeline] = useState(initialPipeline);
  const [glossary, setGlossary] = useState<GlossaryTerm[]>(initialGlossary);
  const [toast, setToast] = useState<ToastState | null>(null);
  const toastTimer = useRef<number | null>(null);

  useEffect(() => {
    if (ready && !user) router.replace("/login");
  }, [ready, user, router]);

  useEffect(() => {
    if (!menuOpen && !uploadOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [menuOpen, uploadOpen]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
    };
  }, []);

  const showToast = useCallback((title: string, detail: string) => {
    setToast({ title, detail });
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 4800);
  }, []);

  const handleSignOut = useCallback(() => {
    signOut();
    router.replace("/login");
  }, [router]);

  const handleApprove = (item: ReviewChapter) => {
    setReviewItems((items) => items.filter((entry) => entry.id !== item.id));
    setApprovedDelta((value) => value + 1);
    setWeek((days) =>
      days.map((day) => ({
        ...day,
        releases: day.releases.map((release) =>
          release.series === item.series && release.chapter === item.chapter
            ? { ...release, status: "Approved" as const }
            : release
        ),
      }))
    );
    showToast(
      `Chapter ${item.chapter} approved`,
      `${item.series} is ready for release.`
    );
  };

  const handleUpload = (input: UploadInput) => {
    const tone: DashTone =
      input.language === "Japanese"
        ? "mint"
        : input.language === "Chinese"
          ? "sky"
          : "lavender";

    setPipeline((jobs) => [
      {
        id: `queued-${Date.now()}`,
        series: input.series,
        chapter: input.chapter,
        stage: "Reading panels",
        detail: `${input.pages} page${input.pages === 1 ? "" : "s"} queued`,
        progress: 3,
        eta: "Starting now",
        tone,
      },
      ...jobs,
    ]);
    setUploadOpen(false);
    showToast(
      `Chapter ${input.chapter} queued`,
      `${input.series} is being read now — it will land in your queue when it's ready.`
    );
  };

  const handleConfirmGlossary = (term: GlossaryTerm) => {
    setGlossary((terms) =>
      terms.map((entry) =>
        entry.id === term.id ? { ...entry, status: "kept" as const } : entry
      )
    );
    showToast(
      "Term confirmed",
      `${term.source} → ${term.target} is now kept across the group.`
    );
  };

  const roster: TeamMember[] = useMemo(() => {
    if (!user) return [];
    const owner: TeamMember = {
      id: user.id,
      name: user.displayName,
      initials: getInitials(user.displayName, user.username),
      role: "Owner",
      status: "online",
      workload: `Reviewing ${reviewItems.length}`,
      tone: "lavender",
      you: true,
    };
    return [owner, ...teamMembers.filter((member) => member.id !== "mira")];
  }, [user, reviewItems.length]);

  if (!ready || !user) return <DashboardLoading />;

  const firstName =
    user.displayName.trim().split(/\s+/)[0] || user.username;
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const today = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date());

  const pendingCount = reviewItems.length;
  const mineCount = reviewItems.filter((item) => item.owner === "you").length;
  const approvedTotal = approvedThisMonth + approvedDelta;
  const selected = week[selectedDay];

  const search = query.trim().toLowerCase();
  const matchesSearch = (value: string) => !search || value.toLowerCase().includes(search);

  const filteredQueue = reviewItems.filter((item) => {
    if (queueFilter === "you" && item.owner !== "you") return false;
    return (
      matchesSearch(item.series) || matchesSearch(`chapter ${item.chapter}`)
    );
  });

  const filteredSeries = seriesList.filter(
    (item) => matchesSearch(item.title) || matchesSearch(item.language)
  );

  const stats: Stat[] = [
    {
      label: "In review",
      value: String(pendingCount),
      icon: Inbox,
      tone: "lavender",
      delta: mineCount ? `${mineCount} need you` : "Clear",
      deltaKind: mineCount ? "warn" : "up",
      foot: mineCount ? "Approve or send back" : "Nothing waiting",
    },
    {
      label: "Active series",
      value: String(seriesList.length),
      icon: BookOpen,
      tone: "sky",
      delta: "+1 this month",
      deltaKind: "up",
      foot: "2 updating this week",
    },
    {
      label: "Approved · Oct",
      value: String(approvedTotal),
      icon: Check,
      tone: "mint",
      delta: "+6 this week",
      deltaKind: "up",
      foot: "Across the group",
    },
    {
      label: "Earnings · Oct",
      value: `$${earningsThisMonth.toFixed(2)}`,
      icon: Coins,
      tone: "peach",
      delta: "+$36.00",
      deltaKind: "up",
      foot: `${approvedTotal} approved · about $5.77 each`,
    },
  ];

  return (
    <>
      <div className="dash-shell">
        <DashboardRail
          user={user}
          reviewCount={mineCount}
          open={menuOpen}
          onClose={() => setMenuOpen(false)}
          onSignOut={handleSignOut}
        />

        <div className="dash-body">
          <DashboardTopbar
            query={query}
            onQueryChange={setQuery}
            onOpenMenu={() => setMenuOpen(true)}
            onOpenUpload={() => setUploadOpen(true)}
          />

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
                    {pendingCount > 0
                      ? `${pendingCount} chapter${
                          pendingCount === 1 ? "" : "s"
                        } in review${
                          mineCount > 0 ? `, ${mineCount} assigned to you` : ""
                        }. Your group has shipped ${approvedTotal} chapters this month.`
                      : `Your review queue is clear. Your group has shipped ${approvedTotal} chapters this month.`}
                  </p>
                  <div className="dash-hero-tags">
                    <span className="chip chip-mint">
                      <span className="status-dot h-1.5 w-1.5" />
                      {mineCount > 0
                        ? `${mineCount} waiting on you`
                        : "Queue clear"}
                    </span>
                    <span className="chip">Next release Fri, Oct 23</span>
                    <span className="chip">
                      {pipeline.length} jobs running
                    </span>
                  </div>
                </div>

                <div className="dash-hero-actions">
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => setUploadOpen(true)}
                  >
                    <Sparkles className="h-4 w-4" />
                    Upload a chapter
                  </button>
                  <a href="#review" className="btn btn-ghost">
                    Go to the queue
                    <ArrowRight className="btn-icon h-4 w-4" />
                  </a>
                </div>
              </section>

              <div className="dash-stats">
                {stats.map((stat, index) => (
                  <article
                    key={stat.label}
                    className="dash-stat dash-enter"
                    data-tone={stat.tone}
                    style={
                      {
                        "--dash-delay": `${70 + index * 45}ms`,
                      } as CSSProperties
                    }
                  >
                    <div className="dash-stat-top">
                      <span className="dash-stat-icon" aria-hidden="true">
                        <stat.icon className="h-4 w-4" />
                      </span>
                      <span className="dash-delta" data-kind={stat.deltaKind}>
                        {stat.delta}
                      </span>
                    </div>
                    <p className="dash-stat-label">{stat.label}</p>
                    <p className="dash-stat-value">{stat.value}</p>
                    <p className="dash-stat-foot">{stat.foot}</p>
                  </article>
                ))}
              </div>

              <div className="dash-grid dash-grid--main">
                <section className="dash-panel" id="review">
                  <div className="dash-panel-head">
                    <div>
                      <p className="eyebrow">Review queue</p>
                      <h2 className="dash-panel-title">Needs your eye</h2>
                    </div>
                    <div className="dash-filter" aria-label="Filter review queue">
                      <button
                        type="button"
                        aria-pressed={queueFilter === "you"}
                        onClick={() => setQueueFilter("you")}
                      >
                        For you
                      </button>
                      <button
                        type="button"
                        aria-pressed={queueFilter === "all"}
                        onClick={() => setQueueFilter("all")}
                      >
                        All
                      </button>
                    </div>
                  </div>

                  <div className="dash-queue">
                    {filteredQueue.length > 0 ? (
                      filteredQueue.map((item) => (
                        <article className="dash-queue-row" key={item.id}>
                          <div className="dash-cover" aria-hidden="true">
                            <PanelArt
                              id={item.coverId}
                              className="dash-cover-art"
                            />
                            <span className="dash-cover-badge">
                              Ch. {item.chapter}
                            </span>
                          </div>

                          <div className="dash-queue-main">
                            <div className="dash-queue-top">
                              <span className={statusChips[item.status]}>
                                {item.status}
                              </span>
                              <span className="dash-queue-updated">
                                <Clock className="h-3 w-3" />
                                {item.updated}
                              </span>
                            </div>
                            <h3 className="dash-queue-title">{item.series}</h3>
                            <p className="dash-queue-sub">
                              Chapter {item.chapter} · {item.pages} pages ·{" "}
                              {item.source} → English
                            </p>
                            <div className="dash-notes">
                              {item.notes.map((note) => (
                                <span className="dash-note" key={note}>
                                  <AlertCircle className="h-3 w-3" />
                                  {note}
                                </span>
                              ))}
                            </div>
                          </div>

                          <div className="dash-queue-actions">
                            <button
                              type="button"
                              className="btn btn-primary btn-sm"
                              onClick={() => handleApprove(item)}
                            >
                              <Check className="h-3.5 w-3.5" />
                              Approve
                            </button>
                          </div>
                        </article>
                      ))
                    ) : (
                      <div className="dash-queue-empty">
                        <span className="dash-empty-icon" aria-hidden="true">
                          <Check className="h-4 w-4" />
                        </span>
                        <p>
                          {search
                            ? `No chapters match “${query.trim()}”.`
                            : "You're all caught up."}
                        </p>
                        <span>
                          {search
                            ? "Try a different search, or switch to All."
                            : "New chapters will land here when they're ready."}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="dash-panel-foot">
                    <span>
                      {filteredQueue.length} of {reviewItems.length} chapter
                      {reviewItems.length === 1 ? "" : "s"}
                    </span>
                    <button
                      type="button"
                      className="dash-link"
                      onClick={() =>
                        setQueueFilter((value) =>
                          value === "you" ? "all" : "you"
                        )
                      }
                    >
                      {queueFilter === "you" ? "Show all" : "Only mine"}
                      <ArrowRight className="h-3 w-3" />
                    </button>
                  </div>
                </section>

                <div className="dash-side">
                  <section className="dash-panel">
                    <div className="dash-panel-head">
                      <div>
                        <p className="eyebrow">Release week</p>
                        <h2 className="dash-panel-title">Oct 19 – 25</h2>
                      </div>
                      <span className="chip chip-mint">On track</span>
                    </div>

                    <div className="dash-week" aria-label="Pick a day this week">
                      {week.map((day, index) => (
                        <button
                          key={day.day + day.date}
                          type="button"
                          className="dash-day"
                          data-selected={selectedDay === index ? "true" : "false"}
                          onClick={() => setSelectedDay(index)}
                          aria-pressed={selectedDay === index}
                          aria-label={`${day.day} ${day.date}, ${day.releases.length} release${day.releases.length === 1 ? "" : "s"}`}
                        >
                          <span className="dash-day-label">{day.day}</span>
                          <span className="dash-day-num">{day.date}</span>
                          <span className="dash-day-dots" aria-hidden="true">
                            {Array.from({
                              length: Math.min(day.releases.length, 3),
                            }).map((_, dot) => (
                              <span key={dot} />
                            ))}
                          </span>
                        </button>
                      ))}
                    </div>

                    <ul className="dash-release-list">
                      {selected.releases.length > 0 ? (
                        selected.releases.map((release) => (
                          <li
                            className="dash-release"
                            key={`${release.series}-${release.chapter}`}
                          >
                            <span className="dash-release-time">
                              {release.time}
                            </span>
                            <span
                              className="dash-release-bar"
                              data-tone={release.tone}
                              aria-hidden="true"
                            />
                            <span className="dash-release-body">
                              <span className="dash-release-title">
                                {release.series}
                              </span>
                              <span className="dash-release-sub">
                                Chapter {release.chapter}
                              </span>
                            </span>
                            <span className={releaseChip(release.status)}>
                              {release.status}
                            </span>
                          </li>
                        ))
                      ) : (
                        <li className="dash-release-empty">
                          Nothing scheduled. A quiet day.
                        </li>
                      )}
                    </ul>

                    <p className="dash-panel-foot-note">
                      Chapters go out at the times your group sets.
                    </p>
                  </section>

                  <section className="dash-panel" id="earnings">
                    <div className="dash-panel-head">
                      <div>
                        <p className="eyebrow">Your earnings</p>
                        <h2 className="dash-panel-title">October</h2>
                      </div>
                      <span className="chip chip-mint">
                        <TrendingUp className="h-3 w-3" />
                        +$36.00
                      </span>
                    </div>

                    <div className="dash-earnings">
                      <p className="dash-earnings-value">
                        ${earningsThisMonth.toFixed(2)}
                      </p>
                      <p className="dash-earnings-sub">
                        {approvedTotal} approved chapters · about $5.77 each
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
                </div>
              </div>

              <div className="dash-grid dash-grid--split">
                <section className="dash-panel" id="pipeline">
                  <div className="dash-panel-head">
                    <div>
                      <p className="eyebrow">Pipeline</p>
                      <h2 className="dash-panel-title">Working in the background</h2>
                    </div>
                    <span className="chip">{pipeline.length} jobs</span>
                  </div>

                  <div className="dash-jobs">
                    {pipeline.map((job) => (
                      <article className="dash-job" key={job.id}>
                        <div className="dash-job-top">
                          <span
                            className="dash-job-icon"
                            data-tone={job.tone}
                            aria-hidden="true"
                          >
                            <StageIcon
                              stage={job.stage}
                              className="h-4 w-4"
                            />
                          </span>
                          <span className="dash-job-main">
                            <span className="dash-job-title">{job.series}</span>
                            <span className="dash-job-sub">
                              Chapter {job.chapter} · {job.detail}
                            </span>
                          </span>
                          <span className="dash-job-pct">{job.progress}%</span>
                        </div>

                        <div className="dash-progress">
                          <span
                            data-tone={job.tone}
                            style={{ width: `${job.progress}%` }}
                          />
                        </div>

                        <div className="dash-job-foot">
                          <span className="chip">{job.stage}</span>
                          <span>{job.eta}</span>
                        </div>
                      </article>
                    ))}
                  </div>

                  <p className="dash-panel-foot-note">
                    Close the tab if you like. HwaFlow picks up where it left
                    off.
                  </p>
                </section>

                <section className="dash-panel" id="activity">
                  <div className="dash-panel-head">
                    <div>
                      <p className="eyebrow">Activity</p>
                      <h2 className="dash-panel-title">Around the group</h2>
                    </div>
                    <span className="chip">{demoGroup.members} members</span>
                  </div>

                  <ol className="dash-feed">
                    {activityFeed.map((item) => (
                      <li className="dash-feed-item" key={item.id}>
                        <span
                          className="dash-avatar"
                          data-tone={item.tone}
                          aria-hidden="true"
                        >
                          {item.initials}
                        </span>
                        <span className="dash-feed-body">
                          <span className="dash-feed-text">
                            <strong>{item.actor}</strong> {item.action}
                          </span>
                          <span className="dash-feed-meta">
                            {item.meta}
                            {item.credit ? (
                              <span className="dash-feed-credit">
                                {item.credit}
                              </span>
                            ) : null}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ol>
                </section>
              </div>

              <section className="dash-section" id="series">
                <div className="dash-section-head">
                  <div>
                    <p className="eyebrow">Series</p>
                    <h2 className="dash-section-title">Your group&apos;s shelf</h2>
                  </div>
                  <span className="chip">{filteredSeries.length} active</span>
                </div>

                {filteredSeries.length > 0 ? (
                  <div className="dash-series-grid">
                    {filteredSeries.map((item) => (
                      <article
                        className="dash-series-card"
                        data-tone={item.tone}
                        key={item.id}
                      >
                        <div className="dash-series-cover">
                          <PanelArt
                            id={item.coverId}
                            className="dash-series-art"
                          />
                          <span
                            className="dash-series-scrim"
                            aria-hidden="true"
                          />
                          <span className="dash-series-lang">
                            {item.language}
                          </span>
                          <span className="dash-series-chapters">
                            {item.chapters} ch.
                          </span>
                          <div className="dash-series-cover-foot">
                            <p className="dash-series-title">{item.title}</p>
                            <p className="dash-series-stage">{item.stage}</p>
                          </div>
                        </div>

                        <div className="dash-series-info">
                          <div className="dash-series-row">
                            <span>Next release</span>
                            <strong>{item.nextRelease}</strong>
                          </div>
                          <div className="dash-progress dash-progress--sm">
                            <span
                              data-tone={item.tone}
                              style={{ width: `${item.progress}%` }}
                            />
                          </div>
                          <div className="dash-series-foot">
                            <span className="dash-avatars">
                              {item.team.map((initials, index) => (
                                <span
                                  key={initials}
                                  className="dash-series-avatar"
                                  data-tone={avatarTones[index % avatarTones.length]}
                                >
                                  {initials}
                                </span>
                              ))}
                            </span>
                            <span>{item.team.length} on it</span>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="dash-series-empty">
                    <BookOpen className="h-4 w-4" />
                    <p>No series match “{query.trim()}”.</p>
                  </div>
                )}
              </section>

              <div className="dash-grid dash-grid--split">
                <section className="dash-panel" id="glossary">
                  <div className="dash-panel-head">
                    <div>
                      <p className="eyebrow">Glossary</p>
                      <h2 className="dash-panel-title">Names that stay the same</h2>
                    </div>
                    <span className="chip">
                      {
                        glossary.filter((term) => term.status === "check")
                          .length
                      }{" "}
                      to confirm
                    </span>
                  </div>

                  <div className="dash-glossary">
                    {glossary.map((term) => (
                      <div
                        className="dash-glossary-row"
                        data-status={term.status}
                        key={term.id}
                      >
                        <span className="ko dash-glossary-source">
                          {term.source}
                        </span>
                        <ArrowRight className="dash-glossary-arrow h-3 w-3" />
                        <span className="dash-glossary-target">
                          {term.target}
                        </span>
                        <span className="dash-glossary-context">
                          {term.context} · {term.uses} use
                          {term.uses === 1 ? "" : "s"}
                        </span>
                        {term.status === "check" ? (
                          <button
                            type="button"
                            className="dash-confirm"
                            onClick={() => handleConfirmGlossary(term)}
                          >
                            Confirm
                          </button>
                        ) : (
                          <span className="chip chip-mint">
                            <Check className="h-2.5 w-2.5" />
                            Kept
                          </span>
                        )}
                      </div>
                    ))}
                  </div>

                  <p className="dash-panel-foot-note">
                    HwaFlow asks before adding a new name to your group.
                  </p>
                </section>

                <section className="dash-panel" id="team">
                  <div className="dash-panel-head">
                    <div>
                      <p className="eyebrow">Team</p>
                      <h2 className="dash-panel-title">Who&apos;s around</h2>
                    </div>
                    <span className="chip chip-mint">
                      <span className="status-dot h-1.5 w-1.5" />
                      Live
                    </span>
                  </div>

                  <div className="dash-team">
                    {roster.map((member) => (
                      <div className="dash-team-row" key={member.id}>
                        <span
                          className="dash-avatar"
                          data-tone={member.tone}
                          aria-hidden="true"
                        >
                          {member.initials}
                        </span>
                        <span className="dash-team-main">
                          <span className="dash-team-name">
                            {member.name}
                            {member.you ? (
                              <span className="dash-you">You</span>
                            ) : null}
                          </span>
                          <span className="dash-team-role">{member.role}</span>
                        </span>
                        <span className="dash-team-work">
                          <span
                            className="dash-status"
                            data-status={member.status}
                            aria-hidden="true"
                          />
                          {member.workload}
                        </span>
                      </div>
                    ))}
                  </div>

                  <p className="dash-panel-foot-note">
                    1 owner · 2 managers · 3 staff · every screen respects the
                    role.
                  </p>
                </section>
              </div>

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
      </div>

      <UploadDialog
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onSubmit={handleUpload}
      />

      {toast ? (
        <div
          className="dash-toast"
          role="status"
          aria-live="polite"
          key={`${toast.title}-${toast.detail}`}
        >
          <span className="dash-toast-icon" aria-hidden="true">
            <Check className="h-4 w-4" />
          </span>
          <span className="dash-toast-body">
            <span className="dash-toast-title">{toast.title}</span>
            <span className="dash-toast-copy">{toast.detail}</span>
          </span>
          <button
            type="button"
            className="dash-icon-btn"
            onClick={() => setToast(null)}
            aria-label="Dismiss notification"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : null}
    </>
  );
}
