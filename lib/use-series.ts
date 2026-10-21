"use client";

import { useEffect, useState } from "react";
import {
  getSeriesState,
  subscribeSeries,
  type SeriesState,
} from "./series";

/**
 * Reads the browser-local series store after mount (so SSR and hydration
 * agree) and keeps every consumer in sync across components, tabs and
 * same-tab writes.
 */
export function useSeries() {
  const [state, setState] = useState<SeriesState | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setState(getSeriesState());
    setReady(true);
    return subscribeSeries(() => setState(getSeriesState()));
  }, []);

  return { state, ready };
}
