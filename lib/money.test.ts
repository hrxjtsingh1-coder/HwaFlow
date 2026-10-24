import { describe, expect, it } from "vitest";

import {
  CURRENCIES,
  FALLBACK_RATES,
  convert,
  decimalsFor,
  isCurrency,
  roundForCurrency,
  sumInCurrency,
  toCurrency,
} from "./money";

describe("toCurrency", () => {
  it("trims char(3) padding and normalises case", () => {
    expect(toCurrency("USD ")).toBe("USD");
    expect(toCurrency(" eur")).toBe("EUR");
  });

  it("falls back to USD for nothing or nonsense", () => {
    expect(toCurrency(null)).toBe("USD");
    expect(toCurrency("XYZ")).toBe("USD");
  });

  it("accepts every supported code", () => {
    for (const code of CURRENCIES) {
      expect(isCurrency(code)).toBe(true);
      expect(toCurrency(code)).toBe(code);
    }
  });
});

describe("decimalsFor", () => {
  it("keeps cents for the dollar family and pounds", () => {
    expect(decimalsFor("USD")).toBe(2);
    expect(decimalsFor("GBP")).toBe(2);
  });

  it("drops them for yen and won", () => {
    expect(decimalsFor("JPY")).toBe(0);
    expect(decimalsFor("KRW")).toBe(0);
  });
});

describe("convert", () => {
  const rates = { USD: 1, EUR: 0.5, JPY: 200 };

  it("is a no-op within one currency", () => {
    expect(convert(42, "USD", "USD", rates)).toBe(42);
  });

  it("divides through the USD base", () => {
    expect(convert(100, "USD", "EUR", rates)).toBe(50);
    expect(convert(50, "EUR", "USD", rates)).toBe(100);
    expect(convert(100, "EUR", "JPY", rates)).toBe(40000);
  });

  it("uses the fallback table when a rate is missing", () => {
    expect(convert(100, "USD", "EUR", {})).toBe(92);
  });

  it("ignores non-positive and non-finite rates", () => {
    expect(convert(100, "USD", "EUR", { USD: 1, EUR: 0 })).toBe(92);
    expect(convert(100, "USD", "EUR", { USD: 1, EUR: Number.NaN })).toBe(92);
  });

  it("never returns NaN", () => {
    expect(convert(Number.NaN, "USD", "EUR", rates)).toBe(0);
  });
});

describe("roundForCurrency", () => {
  it("rounds to the currency's precision", () => {
    expect(roundForCurrency(1.006, "USD")).toBe(1.01);
    expect(roundForCurrency(1234.56, "JPY")).toBe(1235);
  });
});

describe("sumInCurrency", () => {
  it("adds mixed currencies into one total", () => {
    const rows = [
      { amount: 100, currency: "USD" },
      { amount: 50, currency: "EUR" },
      { amount: 10, currency: "USD" },
    ];
    expect(sumInCurrency(rows, "USD", { USD: 1, EUR: 0.5 })).toBe(210);
  });

  it("returns zero for no rows", () => {
    expect(sumInCurrency([], "USD")).toBe(0);
  });

  it("keeps the fallback rates usable", () => {
    expect(sumInCurrency([{ amount: 10, currency: "USD" }], "USD", FALLBACK_RATES)).toBe(10);
  });
});
