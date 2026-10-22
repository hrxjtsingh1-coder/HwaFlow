"use client";

import { useEffect, useState } from "react";
import { getRunState, subscribeRun, type RunState } from "./pipeline";

/**
 * Live pipeline state for the workspace. The run itself is module-level, so a
 * remount (switching tabs, changing panels) does not lose progress.
 */
export function usePipeline(): RunState {
  const [state, setState] = useState<RunState>(getRunState);

  useEffect(() => subscribeRun(() => setState(getRunState())), []);

  return state;
}
