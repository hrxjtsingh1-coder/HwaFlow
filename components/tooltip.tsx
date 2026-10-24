"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Hover/focus tooltip for the workspace.
 *
 * Native `title` waits about a second, cannot be styled, and never shows on
 * keyboard focus. This paints in a portal so the rails' `overflow: hidden`
 * cannot clip it. Keyboard users already get the button's `aria-label`; the
 * bubble is a visual affordance, so it stays out of the accessibility tree.
 */

const OPEN_DELAY_MS = 350;

type Position = { x: number; y: number; below: boolean };

export function Tooltip({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  const anchor = useRef<HTMLSpanElement>(null);
  const timer = useRef<number | null>(null);
  const [position, setPosition] = useState<Position | null>(null);

  const hide = useCallback(() => {
    if (timer.current) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    setPosition(null);
  }, []);

  const show = useCallback(() => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      const box = anchor.current?.getBoundingClientRect();
      if (!box) return;

      // Flip below the control when there is no room above it.
      const below = box.top < 52;
      setPosition({
        x: Math.min(
          Math.max(box.left + box.width / 2, 90),
          window.innerWidth - 90
        ),
        y: below ? box.bottom + 8 : box.top - 8,
        below,
      });
    }, OPEN_DELAY_MS);
  }, []);

  useEffect(() => {
    if (!position) return;
    // A fixed bubble would drift away from its control on scroll.
    window.addEventListener("scroll", hide, true);
    return () => window.removeEventListener("scroll", hide, true);
  }, [position, hide]);

  useEffect(() => {
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, []);

  return (
    <span
      ref={anchor}
      className="tip-wrap"
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse") show();
      }}
      onPointerLeave={hide}
      onPointerDown={hide}
      onFocusCapture={show}
      onBlurCapture={hide}
    >
      {children}
      {position
        ? createPortal(
            <span
              className="tip-bubble"
              aria-hidden="true"
              style={{
                left: position.x,
                top: position.y,
                transform: `translate(-50%, ${position.below ? "0" : "-100%"})`,
              }}
            >
              {label}
            </span>,
            document.body
          )
        : null}
    </span>
  );
}
