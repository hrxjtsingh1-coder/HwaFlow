/** Shared source-language contract for series metadata and chapter UI. */

export const SOURCE_LANGUAGES = ["ko", "ja", "zh"] as const;
export type SourceLanguage = (typeof SOURCE_LANGUAGES)[number];

export const SOURCE_LANGUAGE_LABELS: Record<SourceLanguage, string> = {
  ko: "Korean",
  ja: "Japanese",
  zh: "Chinese",
};

export function isSourceLanguage(value: unknown): value is SourceLanguage {
  return value === "ko" || value === "ja" || value === "zh";
}
