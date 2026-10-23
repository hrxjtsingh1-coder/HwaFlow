/**
 * Route protection decision, kept pure so it can be tested without a request.
 *
 * The proxy's notion of "signed in" is `auth.getUser()`, which only needs a
 * valid session cookie. Every page's notion is `getViewer()`, which also needs
 * a readable `profiles` row. When those disagree — a user created before the
 * profile trigger, a deleted profile, or one transient read error — redirecting
 * a signed-in request away from `/login` sent it straight back to `/dashboard`,
 * which sent it back to `/login`: an infinite bounce with no server error.
 *
 * So the proxy only ever redirects *towards* `/login`. The auth pages decide
 * for themselves whether to send a viewer to the dashboard, and they are the
 * only place that knows whether a profile exists.
 */

export const PROTECTED_PREFIXES = [
  "/dashboard",
  "/admin",
  "/groups",
  "/series",
  "/chapters",
  "/settings",
];

export function needsSignIn(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

/**
 * Returns the path to redirect to, or `null` to continue.
 *
 * `hasSession` is a valid auth user, not a viewer. A signed-in request is
 * never redirected away from `/login` or `/register`; a profile-less user
 * must be able to reach the sign-in page to recover.
 */
export function resolveRedirect(
  pathname: string,
  hasSession: boolean
): string | null {
  if (!hasSession && needsSignIn(pathname)) return "/login";
  return null;
}
