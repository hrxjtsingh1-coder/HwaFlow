/**
 * Prompt builders, response schemas and per-language style profiles.
 *
 * Every call pins `responseMimeType: "application/json"` plus an explicit
 * schema, so the provider never hands back prose we have to scrape. The schemas
 * here are the single place the output shape is defined; the routes and the
 * orchestrator consume the parsed result and nothing else.
 *
 * Style is split in two:
 *
 *   CORE_STYLE        language-neutral rules — register, faithfulness, names
 *   LANGUAGE_PROFILES per-language deltas — honorifics, pronouns, politeness,
 *                     transcription rules and few-shot examples
 *
 * `buildTranslatePrompt` and `buildProofreadPrompt` compose the same two blocks,
 * so the editor pass cannot drift away from the translation pass. Adding a
 * language means adding one profile object; nothing else changes.
 *
 * Reading order is per language: Korean and Chinese read left to right within a
 * row, Japanese right to left. The profile owns that, so the orchestrator never
 * hard-codes a direction. `bbox` is normalised 0..1 within its own panel, because
 * that is what lets the viewer draw a box over an image scaled to any size.
 */

import { readingDirectionFor } from "./languages";
import type { ReadingDirection, SourceLanguage } from "./types";

const DIRECTION_RULE: Record<ReadingDirection, string> = {
  ttb: "Read top to bottom. Within one row of bubbles, read left to right.",
  rtl: "Read top to bottom. Within one row of bubbles, read right to left (manga order).",
  ltr: "Read top to bottom. Within one row of bubbles, read left to right.",
};

export type LanguageProfile = {
  name: string;
  honorifics: string[];
  register: string[];
  /** Extract-only: how to transcribe this script off the artwork. */
  transcription: string[];
  examples: Array<{ source: string; weak: string; good: string }>;
};

/* ------------------------------------------------------------------ */
/* Shared style                                                        */
/* ------------------------------------------------------------------ */

export const CORE_STYLE: string[] = [
  "TRANSLATION_STYLE",
  "- Modern webtoon English: spoken, current, 12–18 reading level. Contractions",
  "  where a person would use them. No machine-literal syntax, no period register.",
  "- Keep the source's setting and culture. Never swap names, places, food or forms",
  "  of address for Western equivalents.",
  "- One idea per bubble. Match the source length: same line count where possible,",
  "  never more than 45 characters per line or 3 lines.",
  "- Keep the source's sentence breaks and punctuation intent (… trailing off,",
  "  an em dash for interruption, ?! for shouting).",
  "- Speech is plain. Thoughts read as interior monologue. Captions and narration",
  "  are present tense and neutral. Never blend the three.",
  "",
  "FAITHFULNESS",
  "- Translate what is on the page. No added jokes, no cut content, no censorship,",
  "  no localisation, no translator notes, no explaining jokes.",
  "- Profanity: match the source intensity exactly — never softened, never escalated.",
  "- Sound effects: translate only when they carry meaning inside a bubble. Never",
  "  romanise them, and never translate sound effects that sit in the artwork.",
  "- Output the line only. Do not answer questions, continue the dialogue or add notes.",
  "",
  "NAMES",
  "- Keep family name first, given name second, as in the source: 田中涼 becomes",
  "  Tanaka Ryō, 김지훈 becomes Kim Jihun. Never flip the order and never split a",
  "  name across a line.",
  "- A title attaches to the family name: 田中さん becomes Mr. Tanaka. Never",
  "  \"Tanaka Mr.\".",
  "- Names are glossary-locked. Use the glossary spelling exactly and never",
  "  re-romanise a name per panel.",
];

/* ------------------------------------------------------------------ */
/* Korean                                                              */
/* ------------------------------------------------------------------ */

