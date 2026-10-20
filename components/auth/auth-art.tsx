import { Check, Glossary, ScanText } from "../icons";

export type AuthMode = "sign-in" | "sign-up";

/**
 * Decorative, full-bleed atmosphere behind the centred auth card.
 * Purely presentational: the auras drift, the grid pans, and two
 * product chips breathe at the edges on wide screens.
 */
export function AuthArt({ mode }: { mode: AuthMode }) {
  return (
    <aside className="auth-aside" data-mode={mode} aria-hidden="true">
      <div className="auth-aside-bg">
        <div className="auth-aura auth-aura-lavender" />
        <div className="auth-aura auth-aura-sky" />
        <div className="auth-aura auth-aura-mint" />
        <div className="auth-aura auth-aura-peach" />
        <div className="grid-field auth-aside-grid" />
        <div className="auth-aside-vignette" />
      </div>

      <div className="auth-orbit">
        <div className="auth-float-chip auth-float-chip--top">
          <span className="auth-float-icon auth-float-icon--mint">
            <ScanText className="h-3.5 w-3.5" />
          </span>
          <span className="auth-float-text">
            <span>Panels read</span>
            <strong>38 pages · 2m 14s</strong>
          </span>
        </div>

        <div className="auth-float-chip auth-float-chip--bottom">
          <span className="auth-float-icon auth-float-icon--lavender">
            <Glossary className="h-3.5 w-3.5" />
          </span>
          <span className="auth-float-text">
            <span>Glossary matched</span>
            <strong>14 terms kept</strong>
          </span>
          <span className="chip chip-mint">
            <Check className="h-2.5 w-2.5" />
            Auto
          </span>
        </div>
      </div>
    </aside>
  );
}
