/**
 * Viewer for client components.
 *
 * Server components read the session directly via `getViewer()`. Client
 * components cannot, so `useAuthSession` fetches this once per page load and
 * shares the result across every consumer. Kept out of the RSC payload on
 * purpose: the shells are client components and prop-drilling the viewer
 * through them would touch a dozen files for no benefit.
 */

import { NextResponse } from "next/server";

import { getViewer } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await getViewer();
    return NextResponse.json(
      { user },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    // Missing env, unreachable project: report "signed out" rather than
    // turning every page's auth check into a 500. /api/health/supabase
    // reports the actual configuration problem.
    return NextResponse.json(
      { user: null },
      { headers: { "Cache-Control": "no-store" } }
    );
  }
}
