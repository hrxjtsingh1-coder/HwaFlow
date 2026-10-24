"use client";

/**
 * The signed-in viewer's own settings, reachable from the profile block at the
 * bottom of every rail.
 *
 * Two tabs, because the two halves answer different questions: "who am I on
 * HwaFlow" (name, username, password) and "how do I want to read money"
 * (display currency). Each section saves on its own so a failed password change
 * never loses a name edit.
 */

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import {
  saveDisplayCurrency,
  saveDisplayName,
  savePassword,
  saveUsername,
  type AccountResult,
} from "@/lib/account-actions";
import { getInitials } from "@/lib/auth";
import type { AuthUser } from "@/lib/identity";
import { CURRENCIES } from "@/lib/money";
import { useDialogA11y } from "@/lib/use-dialog";
import { AlertCircle, Check, X } from "../icons";

type Tab = "account" | "general";
type Busy = "name" | "username" | "password" | "currency" | null;
type Notice = { tone: "success" | "error"; text: string };

type AccountDialogProps = {
  user: AuthUser;
  open: boolean;
  onClose: () => void;
};

export function AccountDialog({ user, open, onClose }: AccountDialogProps) {
  const router = useRouter();
  const panelRef = useDialogA11y(open, onClose);

  const [tab, setTab] = useState<Tab>("account");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState<Busy>(null);

  const [displayName, setDisplayName] = useState(user.displayName);
  const [username, setUsername] = useState(user.username);
  const [currency, setCurrency] = useState(user.displayCurrency);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // The rail keeps this component mounted, so a save that lands after a refresh
  // must not leave stale text in the fields.
  useEffect(() => {
    if (!open) return;
    setDisplayName(user.displayName);
    setUsername(user.username);
    setCurrency(user.displayCurrency);
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setNotice(null);
  }, [open, user.displayName, user.username, user.displayCurrency]);

  if (!open) return null;

  const settle = (result: AccountResult<unknown>, success: string) => {
    if (!result.ok) {
      setNotice({ tone: "error", text: result.message });
      return false;
    }

    setNotice({ tone: "success", text: success });
    router.refresh();
    return true;
  };

  const handleName = async () => {
    setBusy("name");
    const result = await saveDisplayName(displayName);
    setBusy(null);
    settle(result, "Display name saved.");
  };

  const handleUsername = async () => {
    setBusy("username");
    const result = await saveUsername(username);
    setBusy(null);

    if (result.ok) {
      setUsername(result.data.username);
      settle(
        result,
        `You're now @${result.data.username}. Sign in with that from now on.`
      );
      return;
    }

    settle(result, "");
  };

  const handlePassword = async () => {
    if (newPassword !== confirmPassword) {
      setNotice({ tone: "error", text: "The new passwords don't match." });
      return;
    }

    setBusy("password");
    const result = await savePassword({ currentPassword, newPassword });
    setBusy(null);

    if (settle(result, "Password changed.")) {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    }
  };

  const handleCurrency = async () => {
    setBusy("currency");
    const result = await saveDisplayCurrency(currency);
    setBusy(null);
    settle(result, `Amounts now show in ${currency}.`);
  };

  return (
    <div className="acct-layer">
      <div className="acct-backdrop" onClick={onClose} aria-hidden="true" />

      <div
        className="acct-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="acct-title"
        ref={panelRef}
        tabIndex={-1}
      >
        <header className="acct-head">
          <span className="acct-avatar" aria-hidden="true">
            {getInitials(user.displayName, user.username)}
          </span>
          <div className="acct-head-copy">
            <h2 className="acct-title" id="acct-title">
              Your account
            </h2>
            <p className="acct-sub">@{user.username}</p>
          </div>
          <button
            type="button"
            className="acct-close"
            onClick={onClose}
            aria-label="Close account settings"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="acct-tabs" role="tablist" aria-label="Account settings">
          <button
            type="button"
            role="tab"
            className="acct-tab"
            aria-selected={tab === "account"}
            data-active={tab === "account" ? "true" : "false"}
            onClick={() => setTab("account")}
          >
            Account
          </button>
          <button
            type="button"
            role="tab"
            className="acct-tab"
            aria-selected={tab === "general"}
            data-active={tab === "general" ? "true" : "false"}
            onClick={() => setTab("general")}
          >
            General
          </button>
        </div>

        {notice ? (
          <div
            className="acct-notice"
            data-tone={notice.tone}
            role="status"
            aria-live="polite"
          >
            <span className="acct-notice-icon" aria-hidden="true">
              {notice.tone === "success" ? (
                <Check className="h-3.5 w-3.5" />
              ) : (
                <AlertCircle className="h-3.5 w-3.5" />
              )}
            </span>
            {notice.text}
          </div>
        ) : null}

        <div className="acct-body">
          {tab === "account" ? (
            <>
              <section className="acct-section" aria-labelledby="acct-name">
                <h3 className="acct-section-title" id="acct-name">
                  Display name
                </h3>
                <p className="acct-section-copy">
                  What teammates see in the roster, on chapters, and in notices.
                </p>
                <div className="acct-row">
                  <input
                    className="acct-input"
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                    maxLength={60}
                    autoComplete="name"
                  />
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => void handleName()}
                    disabled={busy === "name" || displayName.trim() === user.displayName}
                  >
                    {busy === "name" ? "Saving…" : "Save"}
                  </button>
                </div>
              </section>

              <section className="acct-section" aria-labelledby="acct-username">
                <h3 className="acct-section-title" id="acct-username">
                  Username
                </h3>
                <p className="acct-section-copy">
                  This is how you sign in. Changing it moves your login with it —
                  nobody else can pick up the old one.
                </p>
                <div className="acct-row">
                  <label className="acct-input-wrap">
                    <span className="acct-input-prefix" aria-hidden="true">
                      @
                    </span>
                    <input
                      className="acct-input acct-input--prefixed"
                      value={username}
                      onChange={(event) => setUsername(event.target.value)}
                      autoComplete="username"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                    />
                  </label>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => void handleUsername()}
                    disabled={
                      busy === "username" ||
                      username.trim().toLowerCase() === user.username
                    }
                  >
                    {busy === "username" ? "Saving…" : "Save"}
                  </button>
                </div>
              </section>

              <section className="acct-section" aria-labelledby="acct-password">
                <h3 className="acct-section-title" id="acct-password">
                  Password
                </h3>
                <p className="acct-section-copy">
                  Enter your current password once, then choose a new one.
                </p>
                <div className="acct-stack">
                  <input
                    className="acct-input"
                    type="password"
                    value={currentPassword}
                    onChange={(event) => setCurrentPassword(event.target.value)}
                    placeholder="Current password"
                    autoComplete="current-password"
                  />
                  <input
                    className="acct-input"
                    type="password"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    placeholder="New password"
                    autoComplete="new-password"
                  />
                  <input
                    className="acct-input"
                    type="password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    placeholder="New password again"
                    autoComplete="new-password"
                  />
                </div>
                <button
                  type="button"
                  className="btn btn-primary btn-sm acct-submit"
                  onClick={() => void handlePassword()}
                  disabled={
                    busy === "password" ||
                    !currentPassword ||
                    !newPassword ||
                    !confirmPassword
                  }
                >
                  {busy === "password" ? "Changing…" : "Change password"}
                </button>
              </section>
            </>
          ) : (
            <section className="acct-section" aria-labelledby="acct-currency">
              <h3 className="acct-section-title" id="acct-currency">
                Display currency
              </h3>
              <p className="acct-section-copy">
                Groups set their own prices in their own currency. This only
                changes how those amounts are shown to you — using the latest
                monthly exchange rates.
              </p>
              <div className="acct-row">
                <select
                  className="acct-input"
                  value={currency}
                  onChange={(event) => setCurrency(event.target.value)}
                >
                  {CURRENCIES.map((code) => (
                    <option key={code} value={code}>
                      {code}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => void handleCurrency()}
                  disabled={busy === "currency" || currency === user.displayCurrency}
                >
                  {busy === "currency" ? "Saving…" : "Save"}
                </button>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
