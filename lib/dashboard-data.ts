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

