import { describe, expect, it } from "vitest";

import { classifyDbError, messageForDbError } from "./errors";

describe("classifyDbError", () => {
  it("maps a page-position clash to duplicate-panel", () => {
    expect(
      classifyDbError({
        code: "23505",
        message:
          'duplicate key value violates unique constraint "chapter_pages_chapter_id_page_index_key"',
      })
    ).toBe("duplicate-panel");
  });

  it("still maps a chapter-number clash", () => {
    expect(
      classifyDbError({
        code: "23505",
        message:
          'duplicate key value violates unique constraint "chapters_series_id_number_key"',
      })
    ).toBe("duplicate-number");
  });

  it("maps the RPC error codes", () => {
    expect(classifyDbError({ code: "HF001" })).toBe("forbidden");
    expect(classifyDbError({ code: "HF024" })).toBe("bad-transition");
  });

  it("falls back to unknown", () => {
    expect(classifyDbError(null)).toBe("unknown");
    expect(classifyDbError({ code: "XX000", message: "boom" })).toBe("unknown");
  });
});

describe("messageForDbError", () => {
  it("never shows the raw constraint message for a page clash", () => {
    const message = messageForDbError("duplicate-panel", {
      message: 'duplicate key value violates unique constraint "..."',
    });

    expect(message).toMatch(/same position/i);
  });
});
