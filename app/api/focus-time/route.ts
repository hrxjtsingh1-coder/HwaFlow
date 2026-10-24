/**
 * Focus time for the signed-in viewer.
 *
 * GET seeds the app-wide counter with today's stored total so a new tab or a
 * fresh sign-in resumes where the last one stopped. POST takes one increment,
 * called by a 30-second interval and by `navigator.sendBeacon` when the tab is
 * hidden, so it must stay cheap and tolerate a duplicate. `log_focus_time`
 * owns the validation; this route only rejects shapes the RPC would reject with
 * a less useful error.
 */

import { NextResponse } from "next/server";

import { recentFocusDays } from "@/lib/server/focus";
import { getViewer } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const viewer = await getViewer();

  if (!viewer) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  return NextResponse.json(
    { days: await recentFocusDays(viewer) },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    day?: unknown;
    seconds?: unknown;
  } | null;

  const day = typeof body?.day === "string" ? body.day : "";
  const seconds = Math.round(Number(body?.seconds));

  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(seconds)) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("log_focus_time", {
    p_day: day,
    p_seconds: seconds,
  });

  if (error) {
    // 42501 is "not signed in" once the RLS/session layer rejects it.
    return NextResponse.json({ ok: false }, { status: error.code === "42501" ? 401 : 400 });
  }

  return NextResponse.json(
    { ok: true, total: data },
    { headers: { "Cache-Control": "no-store" } }
  );
}
