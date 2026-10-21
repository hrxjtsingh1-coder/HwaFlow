"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import { findAccount, getInitials } from "@/lib/auth";
import type { GroupRole } from "@/lib/groups";
import type { Series } from "@/lib/series";
import { SeriesCover } from "./series-cover";

type SeriesTileProps = {
  series: Series;
  assignees: string[];
  viewerRole: GroupRole;
  viewerUsername: string;
  index?: number;
};

export function SeriesTile({
  series,
  assignees,
  viewerRole,
  viewerUsername,
  index = 0,
}: SeriesTileProps) {
  const staffView = viewerRole === "staff";
  const assignedToViewer = assignees.includes(viewerUsername);
  const names = assignees.map(
    (username) => findAccount(username)?.displayName ?? username
  );

  return (
    <Link
      href={`/series/${series.id}`}
      className="grp-tile"
      aria-label={`Open ${series.title}`}
      style={
        {
          "--grp-tile-delay": `${Math.min(index, 6) * 40}ms`,
        } as CSSProperties
      }
    >
      <SeriesCover
        title={series.title}
        coverDataUrl={series.coverDataUrl}
        size="md"
      />

      <span className="grp-tile-body">
        <span className="grp-tile-title">{series.title}</span>

        <span className="grp-tile-meta">
          {series.genre ? (
            <span className="chip chip-accent">{series.genre}</span>
          ) : null}
        </span>

        {staffView ? (
          <span className="grp-tile-assigned">
            <span className="chip chip-mint">
              {assignedToViewer ? "Assigned to you" : "Assigned"}
            </span>
          </span>
        ) : assignees.length === 0 ? (
          <span className="grp-tile-unassigned">Unassigned</span>
        ) : (
          <span
            className="grp-tile-people"
            aria-label={`Assigned to ${names.join(", ")}`}
            title={names.join(", ")}
          >
            {assignees.slice(0, 3).map((username) => {
              const displayName =
                findAccount(username)?.displayName ?? username;
              return (
                <span className="grp-tile-avatar" key={username} aria-hidden="true">
                  {getInitials(displayName, username)}
                </span>
              );
            })}
            {assignees.length > 3 ? (
              <span className="grp-tile-avatar grp-tile-avatar--more">
                +{assignees.length - 3}
              </span>
            ) : null}
          </span>
        )}
      </span>
    </Link>
  );
}
