"use client";

import { Check } from "../icons";

export type PasswordCheck = {
  key: string;
  label: string;
  ok: boolean;
};

export function scorePassword(password: string) {
  const checks: PasswordCheck[] = [
    {
      key: "length",
      label: "8+ characters",
      ok: password.length >= 8,
    },
    {
      key: "letter",
      label: "A letter",
      ok: /[a-zA-Z]/.test(password),
    },
    {
      key: "number",
      label: "A number",
      ok: /[0-9]/.test(password),
    },
    {
      key: "symbol",
      label: "A symbol or 12+ characters",
      ok: /[^a-zA-Z0-9]/.test(password) || password.length >= 12,
    },
  ];

  const score = checks.filter((check) => check.ok).length;
  const labels = ["Too short", "Weak", "Getting there", "Strong", "Excellent"];

  return {
    checks,
    score,
    label: labels[score],
    valid: checks[0].ok && checks[1].ok && checks[2].ok,
  };
}

export function PasswordMeter({ password }: { password: string }) {
  const { checks, score, label } = scorePassword(password);

  return (
    <div
      className="auth-meter"
      data-open={password.length > 0 ? "true" : "false"}
      data-score={score}
    >
      <div className="auth-meter-top">
        <span className="auth-meter-bars" aria-hidden="true">
          {[0, 1, 2, 3].map((index) => (
            <span key={index} data-lit={index < score ? "true" : "false"} />
          ))}
        </span>
        <span className="auth-meter-label">{label}</span>
      </div>

      <div className="auth-meter-reveal">
        <div>
          <ul className="auth-checks">
            {checks.map((check) => (
              <li key={check.key} data-ok={check.ok ? "true" : "false"}>
                <span className="auth-check-dot" aria-hidden="true">
                  {check.ok ? <Check className="h-2.5 w-2.5" /> : null}
                </span>
                {check.label}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
