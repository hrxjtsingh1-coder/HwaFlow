import { describe, expect, it } from "vitest";

import { decideEngineAccess } from "./engine-access-policy";

describe("decideEngineAccess (default / fail-open)", () => {
  it("allows a definite true", () => {
    expect(decideEngineAccess(true, null)).toBe("allow");
  });

  it("denies a definite false", () => {
    expect(decideEngineAccess(false, null)).toBe("deny");
  });

  it("logs and allows when the RPC errored", () => {
    expect(decideEngineAccess(null, { message: "connection reset" })).toBe("allow-unverified");
    expect(decideEngineAccess(true, { message: "connection reset" })).toBe("allow-unverified");
  });

  it("allows an unexpected null response (legacy default)", () => {
    expect(decideEngineAccess(null, null)).toBe("allow");
  });
});

describe("decideEngineAccess (ENGINE_STRICT_ACCESS=1)", () => {
  it("allows only a definite true with no error", () => {
    expect(decideEngineAccess(true, null, true)).toBe("allow");
  });

  it("denies false, null and errors alike", () => {
    expect(decideEngineAccess(false, null, true)).toBe("deny");
    expect(decideEngineAccess(null, null, true)).toBe("deny");
    expect(decideEngineAccess(null, { message: "timeout" }, true)).toBe("deny");
    expect(decideEngineAccess(true, { message: "timeout" }, true)).toBe("deny");
  });
});
