"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { MouseEvent as ReactMouseEvent, ReactNode } from "react";
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
  /**
   * px of leftward travel that deletes without a second tap. Pass
   * `Number.POSITIVE_INFINITY` to opt a row out of full-swipe-through, so it
   * can only be deleted by tapping the revealed button — worth it where one
   * delete takes a lot of data with it.
   */
  commitThreshold?: number;
  children: ReactNode;
  className?: string;
};

/**
 * Wraps `children` with an iOS-style swipe-to-delete gesture. Swiping left
 * reveals a "Löschen" button (or a full swipe-through commits the delete
 * directly); the same button is a normal focusable element, reachable and
 * operable without ever performing the gesture (WCAG 2.5.1).
 *
 * While the row is open, a transparent scrim covers its content: a tap puts
 * the row back instead of reaching the input or link underneath, and the
 * whole row width becomes draggable rather than only the few pixels that
 * are not an interactive element.
 */
export function SwipeableRow({
  id,
  deleteLabel,
  onDelete,
  commitThreshold = COMMIT_THRESHOLD,
  children,
  className,
}: Props) {
  const { isOpen, onOpenChange } = useSwipeGroup(id);
  const prefersReducedMotion = usePrefersReducedMotion();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const deleteButtonRef = useRef<HTMLButtonElement>(null);
  const { dragX, isDragging, didDrag, rowHandlers } = useSwipeToDelete({
    onDelete,
    revealWidth: REVEAL_WIDTH,
    commitThreshold,
    isOpen,
    onOpenChange,
  });

  /**
   * An open row closes as soon as attention goes elsewhere.
   *
   * Group exclusivity only reaches rows inside the same `SwipeGroupProvider`,
   * and there is one provider per exercise card header and one per set list —
   * so without this, an open exercise header sits there while you type in a
   * set of the very same card.
   */
  useEffect(() => {
    if (!isOpen) return;

    function closeOnOutsidePointer(event: PointerEvent) {
      const wrapper = wrapperRef.current;
      if (wrapper && !wrapper.contains(event.target as Node)) onOpenChange(false);
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      const button = deleteButtonRef.current;
      if (button && document.activeElement === button) {
        // Blurring runs the button's own onBlur, which closes the row. Closing
        // it here instead would leave focus on a control that just slid out of
        // view behind the wrapper's `overflow-hidden`.
        button.blur();
        return;
      }
      onOpenChange(false);
    }

    document.addEventListener("pointerdown", closeOnOutsidePointer, true);
    document.addEventListener("keydown", closeOnEscape, true);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer, true);
      document.removeEventListener("keydown", closeOnEscape, true);
    };
  }, [isOpen, onOpenChange]);

  // A swipe across clickable content must not also activate it. Capture phase,
  // so this runs before the content's own handler (a `<Link>`'s navigation).
  const swallowClickAfterDrag = useCallback(
    (event: ReactMouseEvent<HTMLElement>) => {
      if (!didDrag()) return;
      event.preventDefault();
      event.stopPropagation();
    },
    [didDrag]
  );

  // py-0.5 on the wrapper: `overflow-hidden` would otherwise clip the 2px focus
  // ring of any control sitting flush against its top/bottom edge.
  return (
    <div ref={wrapperRef} className={cn("relative overflow-hidden rounded-xl py-0.5", className)}>
      <div
        className="flex"
        style={{
          width: `calc(100% + ${REVEAL_WIDTH}px)`,
          transform: `translateX(${dragX}px)`,
          transition:
            isDragging || prefersReducedMotion ? "none" : "transform 180ms ease-out",
        }}
      >
        <div
          {...rowHandlers}
          onClickCapture={swallowClickAfterDrag}
          className="relative min-w-0 flex-1 touch-pan-y select-none"
        >
          {children}

          {/* Hit target only — the pointer handlers on the parent see the
              bubbled events, and a tap resolves to "close" in the hook. */}
          {isOpen && <div aria-hidden className="absolute inset-0" />}
        </div>

        <button
          ref={deleteButtonRef}
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
