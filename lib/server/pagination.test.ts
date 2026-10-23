import { describe, expect, it } from "vitest";

import { selectAllPages } from "./pagination";

describe("selectAllPages", () => {
  it("keeps reading until a short page", async () => {
    const rows = Array.from({ length: 1205 }, (_, index) => index);
    const seen: number[] = [];

    const all = await selectAllPages(async (from, to) => {
      seen.push(from);
      return rows.slice(from, to + 1);
    }, 500);

    expect(all).toHaveLength(1205);
    expect(seen).toEqual([0, 500, 1000]);
  });

  it("stops after one short page", async () => {
    const all = await selectAllPages(async () => [1, 2, 3], 10);
    expect(all).toEqual([1, 2, 3]);
  });

  it("does not loop forever on an exactly-full last page", async () => {
    const rows = Array.from({ length: 1000 }, (_, index) => index);
    const all = await selectAllPages(async (from, to) => rows.slice(from, to + 1), 500);
    expect(all).toHaveLength(1000);
  });
});
