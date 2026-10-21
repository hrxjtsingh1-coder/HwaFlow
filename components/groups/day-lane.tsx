"use client";

import type { GroupRole } from "@/lib/groups";
import {
  RELEASE_DAY_LABELS,
  type ReleaseDay,
  type Series,
} from "@/lib/series";
import { SeriesTile } from "./series-tile";

type DayLaneProps = {
  day: ReleaseDay;
  series: Series[];
  viewerRole: GroupRole;
  viewerUsername: string;
  assigneesBySeries: Record<string, string[]>;
};

export function DayLane({
  day,
  series,
  viewerRole,
  viewerUsername,
  assigneesBySeries,
}: DayLaneProps) {
  const label = RELEASE_DAY_LABELS[day];
  const count = series.length;

  return (
    <section className="grp-day" aria-labelledby={`grp-day-${day}`}>
      <div className="grp-day-head">
        <h2 className="grp-day-title" id={`grp-day-${day}`}>
          {label}
        </h2>
        <span className="chip">
          {count} series
        </span>
      </div>

      {count === 0 ? (
        <p className="grp-day-empty">
          {viewerRole === "staff"
            ? `No series assigned to you on ${label}.`
            : `Nothing releasing ${label}.`}
        </p>
      ) : (
        <div
          className="grp-day-track"
          role="region"
          aria-label={`${label} series, scroll horizontally`}
          tabIndex={0}
        >
          {series.map((entry, index) => (
            <SeriesTile
              key={entry.id}
              series={entry}
              assignees={assigneesBySeries[entry.id] ?? []}
              viewerRole={viewerRole}
              viewerUsername={viewerUsername}
              index={index}
            />
          ))}
        </div>
      )}
    </section>
  );
}
