/**
 * Prompt builders and response schemas.
 *
 * Every call pins `responseMimeType: "application/json"` plus an explicit
 * schema, so the provider never hands back prose we have to scrape. The schemas
 * here are the single place the output shape is defined; the routes and the
 * orchestrator consume the parsed result and nothing else.
 *
 * Reading order is spelled out per language: Korean and Chinese read left to
 * right within a row, Japanese right to left. `bbox` is normalised 0..1 within
 * its own panel, because that is what lets the viewer draw a box over an image
 * scaled to any size.
 */

import type { ReadingDirection, SourceLanguage } from "./types";

const LANGUAGE_NAME: Record<SourceLanguage, string> = {
  ko: "Korean",
  ja: "Japanese",
  zh: "Chinese",
};

const DIRECTION_RULE: Record<ReadingDirection, string> = {
  ttb: "Read top to bottom. Within one row of bubbles, read left to right.",
  rtl: "Read top to bottom. Within one row of bubbles, read right to left (manga order).",
  ltr: "Read top to bottom. Within one row of bubbles, read left to right.",
};

type Schema = Record<string, unknown>;

export const EXTRACT_SCHEMA: Schema = {
  type: "OBJECT",
  properties: {
    panels: {
      type: "ARRAY",
      description: "One entry per panel you were given, in the same order.",
      items: {
        type: "OBJECT",
        properties: {
          panelId: { type: "STRING" },
          blocks: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                index: {
                  type: "INTEGER",
                  description: "0-based reading order inside this panel.",
                },
                sourceText: {
                  type: "STRING",
                  description:
                    "The original characters exactly as printed, including honorifics.",
                },
                bbox: {
                  type: "OBJECT",
                  nullable: true,
                  description:
                    "Normalised 0..1 box around this bubble within its own panel.",
                  properties: {
                    x: { type: "NUMBER" },
                    y: { type: "NUMBER" },
                    w: { type: "NUMBER" },
                    h: { type: "NUMBER" },
                  },
                  required: ["x", "y", "w", "h"],
                },
                confidence: { type: "NUMBER", nullable: true },
              },
              required: ["index", "sourceText"],
            },
          },
        },
        required: ["panelId", "blocks"],
      },
    },
  },
  required: ["panels"],
};

export const TRANSLATE_SCHEMA: Schema = {
  type: "OBJECT",
  properties: {
    translations: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          panelId: { type: "STRING" },
          index: { type: "INTEGER" },
          baseTranslation: { type: "STRING" },
        },
        required: ["panelId", "index", "baseTranslation"],
      },
    },
  },
  required: ["translations"],
};

export const PROOFREAD_SCHEMA: Schema = {
  type: "OBJECT",
  properties: {
    results: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          panelId: { type: "STRING" },
          index: { type: "INTEGER" },
          finalText: { type: "STRING" },
        },
        required: ["panelId", "index", "finalText"],
      },
    },
    terms: {
      type: "ARRAY",
      description:
        "New recurring proper nouns introduced by this chapter, deduplicated, excluding anything already in the glossary.",
      items: {
        type: "OBJECT",
        properties: {
          sourceTerm: { type: "STRING" },
          targetTerm: { type: "STRING" },
          category: {
            type: "STRING",
            enum: ["character", "place", "honorific", "item", "term"],
          },
        },
        required: ["sourceTerm", "targetTerm", "category"],
      },
    },
  },
  required: ["results", "terms"],
};

export function buildExtractPrompt(input: {
  panelIds: string[];
  language: SourceLanguage;
  readingDirection: ReadingDirection;
}): string {
  const list = input.panelIds.map((id) => `- ${id}`).join("\n");
  return [
    `You are given ${input.panelIds.length} comic panel image(s), each followed by its panelId.`,
    "",
    "For EACH panel, return every speech bubble, thought bubble, caption box and",
    "narration line, under that panel's panelId.",
    "",
    "Rules:",
    `- The source language is ${LANGUAGE_NAME[input.language]}.`,
    `- ${DIRECTION_RULE[input.readingDirection]}`,
    "- Preserve the original characters exactly, including honorifics and punctuation.",
    "- Do not translate anything. Do not romanise. Do not add commentary.",
    "- Do not describe the artwork or the characters.",
    "- Skip sound effects that are baked into the art unless they carry dialogue.",
    "- Never merge bubbles across panels and never renumber a panel.",
    "- `bbox` is the box around that bubble as fractions of ITS OWN panel",
    "  (x, y, w, h all between 0 and 1). Use null if you cannot place it.",
    "- `index` restarts at 0 inside each panel and follows reading order.",
    "",
    "Panels, in order:",
    list,
  ].join("\n");
}

export function buildTranslatePrompt(input: {
  language: SourceLanguage;
  seriesTitle: string;
  synopsis: string | null;
  chapterNumber: number;
}): string {
  return [
    `Translate this chapter of "${input.seriesTitle}" (chapter ${input.chapterNumber})`,
    `from ${LANGUAGE_NAME[input.language]} into natural English.`,
    "",
    "You receive the whole chapter at once, grouped by panel. Use that: keep",
    "pronouns, forms of address, honorifics and callbacks consistent across",
    "panels, the way a translator who had read the chapter would.",
    "",
    "Rules:",
    "- Faithful and literal first: no added content, no censorship, no localisation.",
    "- Preserve the sentence breaks of the original.",
    "- Keep honorific intent (-nim, -san, oppa, noona …) rather than erasing it.",
    "- Return exactly one entry per input block, keyed by panelId + index.",
    "- Never merge, split or renumber blocks.",
    "",
    input.synopsis
      ? `Series synopsis, for context only: ${input.synopsis}`
      : "No synopsis is available; rely on the chapter text.",
  ].join("\n");
}

export function buildProofreadPrompt(input: {
  glossary: Array<{ sourceTerm: string; targetTerm: string; category: string }>;
  seriesTitle: string;
  synopsis: string | null;
  chapterNumber: number;
}): string {
  const glossaryLines =
    input.glossary.length > 0
      ? input.glossary
          .map(
            (term) =>
              `- ${term.sourceTerm} -> ${term.targetTerm} (${term.category})`
          )
          .join("\n")
      : "- (the glossary is empty)";

  return [
    `You are proofreading the English translation of chapter ${input.chapterNumber}`,
    `of "${input.seriesTitle}". You receive the whole chapter grouped by panel.`,
    "",
    "Tasks:",
    "1. Rewrite each block into natural English that reads like a published comic.",
    "   Keep the speaker's voice consistent across panels. No added content.",
    "2. Enforce the glossary exactly: every targetTerm must appear wherever its",
    "   sourceTerm appears, spelled exactly as listed.",
    "3. Return exactly one result per input block, keyed by panelId + index.",
    "",
    "Glossary (source -> English):",
    glossaryLines,
    "",
    "Then list NEW recurring proper nouns this chapter introduces — character",
    "names, places, honorifics, items, recurring terms — with a proposed English",
    "target and a category of character, place, honorific, item or term.",
    "Rules for that list:",
    "- Exclude anything already in the glossary above.",
    "- Deduplicate across panels: one entry per term for the whole chapter.",
    "- Only include terms worth keeping consistent later. Return [] if none.",
    "",
    input.synopsis
      ? `Series synopsis, for context only: ${input.synopsis}`
      : "No synopsis is available; rely on the chapter text.",
  ].join("\n");
}
