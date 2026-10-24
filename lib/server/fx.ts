/**
 * Exchange rates, read from the database and refreshed from Frankfurter.
 *
 * Frankfurter serves ECB reference rates and needs no key. A snapshot older
 * than 30 days is replaced once per request; if the network is down the stored
 * rows are returned anyway and `convert()` keeps its own fallback for anything
 * missing, so a page never fails because a public API is having a bad day.
 *
 * Writes go through the secret-key client: `fx_rates` has no write policy, and
 * a member must not be able to poison the rates a group prices its work with.
 */

import "server-only";

import { cache } from "react";

import { CURRENCIES, type Rates } from "../money";
import { createAdminClient } from "../supabase/admin";
import { createClient } from "../supabase/server";

const MAX_AGE_DAYS = 30;
const TARGETS = CURRENCIES.filter((code) => code !== "USD");

type RateRow = { currency: string; per_usd: number | string; fetched_at: string };

export const getRates = cache(async (): Promise<Rates> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("fx_rates")
    .select("currency, per_usd, fetched_at");

  const rows = (data ?? []) as RateRow[];

  if (isFresh(rows)) return toRates(rows);

  const fetched = await fetchRates();
  if (!fetched) return toRates(rows);

  // Best effort: a failure here should not break the page that needed rates.
  await persist(fetched).catch(() => undefined);

  return { ...toRates(rows), ...fetched };
});

function toRates(rows: RateRow[]): Rates {
  const rates: Rates = { USD: 1 };
  for (const row of rows) {
    const perUsd = Number(row.per_usd);
    if (Number.isFinite(perUsd) && perUsd > 0) {
      rates[row.currency.trim()] = perUsd;
    }
  }
  return rates;
}

function isFresh(rows: RateRow[]): boolean {
  if (rows.length < CURRENCIES.length) return false;

  const oldest = rows.reduce(
    (cutoff, row) => (row.fetched_at < cutoff ? row.fetched_at : cutoff),
    rows[0].fetched_at
  );
  const age = Date.now() - Date.parse(oldest);

  return Number.isFinite(age) && age < MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
}

/** USD-based rates from Frankfurter, or null when the call fails. */
async function fetchRates(): Promise<Rates | null> {
  try {
    const url = new URL("https://api.frankfurter.app/latest");
    url.searchParams.set("from", "USD");
    url.searchParams.set("to", TARGETS.join(","));

    const response = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return null;

    const payload = (await response.json()) as { rates?: Record<string, unknown> };
    const rates: Rates = { USD: 1 };

    for (const code of TARGETS) {
      const value = Number(payload.rates?.[code]);
      if (!Number.isFinite(value) || value <= 0) return null;
      rates[code] = value;
    }

    return rates;
  } catch {
    return null;
  }
}

async function persist(rates: Rates): Promise<void> {
  const admin = createAdminClient();
  const fetchedAt = new Date().toISOString();

  const { error } = await admin.from("fx_rates").upsert(
    Object.entries(rates).map(([currency, perUsd]) => ({
      currency,
      per_usd: perUsd,
      fetched_at: fetchedAt,
    })),
    { onConflict: "currency" }
  );

  if (error) throw new Error(`[fx] ${error.message}`);
}
