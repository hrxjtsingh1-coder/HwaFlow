import { describe, expect, it } from "vitest";

import { forwardedIp, throttleMessage } from "./rate-limit";

describe("forwardedIp", () => {
  it("takes the left-most address, which is the client", () => {
    const headers = new Headers({
      "x-forwarded-for": "203.0.113.7, 70.41.3.18, 150.172.238.178",
    });
    expect(forwardedIp(headers)).toBe("203.0.113.7");
  });

  it("falls back to x-real-ip", () => {
    expect(forwardedIp(new Headers({ "x-real-ip": "198.51.100.4" }))).toBe(
      "198.51.100.4"
    );
  });

  it("shares one bucket when the platform sends no address", () => {
    expect(forwardedIp(new Headers())).toBe("unknown");
    expect(forwardedIp(new Headers({ "x-forwarded-for": " , " }))).toBe(
      "unknown"
    );
  });
});

describe("throttleMessage", () => {
  it("rounds up and pluralises", () => {
    expect(throttleMessage(1)).toContain("1 second.");
    expect(throttleMessage(1.2)).toContain("2 seconds.");
    expect(throttleMessage(0)).toContain("1 second.");
  });
});
