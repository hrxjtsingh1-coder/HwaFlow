/**
 * Currency conversion, free of network and React.
 *
 * Two currencies are in play: the group prices its work in `groups.currency`,
 * and each member reads amounts in `profiles.display_currency`. Rates are units
 * of a currency per 1 USD, which makes a conversion a single division:
 *
 *   amount_in_to = amount * per_usd[to] / per_usd[from]
 *
 * JPY and KRW have no minor unit, so they get no decimals anywhere — rounding
 * yen to cents would just be noise.
 */

export const CURRENCIES = ["USD", "EUR", "GBP", "CAD", "AUD", "JPY", "KRW"] as const;

export type Currency = (typeof CURRENCIES)[number];

export const DEFAULT_CURRENCY: Currency = "USD";

export const CURRENCY_DECIMALS: Record<Currency, number> = {
  USD: 2,
  EUR: 2,
  GBP: 2,
  CAD: 2,
  AUD: 2,
  JPY: 0,
  KRW: 0,
};

/** Units of each currency per 1 USD, keyed by ISO code. */
export type Rates = Record<string, number>;

/**
 * Used when `fx_rates` has no row for a currency and the network is down. These
 * are round numbers, not quotes: they keep the UI working, and the next
 * successful refresh replaces them.
 */
export const FALLBACK_RATES: Rates = {
  USD: 1,
  EUR: 0.92,
  GBP: 0.79,
  CAD: 1.36,
  AUD: 1.52,
  JPY: 155,
  KRW: 1370,
};

export function isCurrency(value: string): value is Currency {
  return (CURRENCIES as readonly string[]).includes(value);
}

/** Trims `char(3)` padding and falls back to USD for anything unknown. */
export function toCurrency(value: string | null | undefined): Currency {
  const code = (value ?? "").trim().toUpperCase();
  return isCurrency(code) ? code : DEFAULT_CURRENCY;
}

export function decimalsFor(currency: string): number {
  return CURRENCY_DECIMALS[toCurrency(currency)];
}

/** Rounds to the currency's own precision (whole yen, cents elsewhere). */
export function roundForCurrency(amount: number, currency: string): number {
  const factor = 10 ** decimalsFor(currency);
  return Math.round(amount * factor) / factor;
}

/**
 * Converts between currencies. Missing or nonsensical rates fall back to the
 * built-in table, and an unknown currency leaves the amount untouched rather
 * than turning the page into `NaN`.
 */
export function convert(
  amount: number,
  from: string,
  to: string,
  rates: Rates = FALLBACK_RATES
): number {
  if (!Number.isFinite(amount)) return 0;

  const source = toCurrency(from);
  const target = toCurrency(to);
  if (source === target) return amount;

  const fromRate = usableRate(rates[source]) ?? usableRate(FALLBACK_RATES[source]);
  const toRate = usableRate(rates[target]) ?? usableRate(FALLBACK_RATES[target]);
  if (!fromRate || !toRate) return amount;

  return (amount * toRate) / fromRate;
}

function usableRate(rate: number | undefined): number | undefined {
  return typeof rate === "number" && Number.isFinite(rate) && rate > 0
    ? rate
    : undefined;
}

export type Money = { amount: number; currency: string };

/**
 * Adds amounts that may be in different currencies — an approved chapter keeps
 * the currency it was earned in — and returns one total in `to`.
 */
export function sumInCurrency(
  rows: ReadonlyArray<Money>,
  to: string,
  rates: Rates = FALLBACK_RATES
): number {
  return rows.reduce(
    (total, row) => total + convert(row.amount, row.currency, to, rates),
    0
  );
}
