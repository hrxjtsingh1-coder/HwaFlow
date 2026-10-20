"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  AuthError,
  checkUsernameAvailability,
  createAccount,
  normalizeUsername,
  sleep,
  validateDisplayName,
  validatePassword,
  validateUsername,
  type AuthUser,
} from "@/lib/auth";
import {
  AlertCircle,
  ArrowRight,
  AtSign,
  Check,
  Lock,
  User,
  X,
} from "../icons";
import { PasswordField, TextField } from "./field";
import { PasswordMeter } from "./password-meter";

type SignUpFormProps = {
  onSuccess: (user: AuthUser) => void;
  onSwitchToSignIn: () => void;
};

type Availability = "idle" | "checking" | "available" | "taken";

type FieldErrors = {
  displayName?: string;
  username?: string;
  password?: string;
  confirm?: string;
};

export function SignUpForm({ onSuccess, onSwitchToSignIn }: SignUpFormProps) {
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [availability, setAvailability] = useState<Availability>("idle");
  const [confirmTouched, setConfirmTouched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const requestRef = useRef(0);

  useEffect(() => {
    const normalized = normalizeUsername(username);
    requestRef.current += 1;
    const requestId = requestRef.current;

    if (!normalized || validateUsername(normalized)) {
      setAvailability("idle");
      return;
    }

    setAvailability("checking");
    const timer = window.setTimeout(async () => {
      const available = await checkUsernameAvailability(normalized);
      if (requestRef.current !== requestId) return;
      setAvailability(available ? "available" : "taken");
    }, 400);

    return () => window.clearTimeout(timer);
  }, [username]);

  const matches = Boolean(confirm) && confirm === password;
  const confirmError =
    errors.confirm ??
    (confirmTouched && confirm !== password
      ? "Those passwords don't match yet."
      : undefined);

  const usernameError =
    errors.username ??
    (availability === "taken" ? "That username is already taken." : undefined);

  const usernameHint =
    availability === "checking"
      ? "Checking availability…"
      : availability === "available"
        ? "That username is free."
        : "Lowercase letters, numbers, and underscores.";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;

    const nameError = validateDisplayName(displayName);
    const userError = validateUsername(username);
    const passwordError = validatePassword(password);
    const confirmationError = !confirm
      ? "Re-enter your password."
      : confirm !== password
        ? "Those passwords don't match."
        : undefined;

    const nextErrors: FieldErrors = {
      displayName: nameError ?? undefined,
      username:
        userError ??
        (availability === "taken"
          ? "That username is already taken."
          : undefined),
      password: passwordError ?? undefined,
      confirm: confirmationError,
    };

    setErrors(nextErrors);
    setFormError(null);
    setConfirmTouched(true);

    if (Object.values(nextErrors).some(Boolean)) {
      const target = nextErrors.displayName
        ? "signup-name"
        : nextErrors.username
          ? "signup-username"
          : nextErrors.password
            ? "signup-password"
            : "signup-confirm";
      document.getElementById(target)?.focus();
      return;
    }

    setLoading(true);

    try {
      const [user] = await Promise.all([
        createAccount({ displayName, username, password }),
        sleep(760),
      ]);
      onSuccess(user);
    } catch (error) {
      if (error instanceof AuthError && error.code === "username-taken") {
        setErrors((current) => ({
          ...current,
          username: "That username is already taken.",
        }));
        setAvailability("taken");
        document.getElementById("signup-username")?.focus();
      } else {
        setFormError(
          error instanceof AuthError
            ? error.message
            : "Something went wrong. Give it another try."
        );
      }
      setLoading(false);
    }
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit} noValidate>
      <TextField
        id="signup-name"
        label="Display name"
        icon={<User className="h-4 w-4" />}
        value={displayName}
        onChange={(value) => {
          setDisplayName(value);
          if (errors.displayName) {
            setErrors((current) => ({ ...current, displayName: undefined }));
          }
        }}
        error={errors.displayName}
        autoComplete="name"
        maxLength={40}
        disabled={loading}
      />

      <TextField
        id="signup-username"
        label="Username"
        icon={<AtSign className="h-4 w-4" />}
        value={username}
        onChange={(value) => {
          setUsername(value.toLowerCase().replace(/\s+/g, ""));
          if (errors.username) {
            setErrors((current) => ({ ...current, username: undefined }));
          }
        }}
        error={usernameError}
        hint={usernameHint}
        trailing={
          availability === "checking" ? (
            <span className="auth-spinner auth-spinner-sm" aria-hidden="true" />
          ) : availability === "available" ? (
            <span className="auth-status is-ok" aria-hidden="true">
              <Check className="h-3 w-3" />
            </span>
          ) : availability === "taken" ? (
            <span className="auth-status is-bad" aria-hidden="true">
              <X className="h-3 w-3" />
            </span>
          ) : undefined
        }
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        maxLength={24}
        disabled={loading}
      />

      <div className="auth-password-block">
        <PasswordField
          id="signup-password"
          label="Password"
          icon={<Lock className="h-4 w-4" />}
          value={password}
          onChange={(value) => {
            setPassword(value);
            if (errors.password || errors.confirm) {
              setErrors((current) => ({
                ...current,
                password: undefined,
                confirm: undefined,
              }));
            }
          }}
          error={errors.password}
          autoComplete="new-password"
          disabled={loading}
        />
        <PasswordMeter password={password} />
      </div>

      <PasswordField
        id="signup-confirm"
        label="Confirm password"
        icon={<Lock className="h-4 w-4" />}
        value={confirm}
        onChange={(value) => {
          setConfirm(value);
          if (errors.confirm) {
            setErrors((current) => ({ ...current, confirm: undefined }));
          }
        }}
        onBlur={() => setConfirmTouched(true)}
        error={confirmError}
        status={
          matches ? (
            <span className="auth-status is-ok" aria-hidden="true">
              <Check className="h-3 w-3" />
            </span>
          ) : undefined
        }
        autoComplete="new-password"
        disabled={loading}
      />

      {formError ? (
        <p className="auth-alert" role="alert" key={formError}>
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          {formError}
        </p>
      ) : null}

      <button
        type="submit"
        className="auth-submit"
        disabled={loading}
        data-loading={loading ? "true" : "false"}
      >
        {loading ? (
          <>
            <span className="auth-spinner" aria-hidden="true" />
            Creating your account…
          </>
        ) : (
          <>
            Create account
            <ArrowRight className="auth-submit-icon h-4 w-4" />
          </>
        )}
      </button>

      <p className="auth-switch-copy">
        Already have an account?{" "}
        <button type="button" className="auth-link" onClick={onSwitchToSignIn}>
          Sign in
        </button>
      </p>
    </form>
  );
}
