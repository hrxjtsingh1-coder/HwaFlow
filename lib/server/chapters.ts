/**
 * Server-side chapter reads.
 *
 * RLS decides visibility through `can_view_chapter`; these functions never
 * branch on role for access. The workspace bundle is one round of queries so a
 * page render does not waterfall.
 *
 * Panel images are private objects in `pages`, signed for a short window. The
 * path is stored in `chapter_pages.original_path`.
 */

import "server-only";

import type { SourceLanguage } from "../ai/types";
import type {
  Chapter,
  ChapterStatus,
  ChapterStatusEvent,
  Panel,
  TextBlock,
} from "../chapters";
import type { GroupMember, GroupRole } from "../groups";
import type { GlossaryTerm } from "../glossary";
import type { AuthUser } from "../identity";
import { convert, roundForCurrency, type Rates } from "../money";
import { createClient } from "../supabase/server";
import { getRates } from "./fx";
import {
  mapGroupMember,
  type GroupMemberRow,
} from "./groups";
import { mapGlossaryRow } from "./glossary";
import { selectAllPages } from "./pagination";
import { signedUrlMap } from "./storage";

/* ------------------------------------------------------------------ */
/* Row shapes                                                          */
/* ------------------------------------------------------------------ */

type ProfileEmbed = { username: string; display_name: string } | null;

export type ChapterRow = {
  id: string;
  series_id: string;
  number: number | string;
  title: string | null;
  status: ChapterStatus;
  rate_snapshot: number | string | null;
  submitted_by: string | null;
  submitted_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
  rejection_note: string | null;
  engine_job_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  submitter?: ProfileEmbed;
  series?: { group_id: string } | null;
};

type PageRow = {
  id: string;
  chapter_id: string;
  page_index: number;
  original_path: string;
  clean_path: string | null;
  width: number;
  height: number;
  byte_size: number;
  storage_state: "stored" | "purged";
  created_at: string;
};

type BlockRow = {
  id: string;
  page_id: string;
  chapter_id: string;
  block_index: number;
  bbox: { x: number; y: number; w: number; h: number } | null;
  source_text: string;
  base_translation: string;
  final_text: string;
  confidence: number | string | null;
  is_edited: boolean;
  edited_by: string | null;
  edited_at: string | null;
};

type EventRow = {
  id: string;
  chapter_id: string;
  from_status: ChapterStatus | null;
  to_status: ChapterStatus;
  actor_id: string;
  note: string | null;
  created_at: string;
};

type SeriesRow = {
  id: string;
  group_id: string;
  title: string;
  source_language: string;
  rate_amount: number | string;
  archived: boolean;
};

/* ------------------------------------------------------------------ */
/* Public shapes                                                       */
/* ------------------------------------------------------------------ */

export type WorkspacePanel = Panel & {
  imageUrl: string | null;
  previewUrl: string | null;
  /** True when an engine render was saved for this page. */
  hasRender: boolean;
};

export type WorkspaceSeries = {
  id: string;
  groupId: string;
  title: string;
  language: SourceLanguage;
  rateAmount: number;
  archived: boolean;
};

export type WorkspaceBundle = {
  chapter: Chapter;
  /** Every chapter in the same series, for the rail. */
  chapters: Chapter[];
  panels: WorkspacePanel[];
  blocks: TextBlock[];
  statusEvents: ChapterStatusEvent[];
  series: WorkspaceSeries;
  group: { id: string; name: string; currency: string };
  viewerMember: GroupMember;
  viewerRole: GroupRole;
  members: GroupMember[];
  /** Active terms only; dismissed terms are not shown in the rail. */
  glossary: GlossaryTerm[];
};

/* ------------------------------------------------------------------ */
/* Mapping                                                             */
/* ------------------------------------------------------------------ */

