/** How long the rest countdown runs after a new set is saved. */
export const REST_TIMER_SECONDS = 120;

/** What the "+15 s" button adds to a running countdown. */
export const REST_EXTEND_SECONDS = 15;

/**
 * Whole seconds left until `endsAt` (epoch ms), rounded up so the display
 * reads 0:01 until the very end. Derived from timestamps, never from counting
 * ticks: a locked phone or background tab stops the ticks but not the clock.
 */
export function restRemainingSeconds(endsAt: number, now: number): number {
  return Math.max(0, Math.ceil((endsAt - now) / 1000));
}

/** "m:ss"; anything negative or not a number reads "0:00". */
export function formatRestTime(seconds: number): string {
  const whole = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}
