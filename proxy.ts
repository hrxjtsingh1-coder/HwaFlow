/**
 * Request-level Supabase session refresh.
 *
 * Next 16 renamed the `middleware.ts` convention to `proxy.ts` and the export
 * from `middleware` to `proxy` — the file/export names changed, the behaviour
 * did not. Supabase's own docs still show `middleware.ts`, which silently never
 * runs here: sessions then never refresh, `auth.uid()` is null inside RLS, and
 * every page renders empty with no error to explain why.
 *
 * The cookie handling below must stay exactly as it is. `@supabase/ssr` writes
 * a refreshed token through `setAll`, and the cookies have to be copied onto
 * the *outgoing* response or the browser never receives them.
 */

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  /*
   * Missing env must not take down every route with an opaque 500 before the
   * developer has had a chance to paste the keys. Let the request through and
   * let /api/health/supabase report exactly what is missing.
   */
  if (!url || !publishableKey) {
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }

        response = NextResponse.next({ request });

        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }

        // no-store headers for responses that carry auth cookies. Without them
        // a CDN can serve one user's session token to the next visitor.
        for (const [key, value] of Object.entries(headers)) {
          response.headers.set(key, value);
        }
      },
    },
  });

  /*
   * Do not remove. `getUser()` is what triggers the refresh: it validates the
   * token against the Auth server and, when it has expired, writes the new one.
   * `getSession()` alone would not refresh.
   */
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  /*
   * Route protection lives here, not only in the shells. The shells already
   * redirect on a null viewer, but that happens after hydration and ships the
   * page's JavaScript first. The proxy refuses the request outright.
   *
   * This is a redirect, not authorization: RLS is what stops a signed-in user
   * from reading someone else's rows.
   */
  if (!user && needsSignIn(pathname)) {
    return redirectTo(request, response, "/login");
  }

  /*
   * Signed-in visitors have no use for the auth pages, and the "already signed
   * in" state there would just be a speed bump on the way to the dashboard.
   */
  if (user && (pathname === "/login" || pathname === "/register")) {
    return redirectTo(request, response, "/dashboard");
  }

  return response;
}

const PROTECTED_PREFIXES = [
  "/dashboard",
  "/admin",
  "/groups",
  "/series",
  "/chapters",
  "/settings",
];

function needsSignIn(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

/**
 * Redirects while keeping the refreshed auth cookies. `getUser()` above may
 * have written a new token to `source`; dropping it on the floor here would
 * sign the user out on their next request.
 */
function redirectTo(
  request: NextRequest,
  source: NextResponse,
  pathname: string
): NextResponse {
  const target = request.nextUrl.clone();
  target.pathname = pathname;
  target.search = "";

  const redirect = NextResponse.redirect(target);
  for (const cookie of source.cookies.getAll()) {
    redirect.cookies.set(cookie);
  }
  return redirect;
}

export const config = {
  matcher: [
    // Everything except Next internals and static image files.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