const KOREAN_PROFILE: LanguageProfile = {
  name: "Korean",
  honorifics: [
    "HONORIFICS AND PRONOUNS (Korean)",
    "- Render an honorific as the English relationship it marks: -ssi becomes Mr./Ms.",
    "  with a surname, or the bare name when the scene is informal; -nim becomes",
    "  boss/sir/ma'am as the situation reads; -hyung/-noona become big bro/big sis only",
    "  where the speaker would actually say it; -sunbae becomes senior; -ah/-ya are",
    "  dropped, English has no vocative particle.",
    "- Keep the romanised suffix only when no English relationship exists (a title with",
    "  no equivalent, a deliberate formality, or a glossary-pinned form).",
    "- Never drop an honorific silently: if it matters, the English must carry the same",
    "  distance or deference somewhere in the line.",
    "- Pronouns and gender only from explicit evidence, established character gender or",
    "  the glossary. Unresolved: repeat the name or use \"they\", never guess.",
  ],
  register: [
    "REGISTER",
    "- Korean speech levels are grammatical; English has no direct equivalent. 해요체 and",
    "  합니다체 become uncontracted, polite English; 반말 becomes contracted, direct",
    "  English. Keep the same person's level stable across panels.",
    "- Sentence-final particles and softeners (요, 죠, 니까, 거든) are tone, not words.",
    "  Do not translate them literally.",
    "- Kinship address (오빠, 언니, 형, 누나) marks relationship, not family. Render the",
    "  relationship or the name, not \"older brother\", when they are not siblings.",
  ],
  transcription: [
    "- Copy the Korean exactly: spacing, ellipses and honorifics, including -님/-씨/-아.",
    "- Keep the original line breaks inside a bubble as \\n.",
    "- Korean dialogue often runs down a tall balloon; keep the reading order top to",
    "  bottom and do not reorder columns.",
  ],
  examples: [
    {
      source: "어머니, 제가 할게요.",
      weak: "Mother, I will do it.",
      good: "Mom, let me handle it.",
    },
    {
      source: "네가 감히 내 앞에서?",
      weak: "You dare in front of me?",
      good: "You've got some nerve, saying that to my face.",
    },
  ],
};

/* ------------------------------------------------------------------ */
/* Japanese                                                            */
/* ------------------------------------------------------------------ */

const JAPANESE_PROFILE: LanguageProfile = {
  name: "Japanese",
  honorifics: [
    "HONORIFICS AND PRONOUNS (Japanese)",
    "- -san becomes Mr./Ms. with a surname in formal or unfamiliar scenes, the bare name",
    "  among peers. -sama becomes Lord/my lady/sir per setting, \"dear\" for a wife to",
    "  her husband. -sensei becomes Dr./teacher/master by setting, never \"sensei\" for a",
    "  doctor. -dono becomes archaic \"Lord\".",
    "- Keep -senpai, -chan and -kun romanised: they are forms of address, not titles, and",
    "  every English substitute sounds wrong (\"Senior\", \"little one\", \"kid\"). Attach",
    "  them surname-first and hyphenated: 田中先輩 becomes Tanaka-senpai, and \"Senpai\"",
    "  alone when no name is spoken. Never \"Senpai Tanaka\".",
    "- -kun and -chan are not gendered by target: a manager uses -kun for a male",
    "  subordinate, a girl uses -chan for a cute boy, a shopkeeper is -chan to an old",
    "  woman. Never map them to \"boy\" or \"girl\".",
    "- 呼び捨て (no suffix) is meaningful: dropping -san signals intimacy, contempt or a",
    "  superior addressing a subordinate. Shift the English address form too — \"Ms.",
    "  Tanaka\" becomes \"Tanaka\" or \"you\".",
    "- お前 / 君 / あなた / 貴様 all become \"you\", so the difference lives in tone:",
    "  貴様 hostile, お前 blunt or familiar, 君 superior-to-subordinate or close peer,",
    "  あなた neutral or a wife addressing her husband.",
    "- Never render 俺/僕/私 as different English first-person words. Voice only.",
    "- Japanese drops the subject constantly; English cannot. Infer it from the preceding",
    "  panels and the speaker's role, and write it in. Unresolved gender: repeat the",
    "  name or use \"they\".",
  ],
  register: [
    "REGISTER",
    "- Politeness is grammatical in Japanese and must be carried by English word choice:",
    "  keigo becomes formal, uncontracted English (\"Would you mind…\", \"I'm afraid…\",",
    "  \"May I…\"), casual speech becomes contracted English.",
    "- Gender-marked speech (俺/僕/あたし/わし, だぜ/だわ/かしら) is voice, not",
    "  vocabulary. Render the personality; never transliterate the marker.",
    "- 「……」 is a beat, not words: render as \"…\" or an em dash, never fill it in.",
    "- Sentence-final particles (ね/よ/ぞ/ぜ/わ/な) carry tone. Do not translate them into",
    "  words; let the English sentence do the work.",
  ],
  transcription: [
    "- Transcribe base characters only: ignore furigana/ruby readings and small kana used",
    "  only as pronunciation guides.",
    "- Normalise half-width katakana to full-width. Keep long-vowel marks (ー), small tsu",
    "  (っ) and Japanese punctuation as written, but strip 「」 from the output.",
    "- Dialogue is often vertical: read right to left, top to bottom, one column at a",
    "  time. Do not reorder columns into left-to-right.",
    "- Keep narration and dialogue as separate blocks.",
  ],
  examples: [
    {
      source: "先輩、無理しないでください。",
      weak: "Senior, please do not push yourself.",
      good: "Senpai, don't push yourself.",
    },
    {
      source: "べ、別にアンタのためにやったんじゃないんだからね！",
      weak: "It is not because it is for you!",
      good: "It's not like I did it for you!",
    },
    {
      source: "お世話になっております。田中です。",
      weak: "I am in your care. I am Tanaka.",
      good: "Thanks for your time. This is Tanaka.",
    },
  ],
};

