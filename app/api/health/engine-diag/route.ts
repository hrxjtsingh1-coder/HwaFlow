/** TEMPORARY diagnostic — safe: names, lengths and HTTP statuses only. */
import { NextResponse } from "next/server";
import { engineEnvSnapshot } from "@/lib/engine-cloudflare-env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const keys = Object.keys(process.env);
  const snap = await engineEnvSnapshot();

  let cf: Record<string, unknown> = { available: false };
  try {
    const spec = ["cloudflare", "workers"].join(":");
    const mod: any = await import(/* webpackIgnore: true */ spec);
    const env = (mod && mod.env) || {};
    const cfKeys = Object.keys(env);
    cf = {
      available: true,
      keyCount: cfKeys.length,
      bindingNames: cfKeys.sort(),
      engineKeys: cfKeys.filter((k) => k.startsWith("ENGINE")).sort(),
      tokenLen: typeof env.ENGINE_WEB_TOKEN === "string" ? env.ENGINE_WEB_TOKEN.length : 0,
    };
  } catch (e) {
    cf = { available: false, error: String(e).slice(0, 160) };
  }

  // Probe result: status only, never the token or a response body.
  let probe: Record<string, unknown> = { skipped: true };
  if (snap.apiUrlSet && snap.tokenSet) {
    const t0 = Date.now();
    try {
      const r = await fetch(`${snap.apiUrl.replace(/\/+$/, "")}/v1/kernel/engine-health-probe`, {
        headers: { authorization: `Bearer ${snap.token}` },
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
      });
      probe = { httpStatus: r.status, ms: Date.now() - t0, ok: r.status === 404 };
    } catch (e) {
      probe = { error: String(e).slice(0, 200), ms: Date.now() - t0, ok: false };
    }
  }

  return NextResponse.json(
    {
      stamp: "diag-2026-10-27-3",
      env: {
        apiUrlSet: snap.apiUrlSet,
        tokenSet: snap.tokenSet,
        apiUrlLen: snap.apiUrl.length,
        tokenLen: snap.token.length,
      },
      processEnvKeyCount: keys.length,
      engineKeys: keys.filter((k) => k.startsWith("ENGINE")).sort(),
      healthDebug: process.env.ENGINE_HEALTH_DEBUG ?? null,
      publicLeak: Boolean(process.env.NEXT_PUBLIC_ENGINE_WEB_TOKEN),
      cf,
      probe,
    },
    { headers: { "cache-control": "no-store" } }
  );
}
