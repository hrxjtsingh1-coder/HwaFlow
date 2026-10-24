"use client";

import { useEffect, useRef, type ReactNode } from "react";

const MAX_X = 16;
const MAX_Y = 8;
const MAX_ROTATE_Y = 3;
const MAX_ROTATE_X = 1.5;
const LERP = 0.16;

type TiltState = {
  x: number;
  y: number;
  rotateX: number;
  rotateY: number;
  targetX: number;
  targetY: number;
  targetRotateX: number;
  targetRotateY: number;
  raf: number;
};

/**
 * A deliberately small 3D stage: the workspace moves a few pixels under the
 * pointer, never more. The frame is transformed with CSS variables so React
 * does not re-render per frame, and the motion returns to zero when the
 * pointer leaves. Touch and reduced-motion users get the static frame.
 */
export function TiltFrame({ children }: { children: ReactNode }) {
  const stageRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const state = useRef<TiltState>({
    x: 0,
    y: 0,
    rotateX: 0,
    rotateY: 0,
    targetX: 0,
    targetY: 0,
    targetRotateX: 0,
    targetRotateY: 0,
    raf: 0,
  });

  useEffect(() => {
    const frame = frameRef.current;
    const stage = stageRef.current;
    if (!frame || !stage) return;

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    );
    const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
    if (reduceMotion.matches || !finePointer.matches) return;

    const tick = () => {
      const current = state.current;
      current.x += (current.targetX - current.x) * LERP;
      current.y += (current.targetY - current.y) * LERP;
      current.rotateX += (current.targetRotateX - current.rotateX) * LERP;
      current.rotateY += (current.targetRotateY - current.rotateY) * LERP;

      frame.style.setProperty("--mx", `${current.x.toFixed(2)}px`);
      frame.style.setProperty("--my", `${current.y.toFixed(2)}px`);
      frame.style.setProperty("--rx", `${current.rotateX.toFixed(3)}deg`);
      frame.style.setProperty("--ry", `${current.rotateY.toFixed(3)}deg`);

      const settled =
        Math.abs(current.targetX - current.x) < 0.03 &&
        Math.abs(current.targetY - current.y) < 0.03 &&
        Math.abs(current.targetRotateX - current.rotateX) < 0.01 &&
        Math.abs(current.targetRotateY - current.rotateY) < 0.01;

      if (settled) {
        current.raf = 0;
        frame.dataset.tilting = "false";
        return;
      }

      current.raf = requestAnimationFrame(tick);
    };

    const wake = () => {
      const current = state.current;
      if (current.raf) return;
      frame.dataset.tilting = "true";
      current.raf = requestAnimationFrame(tick);
    };

    const onMove = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;

      const rect = stage.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;

      const nx = Math.max(
        -1,
        Math.min(1, ((event.clientX - rect.left) / rect.width - 0.5) * 2)
      );
      const ny = Math.max(
        -1,
        Math.min(1, ((event.clientY - rect.top) / rect.height - 0.5) * 2)
      );

      const current = state.current;
      current.targetX = nx * MAX_X;
      current.targetY = ny * MAX_Y;
      current.targetRotateY = nx * -MAX_ROTATE_Y;
      current.targetRotateX = ny * MAX_ROTATE_X;
      wake();
    };

    const onLeave = () => {
      const current = state.current;
      current.targetX = 0;
      current.targetY = 0;
      current.targetRotateX = 0;
      current.targetRotateY = 0;
      wake();
    };

    stage.addEventListener("pointermove", onMove, { passive: true });
    stage.addEventListener("pointerleave", onLeave);

    return () => {
      stage.removeEventListener("pointermove", onMove);
      stage.removeEventListener("pointerleave", onLeave);
      if (state.current.raf) {
        cancelAnimationFrame(state.current.raf);
        state.current.raf = 0;
      }
    };
  }, []);

  return (
    <div ref={stageRef} className="tilt-stage">
      <div ref={frameRef} className="tilt-frame" data-tilting="false">
        {children}
      </div>
    </div>
  );
}
