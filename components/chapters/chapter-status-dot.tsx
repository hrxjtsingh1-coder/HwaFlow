import {
  CHAPTER_STATUS_LABEL,
  type ChapterStatus,
} from "@/lib/chapters";

/**
 * The 8px dot used in the chapter rail and the series list. Colour lives in
 * `chapters.css` under `[data-status]` so status → colour is defined once.
 */
export function ChapterStatusDot({
  status,
  className,
}: {
  status: ChapterStatus;
  className?: string;
}) {
  return (
    <span
      className={`ch-dot${className ? ` ${className}` : ""}`}
      data-status={status}
      role="img"
      aria-label={CHAPTER_STATUS_LABEL[status]}
    />
  );
}

const CHIP_TONE: Record<ChapterStatus, string> = {
  draft: "",
  processing: "chip-peach",
  ready: "",
  submitted: "chip-peach",
  approved: "chip-mint",
  rejected: "chip-danger",
};

export function ChapterStatusChip({ status }: { status: ChapterStatus }) {
  const tone = CHIP_TONE[status];
  return (
    <span className={`chip ch-status-chip${tone ? ` ${tone}` : ""}`}>
      {CHAPTER_STATUS_LABEL[status]}
    </span>
  );
}
