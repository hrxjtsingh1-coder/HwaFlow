/**
 * Pure identity helpers and the shape of a signed-in viewer.
 *
 * Deliberately free of storage, React, and network code: this module is
 * imported by both server actions and client components, so anything stateful
 * in here would drag the wrong runtime along with it.
 */

export type AuthUser = {
  id: string;
  username: string;
  displayName: string;
  /** From `profiles.is_platform_admin`, never from a hardcoded username. */
  isPlatformAdmin: boolean;
};

/** The subset of a profile an invite needs — no email, no flags. */
export type ProfileRef = {
  id: string;
  username: string;
  displayName: string;
};

export type AuthFailure =
  | "invalid-input"
  | "invalid-credentials"
  | "username-taken"
  /**
   * Signup succeeded but there is no session, which means the project still
   * requires email confirmation. No mailbox exists for `<name>@users.internal`,
   * so the account can never be confirmed — the admin has to turn it off.
   */
  | "confirm-email-on"
  | "unknown";

export type AuthResult =
  | { ok: true; user: AuthUser }
  | { ok: false; code: AuthFailure; message: string };

export const USERNAME_PATTERN = /^[a-z0-9_]{3,24}$/;

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

export function validateDisplayName(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return "Enter the name your team will see.";
  if (trimmed.length < 2) return "Use at least 2 characters.";
  if (trimmed.length > 40) return "Keep it under 40 characters.";
  return null;
}

export function validateUsername(value: string): string | null {
  const normalized = normalizeUsername(value);
  if (!normalized) return "Pick a username.";
  if (normalized.length < 3) return "Use at least 3 characters.";
  if (normalized.length > 24) return "Keep it to 24 characters or fewer.";
  if (!USERNAME_PATTERN.test(normalized)) {
    return "Use lowercase letters, numbers, and underscores only.";
  }
  return null;
}

export function validatePassword(value: string): string | null {
  if (!value) return "Choose a password.";
  if (value.length < 8) return "Use at least 8 characters.";
  if (!/[a-zA-Z]/.test(value)) return "Add at least one letter.";
  if (!/[0-9]/.test(value)) return "Add at least one number.";
  return null;
}

export function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function getInitials(displayName: string, username = ""): string {
  const source = displayName.trim() || username;
  if (!source) return "HF";
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}
