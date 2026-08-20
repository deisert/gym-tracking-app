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

export type SwipeOutcome = "closed" | "open" | "delete";

/**
 * Where a row settles once the pointer is released.
 *
 * - Past `commitThreshold`: the swipe committed a delete (full swipe-through,
 *   like iOS Mail) — no second tap needed.
 * - Past half of `revealWidth`: snaps open, delete button stays visible.
 * - Otherwise: snaps back closed.
 */
export function resolveSwipeOutcome(
  dragX: number,
  revealWidth: number,
  commitThreshold: number
): SwipeOutcome {
  const distance = -dragX;
  if (distance >= commitThreshold) return "delete";
  if (distance >= revealWidth / 2) return "open";
  return "closed";
}
