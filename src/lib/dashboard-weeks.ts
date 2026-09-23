import { addDays, mondayOf } from "@/lib/dates";
import type { WeekStat } from "@/lib/types";

/**
 * A week counts toward the streak at this many workouts (spec §9.3). A user
 * setting in phase 3 (Frequenzziel); a named constant until then.
 */
export const STREAK_THRESHOLD = 2;

/** How many completed weeks the Ø line looks back. */
export const AVERAGE_WINDOW_WEEKS = 8;

function countsByWeek(weeks: WeekStat[]): Map<string, number> {
  return new Map(weeks.map((w) => [w.weekStart, w.workoutCount]));
}

function firstWeekOf(weeks: WeekStat[]): string | null {
  return weeks.reduce<string | null>(
    (first, w) => (first === null || w.weekStart < first ? w.weekStart : first),
    null
  );
}

/** The week containing `today`, or zeros — a week without training is still a week. */
export function thisWeek(weeks: WeekStat[], today: string): WeekStat {
  const weekStart = mondayOf(today);
  return (
    weeks.find((w) => w.weekStart === weekStart) ?? {
      weekStart,
      workoutCount: 0,
      setCount: 0,
      volumeKg: 0,
    }
  );
}

/**
 * Consecutive weeks at or above `threshold`, counted back from the last
 * COMPLETED week. The running week can extend the streak but never break it:
 * on a Wednesday it simply has not happened yet.
 */
export function currentStreak(
  weeks: WeekStat[],
  today: string,
  threshold = STREAK_THRESHOLD
): number {
  const first = firstWeekOf(weeks);
  if (first === null) return 0;

  const counts = countsByWeek(weeks);
  const current = mondayOf(today);
  let streak = 0;
  // Bounded by the first logged week, so a threshold of 0 cannot loop forever.
  for (
    let week = addDays(current, -7);
    week >= first && (counts.get(week) ?? 0) >= threshold;
    week = addDays(week, -7)
  ) {
    streak += 1;
  }
  if ((counts.get(current) ?? 0) >= threshold) streak += 1;
  return streak;
}

/**
 * Ø workouts per completed week over the last `window` weeks — or fewer when
 * the log is younger: dividing three weeks of training by eight would report a
 * slump that never happened. Empty weeks inside the span count as 0; that is
 * the honest part. `null` until one week is complete.
 */
export function weeklyAverage(
  weeks: WeekStat[],
  today: string,
  window = AVERAGE_WINDOW_WEEKS
): { average: number; weekCount: number } | null {
  const first = firstWeekOf(weeks);
  if (first === null) return null;

  const counts = countsByWeek(weeks);
  let total = 0;
  let weekCount = 0;
  for (
    let week = addDays(mondayOf(today), -7);
    weekCount < window && week >= first;
    week = addDays(week, -7)
  ) {
    total += counts.get(week) ?? 0;
    weekCount += 1;
  }
  return weekCount === 0 ? null : { average: total / weekCount, weekCount };
}

const AVERAGE_FORMAT = new Intl.NumberFormat("de-DE", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/** 2.375 -> "2,4". Always one decimal, so "2,0" does not read as a different kind of number. */
export function formatAverage(value: number): string {
  return AVERAGE_FORMAT.format(value);
}

/** The lifetime odometer: the sum of every week, so it needs no query of its own. */
export function sumTotals(weeks: WeekStat[]): {
  workoutCount: number;
  setCount: number;
  volumeKg: number;
} {
  return weeks.reduce(
    (total, w) => ({
      workoutCount: total.workoutCount + w.workoutCount,
      setCount: total.setCount + w.setCount,
      volumeKg: total.volumeKg + w.volumeKg,
    }),
    { workoutCount: 0, setCount: 0, volumeKg: 0 }
  );
}
