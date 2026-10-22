"use client";

import Link from "next/link";
import { displayNameFor } from "@/lib/groups";
import type { Chapter } from "@/lib/chapters";
import { formatRelativeTime } from "@/lib/format";
import { Plus, Trash } from "../icons";
import { ChapterStatusChip, ChapterStatusDot } from "./chapter-status-dot";

type ChapterListProps = {
  chapters: Chapter[];
  canManage: boolean;
  canCreate: boolean;
  creating: boolean;
  onCreate: () => void;
  onDelete: (chapter: Chapter) => void;
};

function submitterLabel(
  username: string | null,
  displayName?: string | null
): string {
  if (!username) return "—";
  return displayName || displayNameFor(username) || `@${username}`;
}

/**
 * The series page's chapters panel. Replaces the old `Coming soon` placeholder:
 * real rows, a real count, `New chapter` with no dialog, and hover delete for
 * Owner/Manager.
 */
export function ChapterList({
  chapters,
  canManage,
  canCreate,
  creating,
  onCreate,
  onDelete,
}: ChapterListProps) {
  return (
    <section className="sr-panel ch-series-panel" aria-labelledby="chapters-heading">
      <div className="sr-panel-head">
        <div className="sr-panel-heading">
          <p className="eyebrow">Chapters</p>
          <h2 className="sr-panel-title" id="chapters-heading">
            {chapters.length === 0
              ? "No chapters yet"
              : `${chapters.length} chapter${chapters.length === 1 ? "" : "s"}`}
          </h2>
        </div>

        <div className="ch-series-panel-actions">
          <span className="chip">{chapters.length}</span>
          {canCreate ? (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={onCreate}
              disabled={creating}
            >
              <Plus className="h-3.5 w-3.5" />
              {creating ? "Creating…" : "New chapter"}
            </button>
          ) : null}
        </div>
      </div>

      {chapters.length === 0 ? (
        <div className="ch-series-empty">
          <p className="ch-series-empty-title">No chapters yet</p>
          <p className="ch-series-empty-copy">
            {canCreate
              ? "Create the first chapter to start translating."
              : "A Manager or Owner will create the first chapter."}
          </p>
          {canCreate ? (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={onCreate}
              disabled={creating}
            >
              <Plus className="h-3.5 w-3.5" />
              {creating ? "Creating…" : "New chapter"}
            </button>
          ) : null}
        </div>
      ) : (
        <ul className="ch-series-list">
          {chapters.map((chapter) => (
            <li className="ch-series-row" key={chapter.id}>
              <Link
                href={`/chapters/${chapter.id}/workspace`}
                className="ch-series-link"
              >
                <span className="ch-series-number">
                  Chapter {chapter.number}
                </span>
                {chapter.title ? (
                  <span className="ch-series-title">{chapter.title}</span>
                ) : null}
                <span className="ch-series-status">
                  <ChapterStatusDot status={chapter.status} />
                  <ChapterStatusChip status={chapter.status} />
                </span>
                <span className="ch-series-meta">
                  {submitterLabel(chapter.submittedBy, chapter.submittedByName)}
                </span>
                <span className="ch-series-date">
                  {formatRelativeTime(chapter.updatedAt)}
                </span>
              </Link>

              {canManage ? (
                <button
                  type="button"
                  className="ch-series-delete"
                  onClick={() => onDelete(chapter)}
                  aria-label={`Delete Chapter ${chapter.number}`}
                  title={`Delete Chapter ${chapter.number}`}
                >
                  <Trash className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
