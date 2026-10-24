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

import { resolveRedirect } from "./lib/auth-redirect";

export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  /*
   * Missing env must not take down every route with an opaque 500 before the
   * developer has had a chance to paste the keys. Let the request through and
   * let /api/health/supabase report exactly what is missing.
   */
  if (!url || !publishableKey) {
    warnMissingEnvOnce();
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
   * Read the session instead of validating it.
   *
   * `getSession()` costs nothing on the wire while the access token is still
   * valid, and refreshes through the refresh token the moment it expires, so an
   * active session keeps extending itself exactly as it did with `getUser()`.
   * The difference is one fewer Auth round trip on every request, and this runs
   * on every request the app makes.
   *
   * Validating here was redundant: every protected page calls `getViewer()`,
   * which does call `getUser()` and is the gate that actually rejects a bad
   * session. This function only decides where to redirect, and RLS is what
   * stops one signed-in user reading another's rows.
   *
   * Do not remove the call. Reading the session is what lets @supabase/ssr
   * write a rotated token through `setAll` below; without it an expired token
   * is never renewed and a user who left a tab open gets signed out.
   */
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const { pathname } = request.nextUrl;

  /*
   * Route protection lives here, not only in the shells. The shells already
   * redirect on a null viewer, but that happens after hydration and ships the
   * page's JavaScript first. The proxy refuses the request outright.
   *
   * This is a redirect, not authorization: RLS is what stops a signed-in user
   * from reading someone else's rows.
   *
   * The proxy only redirects *towards* /login. It must never bounce a signed-in
   * request off /login or /register: `session` here is an auth session, while
   * the pages gate on a profiles row, and when those disagree the two redirects
   * point at each other forever. The auth pages redirect a real viewer
   * themselves.
   */
  const redirectTarget = resolveRedirect(pathname, Boolean(session));
  if (redirectTarget) {
    return redirectTo(request, response, redirectTarget);
  }

  return response;
}

/**
 * Redirects while keeping the refreshed auth cookies. The session read above
 * may have written a new token to `source`; dropping it on the floor here would
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

let warnedMissingEnv = false;
function warnMissingEnvOnce() {
  if (warnedMissingEnv) return;
  warnedMissingEnv = true;
  console.warn(
    "[proxy] Supabase env is missing — route protection is disabled. Fill .env.local; /api/health/supabase lists what is absent."
  );
}

export const config = {
  matcher: [
    // Everything except Next internals and static image files.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
