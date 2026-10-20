/**
 * Preview data for the workspace dashboard.
 *
 * Nothing here is persisted yet — the dashboard is a working shell around the
 * browser-local account session. The shapes mirror what the eventual API will
 * return so the UI can swap to real data without a rewrite.
 */

export type DashTone = "mint" | "lavender" | "peach" | "sky";

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

export type Notification = {
  id: string;
  title: string;
  body: string;
  time: string;
  tone: DashTone;
  unread: boolean;
};

export const approvedThisMonth = 32;
export const earningsThisMonth = 184.5;

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
