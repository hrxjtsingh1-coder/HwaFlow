/**
 * Client-facing auth surface.
 *
 * Validation helpers live in `./identity` so server actions can use them
 * without importing anything that touches `window`. This module re-exports them
 * for the components that already import from `@/lib/auth`, and adds the two
 * pieces that genuinely belong to the browser: the remembered-username nicety
 * and sign-out.
 *
 * There is no password hashing and no account list here any more. Accounts are
 * rows in Supabase Auth; the browser only ever holds an httpOnly session cookie.
 */

import { logout, usernameAvailable } from "./auth-actions";
import { normalizeUsername, sleep } from "./identity";

export {
  USERNAME_PATTERN,
  getInitials,
  normalizeUsername,
  sleep,
  validateDisplayName,
  validatePassword,
  validateUsername,
} from "./identity";

export type {
  AuthFailure,
  AuthResult,
  AuthUser,
  ProfileRef,
} from "./identity";

const REMEMBER_KEY = "hwaflow.remember.v1";

/* ------------------------------------------------------------------ */
/* Deadline                                                            */
/* ------------------------------------------------------------------ */

/**
 * Caps how long the auth UI waits on a server action.
 *
 * A server action resolves when its response arrives. If the dev server dies
 * mid-request, or the connection stalls, that promise never settles and the
 * submit button would spin until the browser gives up. Twenty seconds is well
 * past a normal Supabase round trip, and the failure is recoverable: the cookie
 * may already be set, so a retry or reload lands on the dashboard.
 */
export function withDeadline<T>(promise: Promise<T>, ms = 20000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("auth-timeout")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

/* ------------------------------------------------------------------ */
/* Session                                                             */
/* ------------------------------------------------------------------ */

/**
 * Ends the Supabase session, then hard-navigates.
 *
 * The full page load is deliberate: the groups/series stores, `useAuthSession`,
 * and the cached RSC payload all still hold the previous viewer. A client-side
 * `router.replace` would leave them in place until something else invalidated
 * them. `location.replace` also keeps the signed-in page out of history.
 */
export async function signOut(): Promise<void> {
  try {
    await withDeadline(logout(), 8000);
  } catch {
    // A dead connection must not leave the sign-out button inert. If the cookie
    // survives, the proxy sends the next request to the dashboard and the user
    // can try again.
  } finally {
    window.location.replace("/login");
  }
}

/* ------------------------------------------------------------------ */
/* Username availability                                               */
/* ------------------------------------------------------------------ */

export async function checkUsernameAvailability(
  username: string
): Promise<boolean> {
  // A beat of latency keeps the inline "checking" state readable.
  await sleep(320);
  const normalized = normalizeUsername(username);
  if (!normalized) return false;
  return usernameAvailable(normalized);
}

/* ------------------------------------------------------------------ */
/* Remembered username                                                 */
/* ------------------------------------------------------------------ */

function canUseStorage(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const probe = "__hwaflow_probe__";
    window.localStorage.setItem(probe, "1");
    window.localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

export function getRememberedUsername(): string | null {
  if (!canUseStorage()) return null;
  try {
    return window.localStorage.getItem(REMEMBER_KEY);
  } catch {
    return null;
  }
}

export function setRememberedUsername(username: string | null): void {
  if (!canUseStorage()) return;
  try {
    if (username) {
      window.localStorage.setItem(REMEMBER_KEY, username);
    } else {
      window.localStorage.removeItem(REMEMBER_KEY);
    }
  } catch {
    /* remembering a name is a nicety, not a requirement */
  }
}
