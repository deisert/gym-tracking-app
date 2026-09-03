/**
 * Converts a raw horizontal pointer delta into the row's translateX.
 *
 * Clamped to [-maxDrag, 0]: the row can never be dragged to the right of its
 * resting position, and past `maxDrag` further movement adds only a third
 * of the extra distance (rubber-banding) so the row still visibly responds
 * instead of hitting a hard wall.
 */
export function clampDragX(rawDeltaX: number, maxDrag: number): number {
  const proposed = Math.min(0, rawDeltaX);
  if (proposed >= -maxDrag) return proposed;
  const overshoot = -proposed - maxDrag;
  return -(maxDrag + overshoot / 3);
}

/** Travel below which a gesture is a tap, not a drag — finger jitter, not intent. */
export const TAP_SLOP = 8;

/**
 * Rightward travel that closes an already-open row.
 *
 * Much smaller than `revealWidth / 2`: pulling an open row back is a
 * correction, not a decision, so it should not need half the reveal width of
 * committed travel before it takes.
 */
export const CLOSE_THRESHOLD = 24;

/** True when the pointer barely moved — the gesture was a tap. */
export function isTap(travelPx: number): boolean {
  return Math.abs(travelPx) < TAP_SLOP;
}

export type SwipeOutcome = "closed" | "open" | "delete";

export type ResolveSwipeOptions = {
  /** The gesture began with the row already open, so pulling right means "close". */
  startedOpen?: boolean;
};

/**
 * Where a row settles once the pointer is released.
 *
 * - Past `commitThreshold`: the swipe committed a delete (full swipe-through,
 *   like iOS Mail) — no second tap needed.
 * - Started open and pulled back at least `CLOSE_THRESHOLD`: closes. Without
 *   this an open row only closes past half the reveal width, which reads as
 *   the row fighting back.
 * - Past half of `revealWidth`: snaps open, delete button stays visible.
 * - Otherwise: snaps back closed.
 */
export function resolveSwipeOutcome(
  dragX: number,
  revealWidth: number,
  commitThreshold: number,
  options: ResolveSwipeOptions = {}
): SwipeOutcome {
  const distance = -dragX;
  if (distance >= commitThreshold) return "delete";
  if (options.startedOpen && revealWidth - distance >= CLOSE_THRESHOLD) return "closed";
  if (distance >= revealWidth / 2) return "open";
  return "closed";
}
