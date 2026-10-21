"use client";

import { useEffect, useState } from "react";
import { getGroupsState, subscribeGroups, type GroupsState } from "./groups";

/**
 * Reads the browser-local groups store after mount (so SSR and hydration
 * agree) and keeps every consumer in sync across components, tabs and
 * same-tab writes.
 */
export function useGroups() {
  const [state, setState] = useState<GroupsState | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setState(getGroupsState());
    setReady(true);
    return subscribeGroups(() => setState(getGroupsState()));
  }, []);

  return { state, ready };
}
