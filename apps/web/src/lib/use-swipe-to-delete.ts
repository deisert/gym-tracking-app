"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { clampDragX, isTap, resolveSwipeOutcome } from "@/lib/swipe-gesture";

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
  /**
   * Whether the gesture that just ended was a drag rather than a tap.
   *
   * Read from the `click` that follows `pointerup`, so a swipe across
   * clickable row content (a workout row is a `<Link>`) can be swallowed
   * instead of navigating.
   */
  didDrag: () => boolean;
  rowHandlers: {
    onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
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
  // Distance the finger covered during this gesture. Deliberately not reset on
  // pointerup: the `click` that follows needs to read it.
  const travelRef = useRef(0);

  // An external open/close — keyboard focus on the delete button, another row
  // in the same group opening, or a tap outside — moves this row even with no
  // pointer down.
  useEffect(() => {
    if (pointerIdRef.current !== null) return;
    setDragX(isOpen ? -revealWidth : 0);
  }, [isOpen, revealWidth]);

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (pointerIdRef.current !== null) return;
      // Typing must win over swiping — but only while the row is closed. Once
      // it is open the whole row has to be draggable back, which on a set row
      // is almost entirely inputs and buttons (the scrim above them makes the
      // target a plain div, so this is belt and braces).
      if (!isOpen && INTERACTIVE_TAGS.has((event.target as HTMLElement).tagName)) return;
      pointerIdRef.current = event.pointerId;
      startClientXRef.current = event.clientX;
      startDragXRef.current = dragX;
      rawDeltaXRef.current = dragX;
      travelRef.current = 0;
      setIsDragging(true);
    },
    [dragX, isOpen]
  );

  const finishGesture = useCallback(
    (pointerId: number, cancelled: boolean) => {
      if (pointerIdRef.current !== pointerId) return;
      pointerIdRef.current = null;
      setIsDragging(false);

      // A cancelled gesture must never commit a delete: Android Chrome fires
      // `pointercancel` when it claims the touch for edge-back or
      // pull-to-refresh, which looks exactly like a left swipe starting near
      // the screen edge.
      if (cancelled) {
        setDragX(isOpen ? -revealWidth : 0);
        return;
      }

      // A tap on an open row puts it back — the iOS Mail behaviour, and the
      // only way to close a set row without hunting for the few pixels that
      // are not an input. Resolving by position instead would read the row's
      // resting -88px as "still open" and leave it stuck.
      if (isTap(travelRef.current) && isOpen) {
        setDragX(0);
        onOpenChange(false);
        return;
      }

      const outcome = resolveSwipeOutcome(rawDeltaXRef.current, revealWidth, commitThreshold, {
        startedOpen: startDragXRef.current !== 0,
      });
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
    [revealWidth, commitThreshold, onDelete, onOpenChange, isOpen]
  );

  /**
   * The gesture runs on `window`, not on the row, and takes no pointer capture.
   *
   * Capture would be the obvious choice, but it retargets the compatibility
   * mouse events too: the `click` that ends a plain tap would be delivered to
   * the row wrapper instead of the `<a>` inside it, and a workout row would
   * stop navigating. Listening on `window` keeps every move — including one
   * that leaves the row, which a swipe starting near its edge does within a
   * few pixels — while leaving click dispatch alone.
   */
  useEffect(() => {
    if (!isDragging) return;

    function onMove(event: PointerEvent) {
      if (pointerIdRef.current !== event.pointerId) return;
      travelRef.current = event.clientX - startClientXRef.current;
      const rawDeltaX = startDragXRef.current + travelRef.current;
      rawDeltaXRef.current = rawDeltaX;
      setDragX(clampDragX(rawDeltaX, revealWidth));
    }

    function onEnd(event: PointerEvent) {
      finishGesture(event.pointerId, event.type === "pointercancel");
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onEnd);
    window.addEventListener("pointercancel", onEnd);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onEnd);
      window.removeEventListener("pointercancel", onEnd);
    };
  }, [isDragging, revealWidth, finishGesture]);

  const didDrag = useCallback(() => !isTap(travelRef.current), []);

  return {
    dragX,
    isDragging,
    didDrag,
    rowHandlers: { onPointerDown },
  };
}