/* ------------------------------------------------------------------ */
/* Chinese — selectable, not yet tuned                                 */
/* ------------------------------------------------------------------ */

/**
 * Placeholder with the safe rules only. Do not present this as tuned: Chinese
 * needs its own honorific, register and measure-word pass before it ships.
 */
const CHINESE_PROFILE: LanguageProfile = {
  name: "Chinese",
  honorifics: [
    "HONORIFICS AND PRONOUNS (Chinese)",
    "- Keep titles as the relationship: 老师 becomes teacher, 先生 becomes Mr./Ms.,",
    "  阿姨 becomes auntie, 哥/姐 become big bro/big sis only where spoken as address.",
    "- 你 and 您 differ in politeness; carry 您 as formal English, not as a different word.",
    "- Chinese drops subjects and 他/她 sound identical. Infer the subject from context,",
    "  and never change a character's gender without evidence.",
  ],
  register: [
    "REGISTER",
    "- Keep hierarchy and formality in English wording. Classical or literary speech",
    "  becomes formal English; slang stays slang.",
    "- Sentence-final particles (啊, 吧, 呢, 嘛) are tone, not words.",
  ],
  transcription: [
    "- Transcribe Simplified or Traditional exactly as printed, without converting.",
    "- Vertical text reads top to bottom, right to left.",
    "- Keep narration and dialogue as separate blocks.",
  ],
  examples: [],
};

export const LANGUAGE_PROFILES: Record<SourceLanguage, LanguageProfile> = {
  ko: KOREAN_PROFILE,
  ja: JAPANESE_PROFILE,
  zh: CHINESE_PROFILE,
};

