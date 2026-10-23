import { describe, expect, it } from "vitest";

import { countByKey } from "./counts";

describe("countByKey", () => {
  it("counts rows per key", () => {
    const rows = [
      { group_id: "a", user_id: "u1" },
      { group_id: "a", user_id: "u2" },
      { group_id: "b", user_id: "u1" },
    ];

    expect(countByKey(rows, "group_id")).toEqual(
      new Map([
        ["a", 2],
        ["b", 1],
      ])
    );
  });

  it("returns an empty map for no rows", () => {
    expect(countByKey([], "group_id").size).toBe(0);
  });
});
