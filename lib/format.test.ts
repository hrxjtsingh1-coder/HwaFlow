import { describe, expect, it } from "vitest";
import {
  formatMoney,
  formatRelativeTime,
  formatShortDate,
} from "./format";

describe("formatShortDate", () => {
  it("returns an em dash for missing or unparseable dates", () => {
    expect(formatShortDate(null)).toBe("—");
    expect(formatShortDate(undefined)).toBe("—");
    expect(formatShortDate("not a date")).toBe("—");
  });

  it("formats a real date", () => {
    expect(formatShortDate("2026-10-24T12:00:00Z")).toMatch(/2026/);
  });
});

describe("formatRelativeTime", () => {
  const now = Date.parse("2026-10-24T12:00:00Z");

  it("does not produce negative ages for future timestamps", () => {
    expect(
      formatRelativeTime("2026-10-24T12:05:00Z", now)
    ).toBe("Just now");
  });

  it("covers each unit boundary", () => {
    expect(formatRelativeTime("2026-10-24T11:59:00Z", now)).toBe("1 min ago");
    expect(formatRelativeTime("2026-10-24T10:00:00Z", now)).toBe("2 hr ago");
    expect(formatRelativeTime("2026-10-23T12:00:00Z", now)).toBe("1 d ago");
  });

  it("falls back to a short date after a week", () => {
    expect(formatRelativeTime("2026-10-10T12:00:00Z", now)).toMatch(/2026/);
  });
});

describe("formatMoney", () => {
  it("formats a known currency", () => {
    expect(formatMoney(1234.5, "USD")).toBe("$1,234.50");
  });

  it("falls back instead of throwing on an unknown currency", () => {
    expect(formatMoney(12.5, "NOT_A_CURRENCY")).toBe("12.50 NOT_A_CURRENCY");
  });

  it("drops decimals for currencies without a minor unit", () => {
    expect(formatMoney(1234.5, "JPY")).toBe("¥1,235");
    expect(formatMoney(1234.5, "KRW")).toBe("₩1,235");
  });
});
