"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useSwipeToDelete } from "@/lib/use-swipe-to-delete";
import { usePrefersReducedMotion } from "@/lib/use-prefers-reduced-motion";
import { cn } from "@/lib/utils";

const REVEAL_WIDTH = 88;
const COMMIT_THRESHOLD = 200;

type SwipeGroupContextValue = {
  openId: string | null;
  setOpenId: (id: string | null) => void;
};

const SwipeGroupContext = createContext<SwipeGroupContextValue | null>(null);

/**
 * Groups `SwipeableRow`s so opening one closes any other already open — the
 * iOS Mail/Reminders behaviour. Wrap even a single row in this: it keeps
 * `SwipeableRow` to one code path instead of a controlled/uncontrolled split.
 */
export function SwipeGroupProvider({ children }: { children: ReactNode }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const value = useMemo(() => ({ openId, setOpenId }), [openId]);
  return <SwipeGroupContext.Provider value={value}>{children}</SwipeGroupContext.Provider>;
}

function useSwipeGroup(id: string) {
  const group = useContext(SwipeGroupContext);
  if (!group) {
    throw new Error("SwipeableRow must be rendered inside a SwipeGroupProvider");
  }
  const isOpen = group.openId === id;
  const onOpenChange = useCallback(
    (open: boolean) => group.setOpenId(open ? id : null),
    [group, id]
  );
  return { isOpen, onOpenChange };
}

type Props = {
  /** Unique within the enclosing SwipeGroupProvider. */
  id: string;
  deleteLabel: string;
  onDelete: () => void;
  children: ReactNode;
  className?: string;
};

/**
 * Wraps `children` with an iOS-style swipe-to-delete gesture. Swiping left
 * reveals a "Löschen" button (or a full swipe-through commits the delete
 * directly); the same button is a normal focusable element, reachable and
 * operable without ever performing the gesture (WCAG 2.5.1).
 */
export function SwipeableRow({ id, deleteLabel, onDelete, children, className }: Props) {
  const { isOpen, onOpenChange } = useSwipeGroup(id);
  const prefersReducedMotion = usePrefersReducedMotion();
  const { dragX, isDragging, rowHandlers } = useSwipeToDelete({
    onDelete,
    revealWidth: REVEAL_WIDTH,
    commitThreshold: COMMIT_THRESHOLD,
    isOpen,
    onOpenChange,
  });

  // py-0.5 on the wrapper: `overflow-hidden` would otherwise clip the 2px focus
  // ring of any control sitting flush against its top/bottom edge.
  return (
    <div className={cn("relative overflow-hidden rounded-xl py-0.5", className)}>
      <div
        className="flex"
        style={{
          width: `calc(100% + ${REVEAL_WIDTH}px)`,
          transform: `translateX(${dragX}px)`,
          transition:
            isDragging || prefersReducedMotion ? "none" : "transform 180ms ease-out",
        }}
      >
        <div {...rowHandlers} className="min-w-0 flex-1 touch-pan-y select-none">
          {children}
        </div>

        <button
          type="button"
          onClick={() => {
            // Close first: if the delete fails, the row must not stay stuck open
            // with its error message clipped by the wrapper's `overflow-hidden`.
            onOpenChange(false);
            onDelete();
          }}
          onFocus={() => onOpenChange(true)}
          onBlur={() => onOpenChange(false)}
          aria-label={deleteLabel}
          style={{ width: REVEAL_WIDTH }}
          className="min-h-12 shrink-0 rounded-xl bg-destructive text-sm font-medium text-destructive-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset focus-visible:outline-none"
        >
          Löschen
        </button>
      </div>
    </div>
  );
}
