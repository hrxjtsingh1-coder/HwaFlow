"use client";

import { useEffect, useState } from "react";
import {
  getChapterState,
  subscribeChapters,
  type ChapterState,
} from "./chapters";

/**
 * Reads the browser-local chapter store after mount (so SSR and hydration
 * agree) and keeps every consumer in sync across components, tabs and same-tab
 * writes.
 */
export function useChapters() {
  const [state, setState] = useState<ChapterState | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setState(getChapterState());
    setReady(true);
    return subscribeChapters(() => setState(getChapterState()));
  }, []);

  return { state, ready };
}
