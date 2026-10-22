"use server";

/**
 * Auth server actions.
 *
 * The browser never sees a password hash, a service key, or an email address.
 * It posts a username and password over the server-action channel; this module
 * turns the username into the synthetic address Supabase Auth expects and hands
 * the resulting session cookie back through `@supabase/ssr`.
 *
 * Errors are returned as data, not thrown. A thrown error from a server action
 * is replaced by Next with a generic "An error occurred" in production, which
 * would hide "that username is taken" from the user.
 */

import type { AuthFailure, AuthResult, ProfileRef } from "./identity";
import {
  normalizeUsername,
  validateDisplayName,
  validatePassword,
  validateUsername,
} from "./identity";
import { viewerFor } from "./session";
import { createClient } from "./supabase/server";

/**
 * Supabase Auth requires an email. Usernames are the real identity, so every
 * account gets this synthetic, unroutable address. `users.internal` is a
 * reserved-style TLD that no mailbox serves — which is exactly why the project
 * must have "Confirm email" turned off.
 */
const EMAIL_DOMAIN = "users.internal";

function emailFor(username: string): string {
  return `${username}@${EMAIL_DOMAIN}`;
}

function failure(code: AuthFailure, message: string): AuthResult {
  return { ok: false, code, message };
}

const USERNAME_TAKEN: AuthResult = {
  ok: false,
  code: "username-taken",
  message: "That username is already taken.",
};

/**
 * Supabase deliberately does not reveal whether an address is registered, so a
 * duplicate can arrive as a plain error *or* as a silent user object with an
 * empty `identities` array. Both are handled where they occur; this only
 * recognises the error-shaped variant.
 */
function looksLikeDuplicate(error: { code?: string; message: string }): boolean {
  const message = error.message.toLowerCase();
  return (
    error.code === "user_already_exists" ||
    error.code === "email_exists" ||
    message.includes("already registered") ||
    message.includes("already been registered") ||
    message.includes("already exists") ||
    message.includes("duplicate key")
  );
}

/* ------------------------------------------------------------------ */
/* Register                                                            */
/* ------------------------------------------------------------------ */

export async function register(input: {
  displayName: string;
  username: string;
  password: string;
}): Promise<AuthResult> {
  const displayName = input.displayName.trim();
  const username = normalizeUsername(input.username);

  const displayNameError = validateDisplayName(displayName);
  if (displayNameError) return failure("invalid-input", displayNameError);

  const usernameError = validateUsername(username);
  if (usernameError) return failure("invalid-input", usernameError);

  const passwordError = validatePassword(input.password);
  if (passwordError) return failure("invalid-input", passwordError);

  const supabase = await createClient();

  /*
   * Check first so the common conflict renders as the inline username error
   * instead of a generic auth failure. The check is advisory: the unique index
   * on profiles.username is what actually enforces it, and the duplicate
   * handling below covers the race where two people submit the same name.
   */
  const { data: available } = await supabase.rpc("username_available", {
    candidate: username,
  });
  if (available === false) return USERNAME_TAKEN;

  const { data, error } = await supabase.auth.signUp({
    email: emailFor(username),
    password: input.password,
    options: {
      // Read by public.handle_new_user() to create the profiles row.
      data: { username, display_name: displayName },
    },
  });

  if (error) {
    if (looksLikeDuplicate(error)) return USERNAME_TAKEN;
    if (error.code === "signup_disabled") {
      return failure(
        "confirm-email-on",
        "Signups are disabled on this Supabase project. Enable Authentication → Sign In / Providers → Email."
      );
    }
    return failure("unknown", error.message);
  }

  if (!data.session) {
    // An existing account comes back as a user with no identities.
    if (data.user && (data.user.identities?.length ?? 0) === 0) {
      return USERNAME_TAKEN;
    }

    /*
     * A real new user with no session means the project is still asking for
     * email confirmation. `@users.internal` has no mailbox, so the account is
     * unreachable — surface the cause instead of pretending signup worked.
     */
    return failure(
      "confirm-email-on",
      "Email confirmation is on, so new accounts can't sign in. Turn off Authentication → Sign In / Providers → Email → Confirm email in Supabase, then try again."
    );
  }

  const viewer = data.user ? await viewerFor(supabase, data.user.id) : null;
  if (!viewer) {
    return failure(
      "unknown",
      "Your account was created but its profile is missing. Check that the handle_new_user trigger is installed."
    );
  }

  /*
   * Deliberately no revalidatePath here. Revalidating "/" with "layout"
   * re-renders the current route as part of the action response — and /login
   * now redirects signed-in visitors to /dashboard, so that render throws a
   * redirect while the action is still resolving and the caller's promise can
   * hang. The client hard-navigates after success anyway, and every auth-aware
   * read is no-store, so there is nothing to revalidate.
   */
  return { ok: true, user: viewer };
}

/* ------------------------------------------------------------------ */
/* Login                                                               */
/* ------------------------------------------------------------------ */

export async function login(input: {
  username: string;
  password: string;
}): Promise<AuthResult> {
  const username = normalizeUsername(input.username);
  if (!username) return failure("invalid-input", "Enter your username.");
  if (!input.password) return failure("invalid-input", "Enter your password.");

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: emailFor(username),
    password: input.password,
  });

  if (error || !data.user) {
    /*
     * One message for "no such username" and "wrong password" on purpose:
     * telling them apart turns the form into a username oracle.
     */
    return failure(
      "invalid-credentials",
      "That username and password don't match."
    );
  }

  const viewer = await viewerFor(supabase, data.user.id);
  if (!viewer) {
    return failure(
      "unknown",
      "You're signed in, but your profile is missing. Ask the platform admin to check your account."
    );
  }

  return { ok: true, user: viewer };
}

/* ------------------------------------------------------------------ */
/* Logout                                                              */
/* ------------------------------------------------------------------ */

export async function logout(): Promise<void> {
  const supabase = await createClient();
  // A missing/expired session returns an error here; clearing a session that is
  // already gone is not a failure the caller should have to handle.
  // No revalidatePath: the sign-out path is a hard navigation, and a
  // revalidation render of a protected route can fight the redirect.
  await supabase.auth.signOut();
}

/* ------------------------------------------------------------------ */
/* Directory                                                           */
/* ------------------------------------------------------------------ */

/**
 * Live availability hint for the register form. Fails open: if the RPC is
 * unreachable the hint stays quiet and the unique index still rejects a
 * duplicate at submit time.
 */
export async function usernameAvailable(username: string): Promise<boolean> {
  const normalized = normalizeUsername(username);
  if (!normalized) return false;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("username_available", {
    candidate: normalized,
  });

  if (error) return true;
  return data === true;
}

/**
 * Resolves a username to the minimum an invite needs. Backed by the
 * SECURITY DEFINER `profile_lookup` function, because `profiles` is
 * self-read-only and an invitee is by definition not yet a co-member.
 */
export async function lookupProfile(
  username: string
): Promise<ProfileRef | null> {
  const normalized = normalizeUsername(username);
  if (!normalized) return null;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("profile_lookup", {
    candidate: normalized,
  });

  if (error || !data) return null;

  const rows = data as Array<{
    id: string;
    username: string;
    display_name: string;
  }>;
  const row = rows[0];
  if (!row) return null;

  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
  };
}
