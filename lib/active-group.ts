"use client";

/**
 * Device-local "active group" preference.
 *
 * Which group a person is looking at is a UI convenience, not a permission,
 * so it lives in localStorage rather than a database column. The key is
 * versioned; the map is per username because several accounts can share a
 * browser. The server never reads this.
 */

import { useEffect, useState } from "react";

const KEY = "hwaflow.active-group.v1";
const EVENT = "hwaflow:active-group";

type ActiveGroupMap = Record<string, string>;

function readMap(): ActiveGroupMap {
  if (typeof window === "undefined") return {};

  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    const entries = Object.entries(parsed as Record<string, unknown>).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string"
    );
    return Object.fromEntries(entries);
  } catch {
    return {};
  }
}

function writeMap(map: ActiveGroupMap): void {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(KEY, JSON.stringify(map));
    window.dispatchEvent(new Event(EVENT));
  } catch {
    // A blocked localStorage must not break the page; the badge just stays put.
  }
}

export function getActiveGroupId(username: string): string | null {
  if (!username) return null;
  return readMap()[username] ?? null;
}

export function setActiveGroupId(username: string, groupId: string): void {
  if (!username || !groupId) return;
  writeMap({ ...readMap(), [username]: groupId });
}

export function clearActiveGroupId(username: string): void {
  if (!username) return;
  const map = readMap();
  if (!(username in map)) return;
  delete map[username];
  writeMap(map);
}

/**
 * Reads after mount so SSR and hydration agree. `fallback` keeps the current
 * group highlighted on a device that has never chosen one.
 */
export function useActiveGroupId(
  username: string,
  fallback: string | null = null
): string | null {
  const [activeId, setActiveId] = useState<string | null>(fallback);

  useEffect(() => {
    const sync = () => setActiveId(getActiveGroupId(username) ?? fallback);

    sync();
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);

    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, [username, fallback]);

  return activeId;
}
