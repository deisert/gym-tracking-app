/** Default rest length, until the user picks their own in the timer sheet. */
export const REST_TIMER_SECONDS = 120;

/** What the "+15 s" button adds to a running countdown. */
export const REST_EXTEND_SECONDS = 15;

/** Bounds and step for the duration stepper in the timer sheet. */
export const REST_MIN_SECONDS = 15;
export const REST_MAX_SECONDS = 600;
export const REST_STEP_SECONDS = 15;

/** One-tap choices offered above the stepper. */
export const REST_PRESET_SECONDS = [60, 90, 120, 180] as const;

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

/**
 * Snaps a duration onto the stepper grid (multiples of REST_STEP_SECONDS)
 * inside [REST_MIN_SECONDS, REST_MAX_SECONDS]; garbage falls back to the default.
 */
export function clampRestSeconds(seconds: number): number {
  if (!Number.isFinite(seconds)) return REST_TIMER_SECONDS;
  const snapped = Math.round(seconds / REST_STEP_SECONDS) * REST_STEP_SECONDS;
  return Math.min(REST_MAX_SECONDS, Math.max(REST_MIN_SECONDS, snapped));
}

/** Per-device timer preferences, kept in localStorage rather than per workout. */
export type RestTimerPrefs = {
  seconds: number;
  sound: boolean;
};

export const DEFAULT_REST_TIMER_PREFS: RestTimerPrefs = {
  seconds: REST_TIMER_SECONDS,
  sound: true,
};

/**
 * Reads the stored JSON back. Every field is checked on its own, so a corrupt
 * or partial value (an older app version, a hand-edited store) keeps whatever
 * is still usable and defaults the rest — it never throws.
 */
export function parseRestTimerPrefs(raw: string | null): RestTimerPrefs {
  if (!raw) return DEFAULT_REST_TIMER_PREFS;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return DEFAULT_REST_TIMER_PREFS;
  }
  if (typeof value !== "object" || value === null) return DEFAULT_REST_TIMER_PREFS;

  const { seconds, sound } = value as Record<string, unknown>;
  return {
    seconds:
      typeof seconds === "number" ? clampRestSeconds(seconds) : DEFAULT_REST_TIMER_PREFS.seconds,
    sound: typeof sound === "boolean" ? sound : DEFAULT_REST_TIMER_PREFS.sound,
  };
}
