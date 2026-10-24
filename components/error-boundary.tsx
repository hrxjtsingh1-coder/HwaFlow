"use client";

import { Component, type ReactNode } from "react";

/**
 * Keeps a crash local to one region of the workspace.
 *
 * Next's `error.tsx` replaces the whole route; a broken image decoder or a bad
 * glossary row must not take the text editor down with it. Error boundaries
 * have to be class components — there is no hook equivalent.
 */
export class Isolate extends Component<
  { children: ReactNode; label: string; className?: string },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error("[HwaFlow] isolated crash:", error);
  }

  render() {
    if (!this.state.failed) return this.props.children;

    return (
      <div
        className={`isolate-fallback${this.props.className ? ` ${this.props.className}` : ""}`}
        role="alert"
      >
        <p className="isolate-fallback-title">{this.props.label} stopped responding.</p>
        <p className="isolate-fallback-copy">
          The rest of the chapter is unaffected. Reload just this part.
        </p>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => this.setState({ failed: false })}
        >
          Reload
        </button>
      </div>
    );
  }
}
