import { groupAccent, groupMonogram } from "@/lib/groups";

type SeriesCoverProps = {
  title: string;
  coverDataUrl?: string | null;
  className?: string;
  /** Short monogram size, e.g. "lg" on the series banner. */
  size?: "sm" | "md" | "lg";
};

/**
 * Uploaded cover when present, otherwise a deterministic pastel cover built
 * from the title. Purely decorative — the title always sits next to it.
 */
export function SeriesCover({
  title,
  coverDataUrl,
  className,
  size = "md",
}: SeriesCoverProps) {
  return (
    <span
      className={`series-cover series-cover--${size}${className ? ` ${className}` : ""}`}
      data-accent={groupAccent(title)}
      aria-hidden="true"
    >
      {coverDataUrl ? (
        // A data URL, so next/image would add no value here.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={coverDataUrl} alt="" />
      ) : (
        <span className="series-cover-fallback">
          <span className="series-cover-initial">{groupMonogram(title)}</span>
          <span className="series-cover-mark">HwaFlow</span>
        </span>
      )}
    </span>
  );
}
