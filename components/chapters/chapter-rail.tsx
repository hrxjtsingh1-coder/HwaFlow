"use client";

import Link from "next/link";
import { useRef, type KeyboardEvent, type ReactNode } from "react";
import type { Chapter } from "@/lib/chapters";
import { Plus, Trash } from "../icons";
import { Tooltip } from "../tooltip";
import { ChapterStatusDot } from "./chapter-status-dot";

export type RailTab = "chapters" | "glossary";

type ChapterRailProps = {
  chapters: Chapter[];
  currentChapterId: string;
  canDelete: boolean;
  canCreate: boolean;
  creating: boolean;
  onCreate: () => void;
  onDelete: (chapter: Chapter) => void;
  tab: RailTab;
  onTabChange: (tab: RailTab) => void;
  glossaryCount: number;
  glossary: ReactNode;
};

/**
 * Left column. The tab bar is pinned; only the region under it scrolls.
 *
 * Rows are links to the workspace, so the rail is the way between chapters —
 * there is no chapter overview page to go back to.
 */
export function ChapterRail({
  chapters,
  currentChapterId,
  canDelete,
  canCreate,
  creating,
  onCreate,
  onDelete,
  tab,
  onTabChange,
  glossaryCount,
  glossary,
}: ChapterRailProps) {
  const chaptersTab = useRef<HTMLButtonElement>(null);
  const glossaryTab = useRef<HTMLButtonElement>(null);

  // Newest first: the chapter being translated sits at the top of the rail.
  const orderedChapters = [...chapters].sort((a, b) => b.number - a.number);

  const onTabKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const next: RailTab = tab === "chapters" ? "glossary" : "chapters";
    onTabChange(next);
    (next === "chapters" ? chaptersTab : glossaryTab).current?.focus();
  };

  return (
    <div className="ch-rail">
      <div
        className="ch-tabs"
        role="tablist"
        aria-label="Chapter workspace panels"
        onKeyDown={onTabKey}
      >
        <button
          ref={chaptersTab}
          type="button"
          role="tab"
          id="ch-tab-chapters"
          aria-selected={tab === "chapters"}
          aria-controls="ch-panel-chapters"
          tabIndex={tab === "chapters" ? 0 : -1}
          className="ch-tab"
          data-active={tab === "chapters" ? "true" : "false"}
          onClick={() => onTabChange("chapters")}
        >
          Chapters
          <span className="ch-tab-count">{chapters.length}</span>
        </button>
        <button
          ref={glossaryTab}
          type="button"
          role="tab"
          id="ch-tab-glossary"
          aria-selected={tab === "glossary"}
          aria-controls="ch-panel-glossary"
          tabIndex={tab === "glossary" ? 0 : -1}
          className="ch-tab"
          data-active={tab === "glossary" ? "true" : "false"}
          onClick={() => onTabChange("glossary")}
        >
          Glossary
          <span className="ch-tab-count">{glossaryCount}</span>
        </button>
      </div>

      {tab === "chapters" && canCreate ? (
        <div className="ch-rail-actions">
          <button
            type="button"
            className="btn btn-primary btn-sm ch-rail-new"
            onClick={onCreate}
            disabled={creating}
          >
            <Plus className="h-3.5 w-3.5" />
            {creating ? "Creating…" : "New chapter"}
          </button>
        </div>
      ) : null}

      <div
        className="ch-rail-scroll"
        id="ch-panel-chapters"
        role="tabpanel"
        aria-labelledby="ch-tab-chapters"
        hidden={tab !== "chapters"}
      >
        <ul className="ch-rail-list">
          {orderedChapters.map((chapter) => {
            const current = chapter.id === currentChapterId;
            return (
              <li
                className="ch-rail-row"
                key={chapter.id}
                data-current={current ? "true" : "false"}
              >
                <Link
                  href={`/chapters/${chapter.id}/workspace`}
                  className="ch-rail-link"
                  aria-current={current ? "page" : undefined}
                  title={
                    chapter.title
                      ? `Chapter ${chapter.number} · ${chapter.title}`
                      : `Chapter ${chapter.number}`
                  }
                >
                  <span className="ch-rail-label">
                    Chapter {chapter.number}
                    {chapter.title ? (
                      <span className="ch-rail-sub"> · {chapter.title}</span>
                    ) : null}
                  </span>
                </Link>

                <ChapterStatusDot status={chapter.status} />

                {canDelete ? (
                  <Tooltip label={`Delete Chapter ${chapter.number}`}>
                    <button
                      type="button"
                      className="ch-rail-delete"
                      onClick={() => onDelete(chapter)}
                      aria-label={`Delete Chapter ${chapter.number}`}
                    >
                      <Trash className="h-3.5 w-3.5" />
                    </button>
                  </Tooltip>
                ) : null}
              </li>
            );
          })}
        </ul>
      </div>

      <div
        className="ch-rail-scroll ch-rail-scroll--glossary"
        id="ch-panel-glossary"
        role="tabpanel"
        aria-labelledby="ch-tab-glossary"
        hidden={tab !== "glossary"}
      >
        {glossary}
      </div>
    </div>
  );
}
