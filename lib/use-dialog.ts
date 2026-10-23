"use client";

import { useEffect, useRef } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/*
 * Body scroll lock is shared state.
 *
 * Two dialogs can be open at once (a roster row's confirm sheet over the invite
 * drawer). Each one used to save the overflow it found on mount and restore it
 * on unmount, so closing the *first* one restored the page to scrollable while
 * the second was still open — and closing the second then restored "hidden"
 * permanently. Counting opens fixes both directions.
 */
let openDialogs = 0;
let lockedOverflow = "";

function lockBodyScroll() {
  if (openDialogs === 0) {
    lockedOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
  openDialogs += 1;
}

function unlockBodyScroll() {
  openDialogs = Math.max(0, openDialogs - 1);
  if (openDialogs === 0) {
    document.body.style.overflow = lockedOverflow;
  }
}

/**
 * Drawer / dialog accessibility: traps Tab, closes on Escape, locks body
 * scroll, moves focus inside on open and restores it to the trigger on close.
 *
 * Returns the ref to attach to the panel element.
 */
export function useDialogA11y(open: boolean, onClose: () => void) {
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;

    const previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    lockBodyScroll();

    const focusFirst = () => {
      const panel = panelRef.current;
      if (!panel) return;
      const target =
        panel.querySelector<HTMLElement>("[data-autofocus]") ??
        panel.querySelector<HTMLElement>(FOCUSABLE) ??
        panel;
      target.focus();
    };

    // Wait for the portal-free panel to be painted before moving focus.
    const timer = window.setTimeout(focusFirst, 30);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;

      const panel = panelRef.current;
      if (!panel) return;
      const items = Array.from(
        panel.querySelectorAll<HTMLElement>(FOCUSABLE)
      ).filter((item) => item.offsetParent !== null || item === document.activeElement);
      if (items.length === 0) return;

      const first = items[0];
      const last = items[items.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);

    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("keydown", onKeyDown);
      unlockBodyScroll();
      previousFocus?.focus?.();
    };
  }, [open]);

  return panelRef;
}
