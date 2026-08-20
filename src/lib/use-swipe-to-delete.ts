"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { clampDragX, resolveSwipeOutcome } from "@/lib/swipe-gesture";

export type UseSwipeToDeleteOptions = {
  onDelete: () => void;
  /** px the row settles at once opened; also the delete button's width. */
  revealWidth: number;
  /** px of leftward travel that commits a delete on release. */
  commitThreshold: number;
  /** True once open, whether by swipe, by full-swipe-adjacent tap, or by keyboard focus. */
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
};

export type UseSwipeToDeleteResult = {
  dragX: number;
  isDragging: boolean;
  rowHandlers: {
    onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
    onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
    onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void;
    onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => void;
  };
};

const INTERACTIVE_TAGS = new Set(["INPUT", "TEXTAREA", "BUTTON", "SELECT"]);

export function useSwipeToDelete({
  onDelete,
  revealWidth,
  commitThreshold,
  isOpen,
  onOpenChange,
}: UseSwipeToDeleteOptions): UseSwipeToDeleteResult {
  const [dragX, setDragX] = useState(isOpen ? -revealWidth : 0);
  const [isDragging, setIsDragging] = useState(false);
  const pointerIdRef = useRef<number | null>(null);
  const startClientXRef = useRef(0);
  const startDragXRef = useRef(0);
  // Raw (unclamped) finger travel. `dragX` is rubber-banded by `clampDragX` for
  // rendering, so resolving the outcome against it would need ~424px of real
  // travel to reach a -200px commit threshold — wider than a phone screen.
  const rawDeltaXRef = useRef(0);

  // An external open/close — keyboard focus on the delete button, or another
  // row in the same group opening — moves this row even with no pointer down.
  useEffect(() => {
    if (pointerIdRef.current !== null) return;
    setDragX(isOpen ? -revealWidth : 0);
  }, [isOpen, revealWidth]);

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (pointerIdRef.current !== null) return;
      if (INTERACTIVE_TAGS.has((event.target as HTMLElement).tagName)) return;
      pointerIdRef.current = event.pointerId;
      startClientXRef.current = event.clientX;
      startDragXRef.current = dragX;
      rawDeltaXRef.current = dragX;
      setIsDragging(true);
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [dragX]
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (pointerIdRef.current !== event.pointerId) return;
      const rawDeltaX = startDragXRef.current + (event.clientX - startClientXRef.current);
      rawDeltaXRef.current = rawDeltaX;
      setDragX(clampDragX(rawDeltaX, revealWidth));
    },
    [revealWidth]
  );

  const endDrag = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (pointerIdRef.current !== event.pointerId) return;
      pointerIdRef.current = null;
      setIsDragging(false);

      const outcome = resolveSwipeOutcome(rawDeltaXRef.current, revealWidth, commitThreshold);
      if (outcome === "delete") {
        // Reset the rendered offset as well as the group state: when the row is
        // already closed in the group, `onOpenChange(false)` is a no-op and the
        // effect above never re-runs, so a *failed* delete would leave the row
        // translated with its error message clipped by `overflow-hidden`.
        setDragX(0);
        onOpenChange(false);
        onDelete();
        return;
      }
      const nextOpen = outcome === "open";
      onOpenChange(nextOpen);
      setDragX(nextOpen ? -revealWidth : 0);
    },
    [revealWidth, commitThreshold, onDelete, onOpenChange]
  );

  // A cancelled gesture must never commit a delete: Android Chrome fires
  // `pointercancel` when it claims the touch for edge-back or pull-to-refresh,
  // which looks exactly like a left swipe starting near the screen edge.
  const cancelDrag = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (pointerIdRef.current !== event.pointerId) return;
      pointerIdRef.current = null;
      setIsDragging(false);
      setDragX(isOpen ? -revealWidth : 0);
    },
    [isOpen, revealWidth]
  );

  return {
    dragX,
    isDragging,
    rowHandlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: endDrag,
      onPointerCancel: cancelDrag,
    },
  };
}
