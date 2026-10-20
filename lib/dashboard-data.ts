/**
 * Preview data for the workspace dashboard.
 *
 * Nothing here is persisted yet — the dashboard is a working shell around the
 * browser-local account session. The shapes mirror what the eventual API will
 * return so the UI can swap to real data without a rewrite.
 */

export type DashTone = "mint" | "lavender" | "peach" | "sky";

export type SourceLanguage = "Korean" | "Japanese" | "Chinese";

export type ReviewChapter = {
  id: string;
  series: string;
  chapter: number;
  pages: number;
  status: "Polished" | "Translated" | "First pass";
  updated: string;
  owner: "you" | "manager";
  notes: string[];
  source: SourceLanguage;
  tone: DashTone;
  coverId: string;
};

export type Series = {
  id: string;
  title: string;
  language: string;
  source: SourceLanguage;
  chapters: number;
  stage: string;
  nextRelease: string;
  progress: number;
  tone: DashTone;
  coverId: string;
  team: string[];
};

export type PipelineJob = {
  id: string;
  series: string;
  chapter: number;
  stage: "Reading panels" | "Translating" | "Polishing";
  detail: string;
  progress: number;
  eta: string;
  tone: DashTone;
};

export type ActivityItem = {
  id: string;
  actor: string;
  initials: string;
  action: string;
  meta: string;
  tone: DashTone;
  credit?: string;
};

export type ReleaseStatus = "Published" | "Scheduled" | "Approved";

export type Release = {
  series: string;
  chapter: number;
  time: string;
  status: ReleaseStatus;
  tone: DashTone;
};

export type WeekDay = {
  day: string;
  date: number;
  releases: Release[];
};

export type GlossaryTerm = {
  id: string;
  source: string;
  target: string;
  context: string;
  status: "kept" | "check";
  uses: number;
};

export type TeamMember = {
  id: string;
  name: string;
  initials: string;
  role: "Owner" | "Manager" | "Staff";
  status: "online" | "away" | "offline";
  workload: string;
  tone: DashTone;
  you?: boolean;
};

export type Notification = {
  id: string;
  title: string;
  body: string;
  time: string;
  tone: DashTone;
  unread: boolean;
};

export const demoGroup = {
  name: "Paper Lantern Scans",
  members: 8,
  activeSeries: 4,
  role: "Owner",
};

export const approvedThisMonth = 32;
export const earningsThisMonth = 184.5;

export const initialReviewQueue: ReviewChapter[] = [
  {
    id: "villainess-42",
    series: "The Villainess Reborn",
    chapter: 42,
    pages: 38,
    status: "Polished",
    updated: "12 min ago",
    owner: "you",
    notes: ["3 glossary notes", "1 line to re-check"],
    source: "Korean",
    tone: "lavender",
    coverId: "dash-villainess",
  },
  {
    id: "moonlit-17",
    series: "Moonlit Clinic",
    chapter: 17,
    pages: 24,
    status: "Translated",
    updated: "41 min ago",
    owner: "you",
    notes: ["Waiting on your pass"],
    source: "Japanese",
    tone: "mint",
    coverId: "dash-moonlit",
  },
  {
    id: "cartographer-08",
    series: "The Cartographer's Apprentice",
    chapter: 8,
    pages: 31,
    status: "Polished",
    updated: "2 hrs ago",
    owner: "manager",
    notes: ["1 new name to confirm"],
    source: "Chinese",
    tone: "sky",
    coverId: "dash-cartographer",
  },
];

export const seriesList: Series[] = [
  {
    id: "villainess",
    title: "The Villainess Reborn",
    language: "Korean → English",
    source: "Korean",
    chapters: 42,
    stage: "Chapter 42 in review",
    nextRelease: "Today, 6:00 PM",
    progress: 84,
    tone: "lavender",
    coverId: "dash-series-villainess",
    team: ["MK", "JP", "YS"],
  },
  {
    id: "moonlit",
    title: "Moonlit Clinic",
    language: "Japanese → English",
    source: "Japanese",
    chapters: 17,
    stage: "Chapter 18 translating",
    nextRelease: "Fri, Oct 23",
    progress: 61,
    tone: "mint",
    coverId: "dash-series-moonlit",
    team: ["SI", "AR", "RW"],
  },
  {
    id: "cartographer",
    title: "The Cartographer's Apprentice",
    language: "Chinese → English",
    source: "Chinese",
    chapters: 8,
    stage: "Chapter 9 reading panels",
    nextRelease: "Fri, Oct 23",
    progress: 38,
    tone: "sky",
    coverId: "dash-series-cartographer",
    team: ["JP", "SI"],
  },
  {
    id: "sword-saint",
    title: "Second Life of a Sword Saint",
    language: "Korean → English",
    source: "Korean",
    chapters: 61,
    stage: "Chapter 62 polishing",
    nextRelease: "Sat, Oct 24",
    progress: 92,
    tone: "peach",
    coverId: "dash-series-sword-saint",
    team: ["MK", "RW", "YS"],
  },
];

export const initialPipeline: PipelineJob[] = [
  {
    id: "moonlit-18",
    series: "Moonlit Clinic",
    chapter: 18,
    stage: "Translating",
    detail: "Pages 12–18 of 24",
    progress: 68,
    eta: "About 2 min left",
    tone: "mint",
  },
  {
    id: "cartographer-09",
    series: "The Cartographer's Apprentice",
    chapter: 9,
    stage: "Reading panels",
    detail: "Page 11 of 31",
    progress: 34,
    eta: "About 6 min left",
    tone: "sky",
  },
  {
    id: "sword-saint-62",
    series: "Second Life of a Sword Saint",
    chapter: 62,
    stage: "Polishing",
    detail: "Second pass · reading for flow",
    progress: 91,
    eta: "Almost ready",
    tone: "lavender",
  },
];

