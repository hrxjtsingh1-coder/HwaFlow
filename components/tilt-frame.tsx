"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Tilts its content toward the pointer and moves a glare across it (see
 * `.preview-tilt` / `.preview-glare` in globals.css). The tilt is only a few
 * degrees: enough to read as depth, not enough to disturb the copy.
 */
export function TiltFrame({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      window.matchMedia("(pointer: coarse)").matches
    ) {
      return;
    }

    let frame = 0;
    let x = 0;
    let y = 0;

    const apply = () => {
      frame = 0;
      const rect = el.getBoundingClientRect();
      const px = Math.min(Math.max((x - rect.left) / rect.width, 0), 1);
      const py = Math.min(Math.max((y - rect.top) / rect.height, 0), 1);
      el.style.setProperty("--ry", `${(px - 0.5) * 4.2}deg`);
      el.style.setProperty("--rx", `${1.8 + (0.5 - py) * 3}deg`);
      el.style.setProperty("--px", `${px * 100}%`);
      el.style.setProperty("--py", `${py * 100}%`);
    };

    const onMove = (event: PointerEvent) => {
      x = event.clientX;
      y = event.clientY;
      el.dataset.tilting = "true";
      if (!frame) frame = requestAnimationFrame(apply);
    };

    const onLeave = () => {
      el.dataset.tilting = "false";
      el.style.removeProperty("--ry");
      el.style.removeProperty("--rx");
    };

    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);

    return () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div ref={ref} className="preview-tilt relative">
      {children}
      <div
        aria-hidden="true"
        className="preview-glare pointer-events-none absolute inset-0 z-20 rounded-[1.6rem]"
      />
    </div>
  );
}
