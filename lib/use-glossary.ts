"use client";

import { useEffect, useState } from "react";
import {
  getGlossaryState,
  subscribeGlossary,
  type GlossaryState,
} from "./glossary";

/** Glossary counterpart of `useChapters` — same mount-then-subscribe shape. */
export function useGlossary() {
  const [state, setState] = useState<GlossaryState | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setState(getGlossaryState());
    setReady(true);
    return subscribeGlossary(() => setState(getGlossaryState()));
  }, []);

  return { state, ready };
}