export function mapChapterRow(row: ChapterRow): Chapter {
  return {
    id: row.id,
    seriesId: row.series_id,
    groupId: row.series?.group_id ?? "",
    number: Number(row.number),
    title: row.title,
    status: row.status,
    rateSnapshot:
      row.rate_snapshot === null ? null : Number(row.rate_snapshot),
    submittedBy: row.submitter?.username ?? null,
    submittedByName: row.submitter?.display_name ?? null,
    submittedAt: row.submitted_at,
    approvedBy: row.approved_by,
    approvedAt: row.approved_at,
    rejectionNote: row.rejection_note,
    engineJobId: row.engine_job_id ?? null,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapPanel(
  row: PageRow,
  imageUrl: string | null,
  previewUrl: string | null
): WorkspacePanel {
  return {
    id: row.id,
    chapterId: row.chapter_id,
    index: row.page_index,
    width: row.width,
    height: row.height,
    byteSize: row.byte_size,
    storageState: row.storage_state,
    createdAt: row.created_at,
    imageUrl,
    // The engine's finished page when one exists. `imageUrl` stays the raw
    // upload on purpose: extraction keeps OCRing the original art.
    previewUrl: previewUrl ?? imageUrl,
    hasRender: Boolean(previewUrl),
  };
}

export type TextBlockRow = BlockRow;

function mapBlock(row: BlockRow): TextBlock {
  return {
    id: row.id,
    panelId: row.page_id,
    chapterId: row.chapter_id,
    index: row.block_index,
    bbox: row.bbox,
    sourceText: row.source_text,
    baseTranslation: row.base_translation,
    finalText: row.final_text,
    confidence: row.confidence === null ? null : Number(row.confidence),
    isEdited: row.is_edited,
    editedBy: row.edited_by,
    editedAt: row.edited_at,
  };
}

export function mapTextBlockRow(row: TextBlockRow): TextBlock {
  return mapBlock(row);
}

function mapEvent(row: EventRow): ChapterStatusEvent {
  return {
    id: row.id,
    chapterId: row.chapter_id,
    fromStatus: row.from_status,
    toStatus: row.to_status,
    actorId: row.actor_id,
    note: row.note,
    createdAt: row.created_at,
  };
}

function sortMembers(a: GroupMember, b: GroupMember): number {
  const rank: Record<GroupRole, number> = { owner: 3, manager: 2, staff: 1 };
  const byRole = rank[b.role] - rank[a.role];
  return byRole !== 0 ? byRole : a.joinedAt.localeCompare(b.joinedAt);
}

function fail(scope: string, message: string): never {
  throw new Error(`[chapters:${scope}] ${message}`);
}

/* ------------------------------------------------------------------ */
/* Reads                                                               */
/* ------------------------------------------------------------------ */

const CHAPTER_COLUMNS = `
  id, series_id, number, title, status, rate_snapshot, submitted_by,
  submitted_at, approved_by, approved_at, rejection_note, engine_job_id,
  created_by, created_at, updated_at,
  submitter:profiles!chapters_submitted_by_fkey(username, display_name),
  series!inner(group_id)
`;

export async function listChaptersForSeries(
  seriesId: string
): Promise<Chapter[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("chapters")
    .select(CHAPTER_COLUMNS)
    .eq("series_id", seriesId)
    .order("number", { ascending: true });

  if (error) fail("listChaptersForSeries", error.message);

  return ((data ?? []) as unknown as ChapterRow[]).map(mapChapterRow);
}

export async function getChapter(chapterId: string): Promise<Chapter | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("chapters")
    .select(CHAPTER_COLUMNS)
    .eq("id", chapterId)
    .maybeSingle();

  if (error) fail("getChapter", error.message);
  if (!data) return null;

  return mapChapterRow(data as unknown as ChapterRow);
}

/**
 * Everything the workspace needs in one call. Returns null when RLS hides the
 * chapter, which is also what an unassigned Staff member gets.
 */
export async function getWorkspaceBundle(
  chapterId: string,
  viewer: AuthUser
): Promise<WorkspaceBundle | null> {
  const supabase = await createClient();

  const { data: chapterData, error: chapterError } = await supabase
    .from("chapters")
    .select(CHAPTER_COLUMNS)
    .eq("id", chapterId)
    .maybeSingle();

  if (chapterError) fail("workspace.chapter", chapterError.message);
  if (!chapterData) return null;

  const chapterRow = chapterData as unknown as ChapterRow;
  const chapter = mapChapterRow(chapterRow);

  const [
    { data: seriesData, error: seriesError },
    { data: pageData, error: pageError },
    { data: eventData, error: eventError },
    { data: siblingData, error: siblingError },
    { data: glossaryData, error: glossaryError },
  ] = await Promise.all([
    supabase
      .from("series")
      .select("id, group_id, title, source_language, rate_amount, archived")
      .eq("id", chapterRow.series_id)
      .maybeSingle(),
    supabase
      .from("chapter_pages")
      .select(
        "id, chapter_id, page_index, original_path, clean_path, width, height, byte_size, storage_state, created_at"
      )
      .eq("chapter_id", chapterId)
      .order("page_index", { ascending: true }),
    supabase
      .from("chapter_status_events")
      .select("id, chapter_id, from_status, to_status, actor_id, note, created_at")
      .eq("chapter_id", chapterId)
      .order("created_at", { ascending: true }),
    supabase
      .from("chapters")
      .select(CHAPTER_COLUMNS)
      .eq("series_id", chapterRow.series_id)
      .order("number", { ascending: true }),
    supabase
      .from("glossary_terms")
      .select(
        "id, series_id, source_term, target_term, category, origins, status, created_by, created_at, updated_at"
      )
      .eq("series_id", chapterRow.series_id)
      .eq("status", "active")
      .order("source_term", { ascending: true }),
  ]);

  if (seriesError) fail("workspace.series", seriesError.message);
  if (pageError) fail("workspace.pages", pageError.message);
  if (eventError) fail("workspace.events", eventError.message);
  if (siblingError) fail("workspace.siblings", siblingError.message);
  if (glossaryError) fail("workspace.glossary", glossaryError.message);
  if (!seriesData) return null;

  // A dense chapter can exceed PostgREST's 1000-row cap, which truncates
  // silently — the workspace would drop its last panels with no error.
  const blockData = await selectAllPages<BlockRow>(async (from, to) => {
    const { data, error } = await supabase
      .from("text_blocks")
      .select(
        "id, page_id, chapter_id, block_index, bbox, source_text, base_translation, final_text, confidence, is_edited, edited_by, edited_at"
      )
      .eq("chapter_id", chapterId)
      // Stable across pages: (page_id, block_index) is unique.
      .order("page_id", { ascending: true })
      .order("block_index", { ascending: true })
      .range(from, to);

    if (error) fail("workspace.blocks", error.message);
    return (data ?? []) as unknown as BlockRow[];
  });

  const seriesRow = seriesData as unknown as SeriesRow;

  const [{ data: groupData, error: groupError }, { data: memberData, error: memberError }] =
    await Promise.all([
      supabase
        .from("groups")
        .select("id, name, currency")
        .eq("id", seriesRow.group_id)
        .maybeSingle(),
      supabase
        .from("group_members")
        .select(
          "id, group_id, user_id, role, invited_by, joined_at, profiles!group_members_user_id_fkey(username, display_name)"
        )
        .eq("group_id", seriesRow.group_id),
    ]);

  if (groupError) fail("workspace.group", groupError.message);
  if (memberError) fail("workspace.members", memberError.message);
  if (!groupData) return null;

  const memberRows = (memberData ?? []) as unknown as GroupMemberRow[];
  const viewerRow = memberRows.find((member) => member.user_id === viewer.id);
  if (!viewerRow) return null;

  const pages = (pageData ?? []) as unknown as PageRow[];
  const [pageUrls, renderUrls] = await Promise.all([
    signedUrlMap(
      supabase,
      "pages",
      pages
        .filter((page) => page.storage_state === "stored")
        .map((page) => page.original_path)
    ),
    // Finished pages survive a purge, so they are signed independently of
    // `storage_state`.
    signedUrlMap(
      supabase,
      "renders",
      pages.flatMap((page) => (page.clean_path ? [page.clean_path] : []))
    ),
  ]);

  return {
    chapter,
    chapters: ((siblingData ?? []) as unknown as ChapterRow[]).map(mapChapterRow),
    panels: pages.map((page) =>
      mapPanel(
        page,
        page.storage_state === "stored"
          ? pageUrls.get(page.original_path) ?? null
          : null,
        page.clean_path ? renderUrls.get(page.clean_path) ?? null : null
      )
    ),
    blocks: ((blockData ?? []) as unknown as BlockRow[]).map(mapBlock),
    statusEvents: ((eventData ?? []) as unknown as EventRow[]).map(mapEvent),
    series: {
      id: seriesRow.id,
      groupId: seriesRow.group_id,
      title: seriesRow.title,
      language: seriesRow.source_language as SourceLanguage,
      rateAmount: Number(seriesRow.rate_amount),
      archived: seriesRow.archived,
    },
    group: {
      id: groupData.id,
      name: groupData.name,
      currency: groupData.currency,
    },
    viewerMember: mapGroupMember(viewerRow),
    viewerRole: viewerRow.role,
    members: memberRows
      .map(mapGroupMember)
      .sort(sortMembers),
    glossary: ((glossaryData ?? []) as unknown as Array<{
      id: string;
      series_id: string;
      source_term: string;
      target_term: string;
      category: GlossaryTerm["category"];
      origins: string[] | null;
      status: GlossaryTerm["status"];
      created_by: string | null;
      created_at: string;
      updated_at: string;
    }>).map(mapGlossaryRow),
  };
}

/* ------------------------------------------------------------------ */
/* Earnings + counts                                                   */
/* ------------------------------------------------------------------ */

function monthBounds(now = new Date()): { start: string; end: string } {
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

type EarningRow = {
  rate_snapshot: number | string | null;
  rate_currency: string | null;
};

/**
 * Adds approved chapter snapshots into one total. Snapshots can be in different
 * currencies — an approved chapter keeps the currency it was earned in — so the
 * sum converts row by row instead of adding raw numbers.
 */
function sumRates(rows: EarningRow[], currency: string, rates: Rates): number {
  const total = rows.reduce(
    (sum, row) =>
      sum +
      convert(
        Number(row.rate_snapshot ?? 0),
        // A snapshot with no currency predates the switch. It is zero in
        // practice; leaving it unconverted keeps it from inventing money.
        row.rate_currency ?? currency,
        currency,
        rates
      ),
    0
  );

  return roundForCurrency(total, currency);
}

/** Approved this calendar month, credited to the viewer. */
export async function countApprovedForViewer(viewer: AuthUser): Promise<number> {
  const supabase = await createClient();
  const { start, end } = monthBounds();

  const { count, error } = await supabase
    .from("chapters")
    .select("id", { count: "exact", head: true })
    .eq("status", "approved")
    .eq("submitted_by", viewer.id)
    .gte("approved_at", start)
    .lt("approved_at", end);

  if (error) fail("countApprovedForViewer", error.message);
  return count ?? 0;
}

/** Approved this calendar month, credited to the viewer, in their currency. */
export async function earningsForViewer(viewer: AuthUser): Promise<number> {
  const supabase = await createClient();
  const { start, end } = monthBounds();

  const { data, error } = await supabase
    .from("chapters")
    .select("rate_snapshot, rate_currency")
    .eq("status", "approved")
    .eq("submitted_by", viewer.id)
    .gte("approved_at", start)
    .lt("approved_at", end);

  if (error) fail("earningsForViewer", error.message);

  return sumRates(
    (data ?? []) as EarningRow[],
    viewer.displayCurrency,
    await getRates()
  );
}

/** Approved this month across one group, in the caller's currency. */
export async function groupEarnings(
  groupId: string,
  displayCurrency: string
): Promise<number> {
  const supabase = await createClient();
  const { start, end } = monthBounds();

  const { data, error } = await supabase
    .from("chapters")
    .select("rate_snapshot, rate_currency, series!inner(group_id)")
    .eq("status", "approved")
    .eq("series.group_id", groupId)
    .gte("approved_at", start)
    .lt("approved_at", end);

  if (error) fail("groupEarnings", error.message);

  return sumRates((data ?? []) as EarningRow[], displayCurrency, await getRates());
}

/** Approved this month for one member inside one group, in the caller's currency. */
export async function memberEarningsInGroup(
  groupId: string,
  userId: string,
  displayCurrency: string
): Promise<number> {
  const supabase = await createClient();
  const { start, end } = monthBounds();

  const { data, error } = await supabase
    .from("chapters")
    .select("rate_snapshot, rate_currency, series!inner(group_id)")
    .eq("status", "approved")
    .eq("submitted_by", userId)
    .eq("series.group_id", groupId)
    .gte("approved_at", start)
    .lt("approved_at", end);

  if (error) fail("memberEarningsInGroup", error.message);

  return sumRates((data ?? []) as EarningRow[], displayCurrency, await getRates());
}

export async function countApprovedForMember(
  groupId: string,
  userId: string
): Promise<number> {
  const supabase = await createClient();
  const { start, end } = monthBounds();

  const { count, error } = await supabase
    .from("chapters")
    .select("id, series!inner(group_id)", { count: "exact", head: true })
    .eq("status", "approved")
    .eq("submitted_by", userId)
    .eq("series.group_id", groupId)
    .gte("approved_at", start)
    .lt("approved_at", end);

  if (error) fail("countApprovedForMember", error.message);
  return count ?? 0;
}

/**
 * Dashboard week: series that release on each weekday plus the viewer's recent
 * chapters. Dates are local to the server, which is close enough for a
 * stateless preview; the calendar labels the day, not a timestamp.
 */
export type DashboardWeek = {
  releases: Array<{
    weekday: number;
    seriesId: string;
    title: string;
    chapterId: string | null;
    chapterNumber: number | null;
    chapterStatus: ChapterStatus | null;
  }>;
  chapters: Array<{ id: string; number: number; status: ChapterStatus; title: string | null; seriesTitle: string }>;
};

export async function dashboardWeek(_viewer: AuthUser): Promise<DashboardWeek> {
  const supabase = await createClient();

  const [{ data: dayData, error: dayError }, { data: chapterData, error: chapterError }] =
    await Promise.all([
      supabase
        .from("series_release_days")
        .select(
          "weekday, series!inner(id, title, archived, group_id, chapters(id, number, status))"
        )
        .eq("series.archived", false),
      supabase
        .from("chapters")
        .select("id, number, status, title, updated_at, series!inner(title)")
        .order("updated_at", { ascending: false })
        .limit(8),
    ]);

  if (dayError) fail("dashboardWeek.releases", dayError.message);
  if (chapterError) fail("dashboardWeek.chapters", chapterError.message);

  const releases = ((dayData ?? []) as unknown as Array<{
    weekday: number;
    series: {
      id: string;
      title: string;
      archived: boolean;
      group_id: string;
      chapters: Array<{
        id: string;
        number: number | string;
        status: ChapterStatus;
      }>;
    };
  }>).map((row) => {
    const latest = [...(row.series.chapters ?? [])].sort(
      (a, b) => Number(b.number) - Number(a.number)
    )[0];

    return {
      weekday: row.weekday,
      seriesId: row.series.id,
      title: row.series.title,
      chapterId: latest?.id ?? null,
      chapterNumber: latest ? Number(latest.number) : null,
      chapterStatus: latest?.status ?? null,
    };
  });

  const chapters = ((chapterData ?? []) as unknown as Array<{
    id: string;
    number: number | string;
    status: ChapterStatus;
    title: string | null;
    updated_at: string;
    series: { title: string };
  }>).map((row) => ({
    id: row.id,
    number: Number(row.number),
    status: row.status,
    title: row.title,
    seriesTitle: row.series.title,
  }));

  return { releases, chapters };
}
