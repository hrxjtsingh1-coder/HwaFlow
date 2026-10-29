import { describe, expect, it } from "vitest";
import {
  isSourceLanguage,
  SOURCE_LANGUAGES,
  SOURCE_LANGUAGE_LABELS,
} from "./source-language";

describe("source-language contract", () => {
  it("lists the supported source languages with stable labels", () => {
    expect(SOURCE_LANGUAGES).toEqual(["ko", "ja", "zh"]);
    expect(SOURCE_LANGUAGE_LABELS).toEqual({
      ko: "Korean",
      ja: "Japanese",
      zh: "Chinese",
    });
  });

  it("rejects values outside the supported language set", () => {
    expect(isSourceLanguage("ko")).toBe(true);
    expect(isSourceLanguage("ja")).toBe(true);
    expect(isSourceLanguage("zh")).toBe(true);
    expect(isSourceLanguage("en")).toBe(false);
    expect(isSourceLanguage(null)).toBe(false);
    expect(isSourceLanguage(undefined)).toBe(false);
  });
});
