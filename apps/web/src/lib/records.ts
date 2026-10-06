import { formatWeight } from "@/lib/sets";
import type { ExerciseRecord, RecordKind } from "@/lib/types";

/** „Neue Rekorde" looks back this many days, today included (spec §9.7). */
export const RECORDS_WINDOW_DAYS = 30;

/** Strongest claim first, for a session that set several records at once (spec §10.5). */
const KIND_PRIORITY: Record<RecordKind, number> = { weight: 0, e1rm: 1, reps: 2 };

/**
 * One line per exercise: its newest record, and when that session set several,
 * the strongest claim. `exercise_records()` returns up to three rows per
 * exercise, often for the same set — listing them all would crowd out every
 * other exercise.
 */
export function pickRecords(rows: ExerciseRecord[]): ExerciseRecord[] {
  const picked = new Map<string, ExerciseRecord>();
  for (const row of rows) {
    const current = picked.get(row.exerciseId);
    if (
      !current ||
      row.performedOn > current.performedOn ||
      (row.performedOn === current.performedOn &&
        KIND_PRIORITY[row.kind] < KIND_PRIORITY[current.kind])
    ) {
      picked.set(row.exerciseId, row);
    }
  }
  return [...picked.values()].sort(
    (a, b) =>
      b.performedOn.localeCompare(a.performedOn) ||
      a.exerciseName.localeCompare(b.exerciseName, "de")
  );
}

/** "85 kg × 5", or "12 Wdh." for bodyweight — "0 kg × 12" reads like an error. */
export function formatLift(weightKg: number, reps: number): string {
  return weightKg === 0 ? `${reps} Wdh.` : `${formatWeight(weightKg)} kg × ${reps}`;
}

/** What the record claims, under the exercise name. */
export function recordLabel(record: ExerciseRecord): string {
  switch (record.kind) {
    case "weight":
      return "bester Satz";
    case "e1rm":
      return `bester e1RM ${Math.round(record.e1rmKg)} kg`;
    case "reps":
      return "meiste Wdh.";
  }
}
