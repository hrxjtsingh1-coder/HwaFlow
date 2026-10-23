import { describe, expect, it } from "vitest";

import { titlePayload } from "./chapters-format";

describe("titlePayload", () => {
  it("sends an empty string to clear a title, not null", () => {
    expect(titlePayload("")).toBe("");
    expect(titlePayload("   ")).toBe("");
  });

  it("trims a real title", () => {
    expect(titlePayload("  The Long Night  ")).toBe("The Long Night");
  });
});
