"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { type Group, type GroupMember } from "@/lib/groups";
import { countSeriesInGroup } from "@/lib/series";
import { useAuthSession } from "@/lib/use-auth-session";
import { useGroups } from "@/lib/use-groups";
import { useSeries } from "@/lib/use-series";
import { Plus, Search, ShieldCheck, X } from "../icons";
import { CreateGroupDrawer } from "./create-group-drawer";
import { GroupCard } from "./group-card";

type SortKey = "newest" | "members" | "name";

type CardModel = {
  group: Group;
  owner: GroupMember | null;
  memberCount: number;
  seriesCount: number;
};

function GridSkeleton() {
  return (
    <div className="admin-grid" aria-hidden="true">
      {[0, 1, 2].map((index) => (
        <div className="admin-skeleton-card" key={index}>
          <span className="admin-skeleton-line admin-skeleton-line--icon" />
          <span className="admin-skeleton-line admin-skeleton-line--title" />
          <span className="admin-skeleton-line" />
          <span className="admin-skeleton-line admin-skeleton-line--short" />
        </div>
      ))}
    </div>
  );
}

export function GroupsView() {
  const { user, ready: authReady } = useAuthSession();
  const { state, ready } = useGroups();
  const { state: seriesState, ready: seriesReady } = useSeries();

  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("newest");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [justCreatedId, setJustCreatedId] = useState<string | null>(null);
  const createdTimer = useRef<number | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (createdTimer.current) window.clearTimeout(createdTimer.current);
    };
  }, []);

  const cards = useMemo<CardModel[]>(() => {
    if (!state) return [];
    return state.groups.map((group) => ({
      group,
      owner:
        state.members.find(
          (member) => member.groupId === group.id && member.role === "owner"
        ) ?? null,
      memberCount: state.members.filter(
        (member) => member.groupId === group.id
      ).length,
      seriesCount: countSeriesInGroup(group.id),
    }));
  }, [state, seriesState]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filtered = term
      ? cards.filter((card) =>
          card.group.name.toLowerCase().includes(term)
        )
      : cards;

    return [...filtered].sort((a, b) => {
      if (sort === "members") {
        if (b.memberCount !== a.memberCount) {
          return b.memberCount - a.memberCount;
        }
        return a.group.name.localeCompare(b.group.name);
      }
      if (sort === "name") {
        return a.group.name.localeCompare(b.group.name);
      }
      return b.group.createdAt.localeCompare(a.group.createdAt);
    });
  }, [cards, search, sort]);

  const handleCreated = (group: Group) => {
    setJustCreatedId(group.id);
    setSort("newest");
    setSearch("");
    if (createdTimer.current) window.clearTimeout(createdTimer.current);
    createdTimer.current = window.setTimeout(
      () => setJustCreatedId(null),
      4200
    );
  };

  if (!authReady || !ready || !seriesReady || !state || !user) {
    return (
      <div className="admin-page">
        <div className="admin-page-head">
          <div>
            <p className="eyebrow">Platform</p>
            <h1 className="admin-page-title">Groups</h1>
            <p className="admin-page-sub">Loading your groups…</p>
          </div>
        </div>
        <GridSkeleton />
      </div>
    );
  }

  const total = cards.length;
  const searching = search.trim().length > 0;

  return (
    <div className="admin-page">
      <section className="admin-page-head admin-enter">
        <div>
          <p className="eyebrow">Platform</p>
          <h1 className="admin-page-title">Groups</h1>
          <p className="admin-page-sub">
            {total === 0
              ? "No groups yet. Every group needs an Owner account that already exists."
              : `${total} group${total === 1 ? "" : "s"} · each one owns its series, members and approvals.`}
          </p>
        </div>
        <button
          type="button"
          className="btn btn-primary admin-page-action"
          onClick={() => setDrawerOpen(true)}
        >
          <Plus className="h-4 w-4" />
          New group
        </button>
      </section>

      <div className="admin-toolbar admin-enter" data-delay="60">
        <div className="admin-search">
          <label className="admin-search-label" htmlFor="group-search">
            Search groups
          </label>
          <div className="admin-search-field">
            <Search className="h-4 w-4" />
            <input
              ref={searchRef}
              id="group-search"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by group name"
              autoComplete="off"
            />
            {searching ? (
              <button
                type="button"
                className="admin-search-clear"
                onClick={() => {
                  setSearch("");
                  searchRef.current?.focus();
                }}
                aria-label="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>
        </div>

        <div className="admin-sort">
          <label className="admin-sort-label" htmlFor="group-sort">
            Sort
          </label>
          <select
            id="group-sort"
            className="admin-select admin-select--compact"
            value={sort}
            onChange={(event) => setSort(event.target.value as SortKey)}
          >
            <option value="newest">Newest</option>
            <option value="members">Most members</option>
            <option value="name">Name A–Z</option>
          </select>
        </div>
      </div>

      {total === 0 ? (
        <section className="admin-empty admin-enter" data-delay="110">
          <span className="admin-empty-icon" aria-hidden="true">
            <ShieldCheck className="h-6 w-6" />
          </span>
          <h2 className="admin-empty-title">No groups yet</h2>
          <p className="admin-empty-copy">
            Only the platform admin creates groups. Start one, assign its Owner
            by username, and that Owner can invite the rest of the team.
          </p>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => setDrawerOpen(true)}
          >
            <Plus className="h-4 w-4" />
            Create your first group
          </button>
        </section>
      ) : visible.length === 0 ? (
        <section className="admin-empty admin-empty--results admin-enter">
          <h2 className="admin-empty-title">
            No groups match &ldquo;{search.trim()}&rdquo;
          </h2>
          <p className="admin-empty-copy">
            Search looks at group names only. Try a shorter term, or clear the
            search to see all {total} groups.
          </p>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              setSearch("");
              searchRef.current?.focus();
            }}
          >
            Clear search
          </button>
        </section>
      ) : (
        <div className="admin-grid">
          {visible.map((card, index) => (
            <GroupCard
              key={card.group.id}
              group={card.group}
              owner={card.owner}
              memberCount={card.memberCount}
              seriesCount={card.seriesCount}
              justCreated={card.group.id === justCreatedId}
              index={index}
            />
          ))}
        </div>
      )}

      <CreateGroupDrawer
        open={drawerOpen}
        actor={user.username}
        existingSlugs={cards.map((card) => card.group.slug)}
        onClose={() => setDrawerOpen(false)}
        onCreated={handleCreated}
      />
    </div>
  );
}
