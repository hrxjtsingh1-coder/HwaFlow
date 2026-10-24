import { describe, expect, it } from "vitest";

import {
  assertTextPayloadSize,
  chunkWithinByteBudget,
  encodedLengthOf,
  MAX_BLOCK_CHARS,
  splitIntoBatches,
} from "./batch";

describe("splitIntoBatches", () => {
  it("keeps a small batch whole", () => {
    expect(splitIntoBatches([1, 2, 3], 10).map((batch) => batch.length)).toEqual([3]);
  });

  it("splits 11 into 6+5 rather than 10+1", () => {
    const items = Array.from({ length: 11 }, (_, index) => index);
    expect(splitIntoBatches(items, 10).map((batch) => batch.length)).toEqual([6, 5]);
  });

  it("splits 25 into 9+8+8", () => {
    const items = Array.from({ length: 25 }, (_, index) => index);
    expect(splitIntoBatches(items, 10).map((batch) => batch.length)).toEqual([9, 8, 8]);
  });
});

describe("chunkWithinByteBudget", () => {
  it("packs greedily without exceeding the budget", () => {
    const items = [{ n: 1 }, { n: 2 }, { n: 3 }];
    const chunks = chunkWithinByteBudget(items, (item) => item.n, 3);
    expect(chunks.map((chunk) => chunk.length)).toEqual([2, 1]);
  });

  it("gives an oversized item its own chunk instead of dropping it", () => {
    const items = [{ n: 5 }, { n: 1 }];
    const chunks = chunkWithinByteBudget(items, (item) => item.n, 2);
    expect(chunks.map((chunk) => chunk.length)).toEqual([1, 1]);
  });
});

describe("assertTextPayloadSize", () => {
  it("rejects a bubble over the per-block ceiling", () => {
    expect(() =>
      assertTextPayloadSize([{ blocks: [{ text: "x".repeat(MAX_BLOCK_CHARS + 1) }] }])
    ).toThrow(/too large/i);
  });

  it("rejects a chapter with too many panels", () => {
    const panels = Array.from({ length: 201 }, () => ({
      blocks: [{ text: "ok" }],
    }));

    expect(() => assertTextPayloadSize(panels)).toThrow(/too large/i);
  });

  it("accepts a normal chapter", () => {
    expect(() =>
      assertTextPayloadSize([
        { blocks: [{ text: "hello" }, { text: "world" }] },
      ])
    ).not.toThrow();
  });
});

describe("encodedLengthOf", () => {
  it("converts a raw size to the base64 the server measures", () => {
    expect(encodedLengthOf(3_000_000)).toBe(4_000_000);
  });

  it("rounds up so a batch never lands one byte over the cap", () => {
    expect(encodedLengthOf(1)).toBe(2);
  });

  it("treats a negative size as empty rather than NaN", () => {
    expect(encodedLengthOf(-10)).toBe(0);
  });
});
