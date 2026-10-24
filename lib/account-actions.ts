"use server";

/**
 * Account self-service: display name, username, password, display currency.
 *
 * Nothing here can touch another account. The username moves together with the
 * synthetic auth email inside `change_username`; the password is only changed
 * after the current one re-authenticates, so a stolen session alone cannot lock
 * the owner out.
 *
 * Errors are returned as data for the same reason as the auth actions: a thrown
 * server action becomes a generic message in production.
 */

import {
  normalizeUsername,
  validateDisplayName,
  validatePassword,
  validateUsername,
} from "./identity";
import { isCurrency, type Currency } from "./money";
import { getViewer } from "./session";
import { createClient } from "./supabase/server";

const EMAIL_DOMAIN = "users.internal";

export type AccountFailure =
  | "signed-out"
  | "invalid-input"
  | "username-taken"
  | "wrong-password"
  | "unknown";

export type AccountResult<T = null> =
  | { ok: true; data: T }
  | { ok: false; code: AccountFailure; message: string };

function failure(
  code: AccountFailure,
  message: string
): AccountResult<never> {
  return { ok: false, code, message };
}

async function requireViewer() {
  const viewer = await getViewer();
  if (!viewer) {
    return {
      viewer: null,
      result: failure(
        "signed-out",
        "Your session expired. Sign in again to continue."
      ) as AccountResult<never>,
    };
  }
  return { viewer, result: null };
}

export async function saveDisplayName(name: string): Promise<AccountResult> {
  const auth = await requireViewer();
  if (!auth.viewer) return auth.result;

  const displayName = name.trim();
  const error = validateDisplayName(displayName);
  if (error) return failure("invalid-input", error);

  const supabase = await createClient();
  const { error: dbError } = await supabase
    .from("profiles")
    .update({ display_name: displayName })
    .eq("id", auth.viewer.id);

  if (dbError) return failure("unknown", "We couldn't save that name.");
  return { ok: true, data: null };
}

export async function saveDisplayCurrency(
  currency: string
): Promise<AccountResult> {
  const auth = await requireViewer();
  if (!auth.viewer) return auth.result;

  const code = currency.trim().toUpperCase();
  if (!isCurrency(code)) {
    return failure("invalid-input", "Pick a supported currency.");
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ display_currency: code satisfies Currency })
    .eq("id", auth.viewer.id);

  if (error) return failure("unknown", "We couldn't change your currency.");
  return { ok: true, data: null };
}

export async function saveUsername(
  username: string
): Promise<AccountResult<{ username: string }>> {
  const auth = await requireViewer();
  if (!auth.viewer) return auth.result;

  const normalized = normalizeUsername(username);
  const error = validateUsername(normalized);
  if (error) return failure("invalid-input", error);

  const supabase = await createClient();
  const { data, error: dbError } = await supabase.rpc("change_username", {
    p_username: normalized,
  });

  if (dbError) {
    // The conflict can come from `profiles.username` or `auth.users.email`;
    // either way the name is what the person needs to change.
    if (dbError.code === "23505") {
      return failure("username-taken", "That username is already taken.");
    }
    return failure("unknown", dbError.message || "We couldn't change that username.");
  }

  return { ok: true, data: { username: String(data ?? normalized) } };
}

export async function savePassword(input: {
  currentPassword: string;
  newPassword: string;
}): Promise<AccountResult> {
  const auth = await requireViewer();
  if (!auth.viewer) return auth.result;

  if (!input.currentPassword) {
    return failure("invalid-input", "Enter your current password.");
  }

  const passwordError = validatePassword(input.newPassword);
  if (passwordError) return failure("invalid-input", passwordError);

  const supabase = await createClient();

  // Re-authenticate first: a session left open on a shared machine should not
  // be enough to take the account over.
  const { data, error } = await supabase.auth.signInWithPassword({
    email: `${auth.viewer.username}@${EMAIL_DOMAIN}`,
    password: input.currentPassword,
  });

  if (error || !data.user) {
    return failure("wrong-password", "That current password doesn't match.");
  }

  const { error: updateError } = await supabase.auth.updateUser({
    password: input.newPassword,
  });

  if (updateError) {
    return failure("unknown", updateError.message || "We couldn't change the password.");
  }

  return { ok: true, data: null };
}
