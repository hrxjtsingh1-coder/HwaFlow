/**
 * Browser-local auth store.
 *
 * Supabase is the locked-in production auth provider, but no project keys exist
 * in this build yet. Until they do, accounts and sessions live in localStorage
 * so the sign-up / sign-in flow is genuinely functional end to end.
 *
 * Swap points are deliberately narrow: `createAccount`, `signIn`, `getSession`,
 * `signOut`, and `subscribeAuth`. Replacing those with Supabase calls leaves the
 * auth UI untouched.
 */

export type AuthUser = {
  id: string;
  username: string;
  displayName: string;
  createdAt: string;
};

type StoredAccount = AuthUser & {
  salt: string;
  hash: string;
  iterations: number;
};

type StoredSession = {
  userId: string;
  signedInAt: string;
};

export type AuthFailure =
  | "username-taken"
  | "invalid-credentials"
  | "storage"
  | "insecure-context"
  | "unknown";

export class AuthError extends Error {
  code: AuthFailure;

  constructor(code: AuthFailure, message?: string) {
    super(message ?? code);
    this.name = "AuthError";
    this.code = code;
  }
}

const ACCOUNTS_KEY = "hwaflow.accounts.v1";
const SESSION_KEY = "hwaflow.session.v1";
const REMEMBER_KEY = "hwaflow.remember.v1";
const AUTH_EVENT = "hwaflow:auth";
const ITERATIONS = 120_000;

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

/* ------------------------------------------------------------------ */
/* Storage helpers                                                     */
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

function readJson<T>(key: string, fallback: T): T {
  if (!canUseStorage()) return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  if (!canUseStorage()) {
    throw new AuthError(
      "storage",
      "This browser is blocking local storage. Turn off private mode and try again."
    );
  }
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    throw new AuthError("storage", "We couldn't save your account in this browser.");
  }
}

function readAccounts(): StoredAccount[] {
  const accounts = readJson<StoredAccount[]>(ACCOUNTS_KEY, []);
  return Array.isArray(accounts) ? accounts : [];
}

function writeAccounts(accounts: StoredAccount[]): void {
  writeJson(ACCOUNTS_KEY, accounts);
}

function notifyAuthChange(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(AUTH_EVENT));
}

function toUser(account: StoredAccount): AuthUser {
  return {
    id: account.id,
    username: account.username,
    displayName: account.displayName,
    createdAt: account.createdAt,
  };
}

/* ------------------------------------------------------------------ */
/* Hashing                                                             */
/* ------------------------------------------------------------------ */

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return window.btoa(binary);
}

function randomHex(byteLength = 16): string {
  const bytes = new Uint8Array(byteLength);
  window.crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function createId(): string {
  if (typeof window !== "undefined" && "randomUUID" in window.crypto) {
    return window.crypto.randomUUID();
  }
  return `u_${randomHex(12)}`;
}

async function deriveHash(
  password: string,
  salt: string,
  iterations: number
): Promise<string> {
  if (typeof window === "undefined" || !window.crypto?.subtle) {
    throw new AuthError(
      "insecure-context",
      "This page needs localhost or HTTPS to sign you in securely."
    );
  }

  const encoder = new TextEncoder();
  const key = await window.crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );

  const bits = await window.crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: encoder.encode(salt),
      iterations,
      hash: "SHA-256",
    },
    key,
    256
  );

  return toBase64(new Uint8Array(bits));
}

function sameHash(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let index = 0; index < a.length; index += 1) {
    mismatch |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return mismatch === 0;
}

function setSession(userId: string): void {
  const session: StoredSession = {
    userId,
    signedInAt: new Date().toISOString(),
  };
  writeJson(SESSION_KEY, session);
  notifyAuthChange();
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

export async function createAccount(input: {
  displayName: string;
  username: string;
  password: string;
}): Promise<AuthUser> {
  const displayName = input.displayName.trim();
  const username = normalizeUsername(input.username);

  if (readAccounts().some((account) => account.username === username)) {
    throw new AuthError("username-taken", "That username is already taken.");
  }

  const salt = randomHex(16);
  const hash = await deriveHash(input.password, salt, ITERATIONS);

  const account: StoredAccount = {
    id: createId(),
    username,
    displayName,
    createdAt: new Date().toISOString(),
    salt,
    hash,
    iterations: ITERATIONS,
  };

  writeAccounts([...readAccounts(), account]);
  setSession(account.id);

  return toUser(account);
}

export async function signIn(input: {
  username: string;
  password: string;
}): Promise<AuthUser> {
  const username = normalizeUsername(input.username);
  const account = readAccounts().find((entry) => entry.username === username);

  if (!account) {
    throw new AuthError(
      "invalid-credentials",
      "That username and password don't match."
    );
  }

  const hash = await deriveHash(input.password, account.salt, account.iterations);

  if (!sameHash(hash, account.hash)) {
    throw new AuthError(
      "invalid-credentials",
      "That username and password don't match."
    );
  }

  setSession(account.id);
  return toUser(account);
}

/**
 * Public account reads.
 *
 * These deliberately return `AuthUser`, never `StoredAccount`, so password
 * material (`salt`, `hash`) can travel no further than this module.
 */
export function findAccount(username: string): AuthUser | null {
  const normalized = normalizeUsername(username);
  const account = readAccounts().find((entry) => entry.username === normalized);
  return account ? toUser(account) : null;
}

export function listAccounts(): AuthUser[] {
  return readAccounts().map(toUser);
}

export function getSession(): AuthUser | null {
  const session = readJson<StoredSession | null>(SESSION_KEY, null);
  if (!session?.userId) return null;

  const account = readAccounts().find((entry) => entry.id === session.userId);
  if (!account) {
    if (canUseStorage()) window.localStorage.removeItem(SESSION_KEY);
    return null;
  }

  return toUser(account);
}

export function signOut(): void {
  if (typeof window === "undefined") return;
  if (canUseStorage()) window.localStorage.removeItem(SESSION_KEY);
  notifyAuthChange();
}

export function subscribeAuth(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};

  const onStorage = (event: StorageEvent) => {
    if (!event.key || event.key === SESSION_KEY || event.key === ACCOUNTS_KEY) {
      listener();
    }
  };

  window.addEventListener(AUTH_EVENT, listener);
  window.addEventListener("storage", onStorage);

  return () => {
    window.removeEventListener(AUTH_EVENT, listener);
    window.removeEventListener("storage", onStorage);
  };
}

export async function checkUsernameAvailability(
  username: string
): Promise<boolean> {
  // A beat of latency keeps the inline "checking" state readable.
  await new Promise((resolve) => setTimeout(resolve, 320));
  const normalized = normalizeUsername(username);
  return !readAccounts().some((account) => account.username === normalized);
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
