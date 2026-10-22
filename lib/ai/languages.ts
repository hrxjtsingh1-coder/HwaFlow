/**
 * Source-language facts that both the browser and the server need.
 *
 * Kept out of `prompts.ts` on purpose: the orchestrator (`lib/pipeline.ts`) is a
 * client module, and importing the prompt builders there would bundle every
 * Korean and Japanese style rule into the browser for one lookup. `prompts.ts`
 * imports this file, never the other way round.
 *
 * Manga reads right to left; manhwa and manhua read left to right within a row.
 * Top-to-bottom is the column order in all three.
 */

import type { ReadingDirection, SourceLanguage } from "./types";

export const READING_DIRECTION: Record<SourceLanguage, ReadingDirection> = {
  ko: "ttb",
  ja: "rtl",
  zh: "ttb",
};

export function readingDirectionFor(language: SourceLanguage): ReadingDirection {
  return READING_DIRECTION[language];
}
