/**
 * TEMPORARY diagnostic — safe: returns variable NAMES and LENGTHS only,
 * never values. Remove once the health check is green.
 */
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const keys = Object.keys(process.env);

  let cf: Record<string, unknown> = { available: false };
  try {
    // Computed specifier + webpackIgnore so bundlers leave it to the runtime.
    const spec = ["cloudflare", "workers"].join(":");
    const mod: any = await import(/* webpackIgnore: true */ spec);
    const env = (mod && mod.env) || {};
    const cfKeys = Object.keys(env);
    cf = {
      available: true,
      keyCount: cfKeys.length,
      engineKeys: cfKeys.filter((k) => k.startsWith("ENGINE")).sort(),
      engineApiUrlLen: typeof env.ENGINE_API_URL === "string" ? env.ENGINE_API_URL.length : 0,
      engineWebTokenLen: typeof env.ENGINE_WEB_TOKEN === "string" ? env.ENGINE_WEB_TOKEN.length : 0,
      healthDebug: env.ENGINE_HEALTH_DEBUG ?? null,
    };
  } catch (e) {
    cf = { available: false, error: String(e).slice(0, 200) };
  }

  return NextResponse.json(
    {
      stamp: "diag-2026-10-27-1",
      nodeEnv: process.env.NODE_ENV ?? null,
      processEnvKeyCount: keys.length,
      engineKeys: keys.filter((k) => k.startsWith("ENGINE")).sort(),
      engineApiUrlLen: (process.env.ENGINE_API_URL || "").length,
      engineWebTokenLen: (process.env.ENGINE_WEB_TOKEN || "").length,
      healthDebug: process.env.ENGINE_HEALTH_DEBUG ?? null,
      strictAccess: process.env.ENGINE_STRICT_ACCESS ?? null,
      purge: process.env.ENGINE_PURGE_SUPABASE_ORIGINALS ?? null,
      publicLeak: Boolean(process.env.NEXT_PUBLIC_ENGINE_WEB_TOKEN),
      supabaseKeyCount: keys.filter((k) => k.toUpperCase().includes("SUPABASE")).length,
      cf,
    },
    { headers: { "cache-control": "no-store" } }
  );
}