export const activityFeed: ActivityItem[] = [
  {
    id: "approved-41",
    actor: "Mira Kwon",
    initials: "MK",
    action: "approved Chapter 41 of The Villainess Reborn",
    meta: "12 min ago",
    tone: "mint",
    credit: "+$5.77 credited to Jun",
  },
  {
    id: "uploaded-42",
    actor: "Jun Park",
    initials: "JP",
    action: "uploaded 38 pages for Chapter 42",
    meta: "36 min ago",
    tone: "lavender",
  },
  {
    id: "glossary",
    actor: "You",
    initials: "YO",
    action: "kept 언니 → sis in the glossary",
    meta: "1 hr ago",
    tone: "peach",
    credit: "14 uses remembered",
  },
  {
    id: "scheduled",
    actor: "Sana Ito",
    initials: "SI",
    action: "scheduled Moonlit Clinic Chapter 17 for Friday",
    meta: "3 hrs ago",
    tone: "sky",
  },
  {
    id: "pipeline",
    actor: "HwaFlow",
    initials: "HF",
    action: "finished the first pass on Chapter 18",
    meta: "4 hrs ago",
    tone: "mint",
  },
];

export const initialWeek: WeekDay[] = [
  {
    day: "Mon",
    date: 19,
    releases: [
      {
        series: "Second Life of a Sword Saint",
        chapter: 61,
        time: "6:00 PM",
        status: "Published",
        tone: "peach",
      },
    ],
  },
  { day: "Tue", date: 20, releases: [] },
  {
    day: "Wed",
    date: 21,
    releases: [
      {
        series: "The Villainess Reborn",
        chapter: 42,
        time: "6:00 PM",
        status: "Scheduled",
        tone: "lavender",
      },
    ],
  },
  { day: "Thu", date: 22, releases: [] },
  {
    day: "Fri",
    date: 23,
    releases: [
      {
        series: "Moonlit Clinic",
        chapter: 17,
        time: "12:00 PM",
        status: "Scheduled",
        tone: "mint",
      },
      {
        series: "The Cartographer's Apprentice",
        chapter: 8,
        time: "5:30 PM",
        status: "Scheduled",
        tone: "sky",
      },
    ],
  },
  {
    day: "Sat",
    date: 24,
    releases: [
      {
        series: "Second Life of a Sword Saint",
        chapter: 62,
        time: "11:00 AM",
        status: "Scheduled",
        tone: "peach",
      },
    ],
  },
  { day: "Sun", date: 25, releases: [] },
];

export const initialGlossary: GlossaryTerm[] = [
  {
    id: "new-name",
    source: "새 이름",
    target: "new name",
    context: "The Cartographer's Apprentice · Ch. 9",
    status: "check",
    uses: 1,
  },
  {
    id: "sister",
    source: "언니",
    target: "sis",
    context: "The Villainess Reborn · every chapter",
    status: "kept",
    uses: 14,
  },
  {
    id: "regression",
    source: "회귀",
    target: "regression",
    context: "The Villainess Reborn · every chapter",
    status: "kept",
    uses: 9,
  },
  {
    id: "majesty",
    source: "폐하",
    target: "Your Majesty",
    context: "Second Life of a Sword Saint · Ch. 62",
    status: "check",
    uses: 2,
  },
];

export const teamMembers: TeamMember[] = [
  {
    id: "mira",
    name: "Mira Kwon",
    initials: "MK",
    role: "Owner",
    status: "online",
    workload: "Reviewing 3",
    tone: "lavender",
    you: true,
  },
  {
    id: "jun",
    name: "Jun Park",
    initials: "JP",
    role: "Manager",
    status: "online",
    workload: "2 chapters",
    tone: "mint",
  },
  {
    id: "sana",
    name: "Sana Ito",
    initials: "SI",
    role: "Manager",
    status: "away",
    workload: "1 chapter",
    tone: "peach",
  },
  {
    id: "yeji",
    name: "Yeji Song",
    initials: "YS",
    role: "Staff",
    status: "online",
    workload: "Typesetting",
    tone: "sky",
  },
  {
    id: "alex",
    name: "Alex Rivera",
    initials: "AR",
    role: "Staff",
    status: "offline",
    workload: "Idle",
    tone: "lavender",
  },
  {
    id: "rin",
    name: "Rin Watanabe",
    initials: "RW",
    role: "Staff",
    status: "online",
    workload: "Translating",
    tone: "mint",
  },
];

export const notifications: Notification[] = [
  {
    id: "ready-review",
    title: "Chapter 42 is ready for you",
    body: "The Villainess Reborn · 3 glossary notes to check before tonight.",
    time: "12 min ago",
    tone: "lavender",
    unread: true,
  },
  {
    id: "translating",
    title: "Moonlit Clinic is translating",
    body: "Chapter 18 is 68% done — about two minutes left.",
    time: "18 min ago",
    tone: "mint",
    unread: true,
  },
  {
    id: "mention",
    title: "Sana mentioned you",
    body: "Can you confirm 새 이름 before Friday's release?",
    time: "1 hr ago",
    tone: "peach",
    unread: false,
  },
];

export const earningBars = [38, 56, 44, 72, 60, 84, 68, 96];
