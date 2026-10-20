import { ArrowRight, Check, Glossary, ScanText, Sparkles } from "../icons";
import { PanelArt } from "../panel-art";

export type AuthMode = "sign-in" | "sign-up";

const copy = {
  "sign-in": {
    eyebrow: "Session resume",
    title: "The chapter is already",
    accent: "half done.",
    body: "Sign back in to pick up the review where your team left off — the panels, the passes, the glossary, all where you parked them.",
  },
  "sign-up": {
    eyebrow: "Free to start",
    title: "One panel in.",
    accent: "Natural English out.",
    body: "Create your account, then join your group. HwaFlow handles the reading, the translation, and the second pass that makes it sound human.",
  },
} satisfies Record<
  AuthMode,
  { eyebrow: string; title: string; accent: string; body: string }
>;

export function AuthArt({ mode }: { mode: AuthMode }) {
  const content = copy[mode];

  return (
    <aside className="auth-aside" data-mode={mode}>
      <div className="auth-aside-bg" aria-hidden="true">
        <div className="auth-aura auth-aura-lavender" />
        <div className="auth-aura auth-aura-mint" />
        <div className="auth-aura auth-aura-peach" />
        <div className="grid-field auth-aside-grid" />
      </div>

      <div className="auth-aside-inner">
        <div className="auth-art-copy" key={mode}>
          <p className="eyebrow">{content.eyebrow}</p>
          <h2 className="auth-art-title">
            {content.title}{" "}
            <span className="display-serif text-accent-ink">
              {content.accent}
            </span>
          </h2>
          <p className="auth-art-body">{content.body}</p>
        </div>

        <div className="auth-scene" aria-hidden="true">
          <div className="auth-float-chip auth-float-chip--top">
            <span className="auth-float-icon auth-float-icon--mint">
              <ScanText className="h-3.5 w-3.5" />
            </span>
            <span className="auth-float-text">
              <span>Panels read</span>
              <strong>38 pages · 2m 14s</strong>
            </span>
          </div>

          <div className="auth-preview">
            <div className="auth-preview-top">
              <span className="auth-preview-chapter">
                <span className="auth-preview-dot" />
                Chapter 42
              </span>
              <span className="chip">
                <Sparkles className="h-2.5 w-2.5" />
                2-pass
              </span>
            </div>

            <div className="auth-preview-art">
              <PanelArt id="auth-panel" className="h-full w-full" />

              <span className="auth-bubble auth-bubble--ko ko">
                …언니, 제발.
              </span>

              <span className="auth-bubble auth-bubble--en">
                …Sis, please.
                <span className="auth-bubble-check">
                  <Check className="h-2.5 w-2.5" />
                </span>
              </span>
            </div>

            <div className="auth-preview-foot">
              <span className="auth-preview-status">
                <span className="status-dot h-1.5 w-1.5" />
                {mode === "sign-in" ? "Ready for review" : "Workspace ready"}
              </span>

              <span className="auth-preview-pass">
                <span>Base</span>
                <ArrowRight className="h-3 w-3" />
                <span className="auth-preview-pass-active">Localize</span>
              </span>
            </div>
          </div>

          <div className="auth-float-chip auth-float-chip--bottom">
            <span className="auth-float-icon auth-float-icon--lavender">
              <Glossary className="h-3.5 w-3.5" />
            </span>
            <span className="auth-float-text">
              <span>Glossary matched</span>
              <strong>14 terms kept</strong>
            </span>
            <span className="chip chip-mint">Auto</span>
          </div>
        </div>

        <div className="auth-art-foot">
          <span>Korean</span>
          <span className="auth-art-sep" aria-hidden="true" />
          <span>Japanese</span>
          <span className="auth-art-sep" aria-hidden="true" />
          <span>Chinese</span>
          <ArrowRight className="h-3 w-3" />
          <span className="text-ink">English</span>
        </div>
      </div>
    </aside>
  );
}