/* ------------------------------------------------------------------ */
/* Schemas                                                             */
/* ------------------------------------------------------------------ */

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
                    "The original characters exactly as printed, including honorifics. Connected bubbles are one block, separated by \\n.",
                },
                bbox: {
                  type: "OBJECT",
                  nullable: true,
                  description:
                    "Normalised 0..1 box around this block within its own panel. For a merged group, the union of the balloons.",
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

/* ------------------------------------------------------------------ */
/* Builders                                                            */
/* ------------------------------------------------------------------ */

function exampleLines(
  examples: LanguageProfile["examples"]
): string[] {
  if (examples.length === 0) return [];
  const lines: string[] = ["EXAMPLES", "Match this quality. Do not copy the lines."];
  for (const example of examples) {
    lines.push(`Source: ${example.source}`);
    lines.push(`Do not write: ${example.weak}`);
    lines.push(`Write: ${example.good}`);
    lines.push("");
  }
  return lines;
}

export function buildExtractPrompt(input: {
  panelIds: string[];
} & {
  language: SourceLanguage;
  readingDirection?: ReadingDirection;
}): string {
  const profile = LANGUAGE_PROFILES[input.language];
  const list = input.panelIds.map((id) => `- ${id}`).join("\n");
  const direction = input.readingDirection ?? readingDirectionFor(input.language);

  return [
    `You are given ${input.panelIds.length} comic panel image(s), each followed by its panelId.`,
    "",
    "For EACH panel, return every speech bubble, thought bubble, caption box and",
    "narration line, under that panel's panelId.",
    "",
    "Rules:",
    `- The source language is ${profile.name}.`,
    `- ${DIRECTION_RULE[direction]}`,
    "- GROUP CONNECTED BUBBLES BEFORE TRANSCRIBING. If two or more balloons share one",
    "  tail, connect as one balloon, or carry one sentence split across balloons,",
    "  return them as ONE block with a single line of sourceText. Separate speakers",
    "  are always separate blocks.",
    "- Copy the original characters exactly, including honorifics and punctuation.",
    ...profile.transcription,
    "- Do not translate anything. Do not romanise. Do not add commentary.",
    "- Do not describe the artwork or the characters.",
    "- Skip sound effects that are baked into the art unless they carry dialogue.",
    "- Never merge bubbles across panels and never renumber a panel.",
    "- `bbox` is the box around that block as fractions of ITS OWN panel",
    "  (x, y, w, h all between 0 and 1). Use null if you cannot place it.",
    "- `index` restarts at 0 inside each panel and follows reading order.",
    "- Never invent text. If a glyph is unreadable, transcribe only what you can see",
    "  and set confidence below 0.5.",
    "",
    "Panels, in order:",
    list,
  ].join("\n");
}

function glossaryLines(
  glossary: Array<{ sourceTerm: string; targetTerm: string; category: string }>
): string[] {
  if (glossary.length === 0) return ["- (the glossary is empty)"];
  return glossary.map(
    (term) =>
      `- ${term.sourceTerm} -> ${term.targetTerm} (${term.category})`
  );
}

export function buildTranslatePrompt(input: {
  language: SourceLanguage;
  seriesTitle: string;
  synopsis: string | null;
  chapterNumber: number;
  glossary: Array<{
    sourceTerm: string;
    targetTerm: string;
    category: string;
  }>;
}): string {
  const profile = LANGUAGE_PROFILES[input.language];

  return [
    `Translate this chapter of "${input.seriesTitle}" (chapter ${input.chapterNumber})`,
    `from ${profile.name} into natural English.`,
    "",
    "You receive the whole chapter at once, grouped by panel. Use that: keep",
    "pronouns, forms of address, honorifics and callbacks consistent across panels,",
    "the way a translator who had read the chapter would.",
    "",
    ...CORE_STYLE,
    "",
    ...profile.honorifics,
    "",
    ...profile.register,
    "",
    ...exampleLines(profile.examples),
    "GLOSSARY (mandatory, exact)",
    ...glossaryLines(input.glossary),
    "- If a term is listed, use that English every time it appears, including inside",
    "  longer sentences. Never invent a second rendering.",
    "",
    "OUTPUT",
    "- Return exactly one entry per input block, keyed by panelId + index.",
    "- Never merge, split or renumber blocks.",
    "",
    input.synopsis
      ? `Series synopsis, for context only: ${input.synopsis}`
      : "No synopsis is available; rely on the chapter text.",
  ].join("\n");
}

export function buildProofreadPrompt(input: {
  language: SourceLanguage;
  glossary: Array<{ sourceTerm: string; targetTerm: string; category: string }>;
  seriesTitle: string;
  synopsis: string | null;
  chapterNumber: number;
}): string {
  const profile = LANGUAGE_PROFILES[input.language];

  return [
    `You are editing the English translation of chapter ${input.chapterNumber}`,
    `of "${input.seriesTitle}". You receive the whole chapter grouped by panel.`,
    "",
    "You are editing, not retranslating:",
    "1. Keep the base translation unless it is inaccurate, unnatural, over-length, or",
    "   violates the glossary. If it is already correct, return it unchanged,",
    "   character for character.",
    `2. Fix ${profile.name}-isms, word order, dropped honorifics and lines that cannot`,
    "   fit the bubble. Do not add content, merge, split or improve the plot.",
    "3. Enforce the glossary exactly: every targetTerm must appear wherever its",
    "   sourceTerm appears, spelled exactly as listed.",
    "4. Romanised forms of address are intentional. Never expand them: -senpai is not",
    "   \"senior\", -chan is not \"little\". Names, honorific forms and glossary terms are",
    "   not to be \"improved\", re-romanised or re-spelled.",
    "5. Return exactly one result per input block, keyed by panelId + index.",
    "",
    ...CORE_STYLE,
    "",
    ...profile.honorifics,
    "",
    ...profile.register,
    "",
    "Glossary (source -> English):",
    ...glossaryLines(input.glossary),
    "",
    "Then list NEW recurring proper nouns this chapter introduces — character",
    "names, places, honorifics, items, recurring terms — with a proposed English",
    "target and a category of character, place, honorific, item or term.",
    "Rules for that list:",
    "- Exclude anything already in the glossary above.",
    "- Deduplicate across panels: one entry per term for the whole chapter.",
    "- Only include terms worth keeping consistent later. Return [] if none.",
    "- Store the form as it should appear in English (Tanaka-senpai, Mr. Tanaka),",
    "  never a re-romanisation.",
    "",
    input.synopsis
      ? `Series synopsis, for context only: ${input.synopsis}`
      : "No synopsis is available; rely on the chapter text.",
  ].join("\n");
}
