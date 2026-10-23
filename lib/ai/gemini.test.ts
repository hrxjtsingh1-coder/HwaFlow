import { describe, expect, it } from "vitest";

import { retryAfterMs } from "./gemini";

function responseWith(headers: Record<string, string>): Response {
  return new Response("", { status: 429, headers });
}

describe("retryAfterMs", () => {
  it("reads the delta-seconds form", () => {
    expect(retryAfterMs(responseWith({ "retry-after": "4" }))).toBe(4000);
  });

  it("treats a missing header as unknown", () => {
    expect(retryAfterMs(responseWith({}))).toBeNull();
  });

  it("ignores junk instead of sleeping NaN", () => {
    expect(retryAfterMs(responseWith({ "retry-after": "soon" }))).toBeNull();
  });

  it("clamps an unreasonable wait", () => {
    expect(retryAfterMs(responseWith({ "retry-after": "600" }))).toBe(30_000);
  });

  it("accepts the HTTP-date form", () => {
    const at = new Date(Date.now() + 5000).toUTCString();
    const ms = retryAfterMs(responseWith({ "retry-after": at }));

    expect(ms).not.toBeNull();
    expect(ms as number).toBeGreaterThan(3000);
    expect(ms as number).toBeLessThanOrEqual(30_000);
  });
});
