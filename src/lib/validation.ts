import { z } from "zod";

/** True when `n` has at most two decimal places, tolerant of float representation. */
function hasAtMostTwoDecimals(n: number): boolean {
  return Math.abs(n * 100 - Math.round(n * 100)) < 1e-9;
}

/** Matches "YYYY-MM-DD" AND checks the date actually exists. */
function isRealIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export const setInputSchema = z.object({
  // 0 means bodyweight; 9999.99 is the numeric(6,2) ceiling from the migration.
  weight_kg: z.number().min(0).max(9999.99).refine(hasAtMostTwoDecimals),
  reps: z.number().int().min(1).max(1000),
  is_warmup: z.boolean(),
});
export type SetInput = z.infer<typeof setInputSchema>;

export const exerciseNameSchema = z.string().trim().min(1).max(80);

export const workoutMetaSchema = z.object({
  performed_on: z.string().refine(isRealIsoDate),
  category: z.string().trim().max(40).nullable(),
  note: z.string().trim().max(2000).nullable(),
});
export type WorkoutMeta = z.infer<typeof workoutMetaSchema>;
