"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  getRememberedUsername,
  normalizeUsername,
  setRememberedUsername,
  sleep,
  withDeadline,
  type AuthUser,
} from "@/lib/auth";
import { login } from "@/lib/auth-actions";
import { AlertCircle, ArrowRight, AtSign, Check, Lock } from "../icons";
import { PasswordField, TextField } from "./field";

type SignInFormProps = {
  onSuccess: (user: AuthUser) => void;
  onSwitchToSignUp: () => void;
};

export function SignInForm({ onSuccess, onSwitchToSignUp }: SignInFormProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [errors, setErrors] = useState<{
    username?: string;
    password?: string;
  }>({});

  useEffect(() => {
    const remembered = getRememberedUsername();
    if (remembered) {
      setUsername(remembered);
      setRemember(true);
    }
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;

    const nextErrors: typeof errors = {};
    if (!username.trim()) nextErrors.username = "Enter your username.";
    if (!password) nextErrors.password = "Enter your password.";

    setErrors(nextErrors);
    setFormError(null);
    if (Object.keys(nextErrors).length > 0) {
      const target = nextErrors.username
        ? "signin-username"
        : "signin-password";
      document.getElementById(target)?.focus();
      return;
    }

    setLoading(true);

    try {
      const [result] = await Promise.all([
        withDeadline(login({ username, password })),
        sleep(620),
      ]);

      if (!result.ok) {
        setFormError(result.message);
        document.getElementById("signin-password")?.focus();
        return;
      }

      setRememberedUsername(remember ? normalizeUsername(username) : null);
      onSuccess(result.user);
    } catch {
      // A rejected/thrown action must never leave the button spinning forever.
      setFormError(
        "We couldn't reach the sign-in service. Check your connection and try again."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit} noValidate>
      <TextField
        id="signin-username"
        label="Username"
        icon={<AtSign className="h-4 w-4" />}
        value={username}
        onChange={(value) => {
          setUsername(value);
          if (errors.username) {
            setErrors((current) => ({ ...current, username: undefined }));
          }
        }}
        error={errors.username}
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        disabled={loading}
      />

      <div className="auth-password-block">
        <PasswordField
          id="signin-password"
          label="Password"
          icon={<Lock className="h-4 w-4" />}
          value={password}
          onChange={(value) => {
            setPassword(value);
            if (errors.password) {
              setErrors((current) => ({ ...current, password: undefined }));
            }
          }}
          error={errors.password}
          autoComplete="current-password"
          disabled={loading}
        />

        <div className="auth-inline-row">
          <button
            type="button"
            className="auth-link auth-forgot"
            onClick={() => setForgotOpen((open) => !open)}
            aria-expanded={forgotOpen}
            aria-controls="signin-forgot"
          >
            Forgot password?
          </button>
        </div>
      </div>

      <div
        className="auth-reveal auth-forgot-panel"
        id="signin-forgot"
        data-open={forgotOpen ? "true" : "false"}
      >
        <div>
          <p>
            Password resets aren&apos;t connected yet. Ask your group Owner or
            the platform admin to reset it for you.
          </p>
        </div>
      </div>

      <label className="auth-check" htmlFor="signin-remember">
        <input
          id="signin-remember"
          type="checkbox"
          checked={remember}
          onChange={(event) => setRemember(event.target.checked)}
          disabled={loading}
        />
        <span className="auth-check-box" aria-hidden="true">
          <Check className="h-2.5 w-2.5" />
        </span>
        <span>Remember my username</span>
      </label>

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
            Signing in…
          </>
        ) : (
          <>
            Sign in
            <ArrowRight className="auth-submit-icon h-4 w-4" />
          </>
        )}
      </button>

      <p className="auth-switch-copy">
        New to HwaFlow?{" "}
        <button type="button" className="auth-link" onClick={onSwitchToSignUp}>
          Create an account
        </button>
      </p>
    </form>
  );
}
