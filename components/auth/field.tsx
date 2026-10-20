"use client";

import { useState, type InputHTMLAttributes, type ReactNode } from "react";
import { Eye, EyeOff } from "../icons";

type SharedProps = {
  id: string;
  label: string;
  icon: ReactNode;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  error?: string | null;
  hint?: ReactNode;
  trailing?: ReactNode;
  disabled?: boolean;
} & Pick<
  InputHTMLAttributes<HTMLInputElement>,
  | "autoComplete"
  | "inputMode"
  | "maxLength"
  | "spellCheck"
  | "autoCapitalize"
  | "enterKeyHint"
>;

type TextFieldProps = SharedProps & {
  type?: "text" | "email" | "password";
};

export function TextField({
  id,
  label,
  icon,
  value,
  onChange,
  onBlur,
  error,
  hint,
  trailing,
  disabled,
  type = "text",
  ...inputProps
}: TextFieldProps) {
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy = error ? errorId : hint ? hintId : undefined;

  return (
    <div className="auth-field-wrap">
      <div
        className="auth-field"
        data-invalid={error ? "true" : undefined}
        data-has-trailing={trailing ? "true" : undefined}
      >
        <span className="auth-field-icon" aria-hidden="true">
          {icon}
        </span>

        <input
          id={id}
          name={id}
          className="auth-input"
          type={type}
          value={value}
          placeholder=" "
          onChange={(event) => onChange(event.target.value)}
          onBlur={onBlur}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          {...inputProps}
        />

        <label className="auth-label" htmlFor={id}>
          {label}
        </label>

        {trailing ? (
          <span className="auth-field-trailing">{trailing}</span>
        ) : null}
      </div>

      {error ? (
        <p className="auth-field-error" id={errorId} role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="auth-field-hint" id={hintId} aria-live="polite">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function PasswordField({
  label = "Password",
  status,
  ...props
}: Omit<SharedProps, "type" | "trailing"> & {
  status?: ReactNode;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <TextField
      {...props}
      label={label}
      type={visible ? "text" : "password"}
      trailing={
        <>
          {status}
          <button
            type="button"
            className="auth-eye"
            onClick={() => setVisible((value) => !value)}
            aria-label={visible ? "Hide password" : "Show password"}
            aria-pressed={visible}
            tabIndex={0}
          >
            {visible ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
          </button>
        </>
      }
    />
  );
}
