import { describe, expect, it } from "vitest";
import { getInitials, validateDisplayName, validateUsername } from "./identity";

describe("getInitials", () => {
  it("uses the first two words for a normal name", () => {
    expect(getInitials("Aleksandra Wiśniewska-Kowalczyk")).toBe("AW");
  });

  it("keeps a single short name whole", () => {
    expect(getInitials("Jo")).toBe("JO");
  });

  it("keeps an emoji whole instead of half a surrogate pair", () => {
    // Worst case: a real display name can start with an emoji.
    expect(getInitials("🎨 Mina")).toBe("🎨M");
    expect(getInitials("🎨")).toBe("🎨");
  });

  it("handles non-Latin names without mangling them", () => {
    expect(getInitials("李 小龙")).toBe("李小");
  });

  it("falls back to the username, then to the product initials", () => {
    expect(getInitials("", "jo")).toBe("JO");
    expect(getInitials("   ", "jo")).toBe("JO");
    expect(getInitials("", "")).toBe("HF");
  });
});

describe("validation limits", () => {
  it("accepts the longest allowed display name", () => {
    expect(validateDisplayName("a".repeat(40))).toBeNull();
    expect(validateDisplayName("a".repeat(41))).not.toBeNull();
  });

  it("accepts the longest allowed username", () => {
    expect(validateUsername("a".repeat(24))).toBeNull();
    expect(validateUsername("a".repeat(25))).not.toBeNull();
  });
});
