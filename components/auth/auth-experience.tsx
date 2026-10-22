"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  getInitials,
  setRememberedUsername,
  signOut,
  type AuthUser,
} from "@/lib/auth";
import { ArrowLeft, ArrowRight, Check } from "../icons";
import { Logo } from "../logo";
import { AuthArt, type AuthMode } from "./auth-art";
import { SignInForm } from "./sign-in-form";
import { SignUpForm } from "./sign-up-form";

const sparks = Array.from({ length: 12 }, (_, index) => index);

const paths: Record<AuthMode, string> = {
  "sign-in": "/login",
  "sign-up": "/register",
};

const titles: Record<AuthMode, string> = {
  "sign-in": "Sign in · HwaFlow",
  "sign-up": "Create your account · HwaFlow",
};

export function AuthExperience({
  initialMode,
  initialUser = null,
}: {
  initialMode: AuthMode;
  /** Resolved on the server; null when signed out (the normal case). */
  initialUser?: AuthUser | null;
}) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [success, setSuccess] = useState<{
    user: AuthUser;
    intent: AuthMode;
  } | null>(null);
  const [resumeUser, setResumeUser] = useState<AuthUser | null>(initialUser);
  const [stageHeight, setStageHeight] = useState<number>();

  const cardRef = useRef<HTMLDivElement>(null);
  const signInPanel = useRef<HTMLDivElement>(null);
  const signUpPanel = useRef<HTMLDivElement>(null);
  const spotlightFrame = useRef(0);

  useLayoutEffect(() => {
    const panel =
      mode === "sign-in" ? signInPanel.current : signUpPanel.current;
    if (!panel) return;

    const update = () => setStageHeight(panel.getBoundingClientRect().height);
    update();

    const observer = new ResizeObserver(update);
    observer.observe(panel);
    return () => observer.disconnect();
  }, [mode, success]);

  useEffect(() => {
    if (!success) return;
    // Full navigation, not router.push: it drops the cached viewer and the
    // localStorage stores hydrated before this sign-in.
    const timeout = window.setTimeout(
      () => window.location.assign("/dashboard"),
      3200
    );
    return () => window.clearTimeout(timeout);
  }, [success]);

  useEffect(() => {
    return () => {
      if (spotlightFrame.current) {
        window.cancelAnimationFrame(spotlightFrame.current);
      }
    };
  }, []);

  const switchMode = useCallback(
    (next: AuthMode, focus = true) => {
      if (mode === next) return;

      setMode(next);

      window.history.replaceState(window.history.state, "", paths[next]);
      document.title = titles[next];

      if (focus) {
        window.setTimeout(() => {
          const id = next === "sign-in" ? "signin-username" : "signup-name";
          document.getElementById(id)?.focus({ preventScroll: true });
        }, 80);
      }
    },
    [mode]
  );

  const handleSwitchClick =
    (next: AuthMode) => (event: ReactMouseEvent<HTMLAnchorElement>) => {
      if (
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey ||
        event.button !== 0
      ) {
        return;
      }
      event.preventDefault();
      switchMode(next);
    };

  const handleSuccess = (user: AuthUser) => {
    setSuccess({ user, intent: mode });
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "mouse") return;
    const card = cardRef.current;
    if (!card) return;

    const { clientX, clientY } = event;
    if (spotlightFrame.current) return;

    spotlightFrame.current = window.requestAnimationFrame(() => {
      spotlightFrame.current = 0;
      const rect = card.getBoundingClientRect();
      card.style.setProperty("--auth-mx", `${clientX - rect.left}px`);
      card.style.setProperty("--auth-my", `${clientY - rect.top}px`);
    });
  };

  const firstName =
    success?.user.displayName.trim().split(/\s+/)[0] || success?.user.username;

  return (
    <div className="auth-shell" data-mode={mode}>
      <header className="auth-topbar">
        <Logo />
        <Link href="/" className="auth-back">
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to home
        </Link>
      </header>

      <AuthArt mode={mode} />

      <main className="auth-main">
        <div className="auth-main-bg" aria-hidden="true">
          <div className="auth-halo auth-halo--lavender" />
          <div className="auth-halo auth-halo--mint" />
        </div>

        <div className="auth-main-body">
          <div
            ref={cardRef}
            className="auth-card"
            onPointerMove={handlePointerMove}
            data-success={success ? "true" : "false"}
          >
            {success ? (
              <div className="auth-success" role="status" aria-live="polite">
                <div className="auth-success-badge">
                  <span className="auth-success-ring" aria-hidden="true" />
                  <Check className="h-6 w-6" />
                </div>

                <p className="eyebrow justify-center">
                  {success.intent === "sign-up" ? "Account created" : "Signed in"}
                </p>

                <h2 className="auth-success-title">
                  {success.intent === "sign-up"
                    ? "Welcome to HwaFlow,"
                    : "Welcome back,"}{" "}
                  <span className="display-serif text-accent-ink">
                    {firstName}
                  </span>
                  .
                </h2>

                <p className="auth-success-sub">
                  You&apos;re signed in as{" "}
                  <strong>@{success.user.username}</strong>. Taking you to your
                  workspace in a moment.
                </p>

                <div className="auth-success-progress" aria-hidden="true">
                  <span />
                </div>

                <button
                  type="button"
                  className="auth-submit"
                  onClick={() => window.location.assign("/dashboard")}
                >
                  Open your dashboard
                  <ArrowRight className="auth-submit-icon h-4 w-4" />
                </button>

                <button
                  type="button"
                  className="auth-link auth-success-exit"
                  onClick={() => {
                    void signOut();
                    setSuccess(null);
                    switchMode(mode, false);
                  }}
                >
                  Sign out instead
                </button>

                <div className="auth-sparks" aria-hidden="true">
                  {sparks.map((index) => (
                    <span
                      key={index}
                      style={
                        {
                          "--spark-angle": `${index * 30}deg`,
                          "--spark-distance": `${62 + (index % 4) * 15}px`,
                          "--spark-delay": `${index * 18}ms`,
                        } as CSSProperties
                      }
                    />
                  ))}
                </div>
              </div>
            ) : resumeUser ? (
              <div className="auth-resume" role="status">
                <div className="auth-resume-avatar" aria-hidden="true">
                  {getInitials(resumeUser.displayName, resumeUser.username)}
                </div>

                <p className="eyebrow justify-center">Already signed in</p>

                <h2 className="auth-success-title">
                  You&apos;re in,{" "}
                  <span className="display-serif text-accent-ink">
                    {resumeUser.displayName.trim().split(/\s+/)[0] ||
                      resumeUser.username}
                  </span>
                  .
                </h2>

                <p className="auth-success-sub">
                  Signed in as <strong>@{resumeUser.username}</strong> in this
                  browser. Continue, or switch to another account.
                </p>

                <button
                  type="button"
                  className="auth-submit"
                  onClick={() => window.location.assign("/dashboard")}
                >
                  Open your dashboard
                  <ArrowRight className="auth-submit-icon h-4 w-4" />
                </button>

                <button
                  type="button"
                  className="auth-link auth-success-exit"
                  onClick={() => {
                    void signOut();
                    setRememberedUsername(null);
                    setResumeUser(null);
                  }}
                >
                  Sign out and use another account
                </button>
              </div>
            ) : (
              <>
                <nav
                  className="auth-switch"
                  aria-label="Sign in or create an account"
                >
                  <span className="auth-switch-thumb" aria-hidden="true" />
                  <a
                    href="/login"
                    className="auth-switch-option"
                    aria-current={mode === "sign-in" ? "page" : undefined}
                    onClick={handleSwitchClick("sign-in")}
                  >
                    Sign in
                  </a>
                  <a
                    href="/register"
                    className="auth-switch-option"
                    aria-current={mode === "sign-up" ? "page" : undefined}
                    onClick={handleSwitchClick("sign-up")}
                  >
                    Create account
                  </a>
                </nav>

                <div
                  className="auth-stage"
                  data-mode={mode}
                  style={stageHeight ? { height: `${stageHeight}px` } : undefined}
                >
                  <div
                    ref={signInPanel}
                    className="auth-panel"
                    data-panel="sign-in"
                    data-active={mode === "sign-in" ? "true" : "false"}
                    aria-hidden={mode !== "sign-in"}
                    inert={mode !== "sign-in"}
                  >
                    <div className="auth-head" key={mode}>
                      <p className="eyebrow">Your workspace</p>
                      <h1 className="auth-title">
                        Welcome{" "}
                        <span className="display-serif text-accent-ink">
                          back.
                        </span>
                      </h1>
                      <p className="auth-sub">
                        Your panels, your passes, your group&apos;s queue —
                        right where you left them.
                      </p>
                    </div>

                    <SignInForm
                      onSuccess={handleSuccess}
                      onSwitchToSignUp={() => switchMode("sign-up")}
                    />
                  </div>

                  <div
                    ref={signUpPanel}
                    className="auth-panel"
                    data-panel="sign-up"
                    data-active={mode === "sign-up" ? "true" : "false"}
                    aria-hidden={mode !== "sign-up"}
                    inert={mode !== "sign-up"}
                  >
                    <div className="auth-head" key={mode}>
                      <p className="eyebrow">Free to start</p>
                      <h1 className="auth-title">
                        Start your{" "}
                        <span className="display-serif text-accent-ink">
                          first chapter.
                        </span>
                      </h1>
                      <p className="auth-sub">
                        Create an account, then join your group. No email, no
                        card, no fuss.
                      </p>
                    </div>

                    <SignUpForm
                      onSuccess={handleSuccess}
                      onSwitchToSignIn={() => switchMode("sign-in")}
                    />
                  </div>
                </div>
              </>
            )}

            <p className="auth-demo">
              <span className="auth-demo-dot" aria-hidden="true" />
              Early build — accounts are real. Group data still lives in this
              browser.
            </p>
          </div>

          <p className="auth-legal">
            Korean · Japanese · Chinese → English · Built for scanlation teams
          </p>
        </div>
      </main>
    </div>
  );
}
