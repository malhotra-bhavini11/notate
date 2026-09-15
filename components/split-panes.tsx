"use client";

import { useRef, useState, useSyncExternalStore } from "react";

import { cn } from "@/lib/utils";

const STORAGE_KEY = "notate:split-ratio";
const DEFAULT_RATIO = 0.5;
const MIN_RATIO = 0.2;
const MAX_RATIO = 0.8;
const KEY_STEP = 0.02;

const clamp = (r: number) => Math.min(MAX_RATIO, Math.max(MIN_RATIO, r));

// The ratio lives outside React so every split view shares it and it survives
// navigation; useSyncExternalStore renders the default on the server and swaps
// in the stored value on hydration without a mismatch.
let ratio: number | null = null;
const listeners = new Set<() => void>();

function readRatio(): number {
  if (ratio === null) {
    try {
      const stored = Number(window.localStorage.getItem(STORAGE_KEY));
      ratio = stored ? clamp(stored) : DEFAULT_RATIO;
    } catch {
      ratio = DEFAULT_RATIO;
    }
  }
  return ratio;
}

function writeRatio(next: number, persist: boolean) {
  ratio = clamp(next);
  listeners.forEach((l) => l());
  if (!persist) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, String(ratio));
  } catch {
    // Private mode or blocked storage: the ratio still applies for this session.
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

interface SplitPanesProps {
  left: React.ReactNode;
  right: React.ReactNode;
  leftLabel: string;
  rightLabel: string;
}

/**
 * Two panes with a draggable, keyboard-accessible divider. Below the `md`
 * breakpoint the panes stack vertically and the divider is hidden.
 */
export function SplitPanes({ left, right, leftLabel, rightLabel }: SplitPanesProps) {
  const current = useSyncExternalStore(subscribe, readRatio, () => DEFAULT_RATIO);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  const ratioFromPointer = (clientX: number) => {
    const rect = containerRef.current!.getBoundingClientRect();
    return (clientX - rect.left) / rect.width;
  };

  return (
    <div
      ref={containerRef}
      className={cn("flex h-full min-h-0 flex-col md:flex-row", dragging && "cursor-col-resize select-none")}
      style={{ "--split": `${current * 100}%` } as React.CSSProperties}
    >
      <section
        aria-label={leftLabel}
        // While dragging, panes ignore the pointer so the PDF text layer can't steal the drag.
        className={cn(
          "flex h-1/2 min-h-0 min-w-0 flex-col border-b md:h-auto md:shrink-0 md:basis-(--split) md:border-b-0",
          dragging && "pointer-events-none",
        )}
      >
        {left}
      </section>

      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize panes"
        aria-valuemin={MIN_RATIO * 100}
        aria-valuemax={MAX_RATIO * 100}
        aria-valuenow={Math.round(current * 100)}
        tabIndex={0}
        title="Drag to resize · double-click to reset"
        className="group relative hidden w-px shrink-0 cursor-col-resize bg-border outline-none md:block"
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.preventDefault();
          e.currentTarget.setPointerCapture(e.pointerId);
          setDragging(true);
        }}
        onPointerMove={(e) => {
          if (dragging) writeRatio(ratioFromPointer(e.clientX), false);
        }}
        onPointerUp={(e) => {
          if (!dragging) return;
          e.currentTarget.releasePointerCapture(e.pointerId);
          setDragging(false);
          writeRatio(ratioFromPointer(e.clientX), true);
        }}
        onPointerCancel={() => {
          setDragging(false);
          writeRatio(current, true);
        }}
        onDoubleClick={() => writeRatio(DEFAULT_RATIO, true)}
        onKeyDown={(e) => {
          const next =
            e.key === "ArrowLeft" ? current - KEY_STEP
            : e.key === "ArrowRight" ? current + KEY_STEP
            : e.key === "Home" ? MIN_RATIO
            : e.key === "End" ? MAX_RATIO
            : e.key === "Enter" ? DEFAULT_RATIO
            : null;
          if (next === null) return;
          e.preventDefault();
          writeRatio(next, true);
        }}
      >
        {/* Wider invisible hit area, and a visible handle on hover/focus/drag. */}
        <span className="absolute inset-y-0 -left-1.5 -right-1.5" />
        <span
          className={cn(
            "absolute inset-y-0 -left-px w-[3px] bg-ring opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100",
            dragging && "opacity-100",
          )}
        />
      </div>

      <section aria-label={rightLabel} className={cn("flex min-h-0 min-w-0 flex-1 flex-col", dragging && "pointer-events-none")}>
        {right}
      </section>
    </div>
  );
}
