"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import type { Group, GroupMember } from "@/lib/groups";
import { Layers, Users } from "../icons";
import { GroupAvatar } from "../group-avatar";
import { RoleBadge } from "../role-badge";

type GroupCardProps = {
  group: Group;
  member: GroupMember;
  memberCount: number;
  seriesCount: number;
  active: boolean;
  index?: number;
};

export function GroupCard({
  group,
  member,
  memberCount,
  seriesCount,
  active,
  index = 0,
}: GroupCardProps) {
  return (
    <article
      className="grp-card"
      style={
        {
          "--grp-card-delay": `${Math.min(index, 8) * 45}ms`,
        } as CSSProperties
      }
    >
      <Link
        href={`/groups/${group.id}`}
        className="grp-card-link"
        aria-label={`Open ${group.name}`}
      >
        <div className="grp-card-top">
          <GroupAvatar name={group.name} iconDataUrl={group.iconDataUrl} />
          <span className="chip chip-accent">{group.currency}</span>
        </div>

        <h2 className="grp-card-name">{group.name}</h2>

        <div className="grp-card-role">
          <RoleBadge role={member.role} />
          {active ? (
            <span className="chip chip-mint">Active group</span>
          ) : null}
        </div>

        <div className="grp-card-counts">
          <span className="chip">
            <Users className="h-3 w-3" />
            {memberCount} member{memberCount === 1 ? "" : "s"}
          </span>
          <span className="chip">
            <Layers className="h-3 w-3" />
            {seriesCount} series
          </span>
        </div>
      </Link>
    </article>
  );
}
