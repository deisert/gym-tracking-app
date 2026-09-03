import type { WorkoutExerciseDetail } from "@/lib/types";

/** One line of the end-of-workout summary: an exercise, its sets and its load. */
export type ExerciseSummary = {
  id: string;
  name: string;
  setCount: number;
  volumeKg: number;
};

export type WorkoutSummaryStats = {
  /** Every set that reached the database — the "abgeschlossene Sätze" headline. */
  setCount: number;
  workingSetCount: number;
  warmupSetCount: number;
  /** Exercises that actually got a set — one added and left empty was not trained. */
  exerciseCount: number;
  /**
   * Σ weight × reps over ALL sets, warm-ups included: this is total load moved,
   * not a comparison metric (`formatSetSummary` is the working-sets-only one).
   * Bodyweight sets (`weight_kg = 0`, CONCEPT.md §4) contribute nothing.
   */
  totalVolumeKg: number;
  /** Only exercises with at least one set, in workout order. */
  perExercise: ExerciseSummary[];
};

/**
 * `numeric(6,2)` weights summed as JS floats drift a hair off the exact value
 * (22.5 × 7 three times lands on 472.50000000000006). Round back to the
 * precision the column actually carries, per exercise and for the total, so
 * the parts add up to the whole on screen.
 */
function toKgPrecision(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Counts what a workout actually contains, from data the log screen has
 * already loaded.
 *
 * Pure and synchronous on purpose: the workout page's server component holds
 * every set of the workout anyway (`getWorkoutDetail`), so the summary — set
 * counts and moved weight alike — costs one pass over an array that is in
 * memory, not another query. See
 * `docs/superpowers/specs/2026-09-03-total-volume-evaluation.md`.
 */
export function summarizeWorkout(exercises: WorkoutExerciseDetail[]): WorkoutSummaryStats {
  let setCount = 0;
  let warmupSetCount = 0;
  let totalVolumeKg = 0;
  const perExercise: ExerciseSummary[] = [];

  for (const workoutExercise of exercises) {
    const sets = workoutExercise.sets;
    if (sets.length === 0) continue;

    let volumeKg = 0;
    for (const set of sets) {
      if (set.is_warmup) warmupSetCount += 1;
      // The per-set product is the unit of the whole calculation: one set's
      // moved weight is its load times the times it was lifted.
      volumeKg += set.weight_kg * set.reps;
    }

    setCount += sets.length;
    totalVolumeKg += volumeKg;

    perExercise.push({
      id: workoutExercise.id,
      name: workoutExercise.exercise.name,
      setCount: sets.length,
      volumeKg: toKgPrecision(volumeKg),
    });
  }

  return {
    setCount,
    workingSetCount: setCount - warmupSetCount,
    warmupSetCount,
    exerciseCount: perExercise.length,
    totalVolumeKg: toKgPrecision(totalVolumeKg),
    perExercise,
  };
}

const VOLUME_FORMAT = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 });

/** 4320.5 -> "4.320". Whole kilos: a rep more matters, 500 g of rounding does not. */
export function formatKilos(kg: number): string {
  return VOLUME_FORMAT.format(Math.round(kg));
}

/** 4320.5 -> "4.320 kg", for lines that carry no separate unit label. */
export function formatVolume(kg: number): string {
  return `${formatKilos(kg)} kg`;
}
