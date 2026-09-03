import type { WorkoutExerciseDetail } from "@/lib/types";

/** One line of the end-of-workout summary: an exercise and how many sets it got. */
export type ExerciseSetCount = {
  id: string;
  name: string;
  setCount: number;
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
  perExercise: ExerciseSetCount[];
};

/**
 * Counts what a workout actually contains, from data the log screen has
 * already loaded.
 *
 * Pure and synchronous on purpose: the workout page's server component holds
 * every set of the workout anyway (`getWorkoutDetail`), so the summary — set
 * counts today, total volume next — costs one pass over an array that is in
 * memory, not another query. See
 * `docs/superpowers/specs/2026-09-03-total-volume-evaluation.md`.
 */
export function summarizeWorkout(exercises: WorkoutExerciseDetail[]): WorkoutSummaryStats {
  let setCount = 0;
  let warmupSetCount = 0;
  let totalVolumeKg = 0;
  const perExercise: ExerciseSetCount[] = [];

  for (const workoutExercise of exercises) {
    const sets = workoutExercise.sets;
    if (sets.length === 0) continue;

    setCount += sets.length;
    for (const set of sets) {
      if (set.is_warmup) warmupSetCount += 1;
      totalVolumeKg += set.weight_kg * set.reps;
    }

    perExercise.push({
      id: workoutExercise.id,
      name: workoutExercise.exercise.name,
      setCount: sets.length,
    });
  }

  return {
    setCount,
    workingSetCount: setCount - warmupSetCount,
    warmupSetCount,
    exerciseCount: perExercise.length,
    // Weights carry two decimals (`numeric(6,2)`), so the float sum can drift
    // a hair below/above the exact value — round it back to kg precision.
    totalVolumeKg: Math.round(totalVolumeKg * 100) / 100,
    perExercise,
  };
}

const VOLUME_FORMAT = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 });

/** 4320.5 -> "4.320 kg". Whole kilos: a rep more matters, 500 g of rounding does not. */
export function formatVolume(kg: number): string {
  return `${VOLUME_FORMAT.format(Math.round(kg))} kg`;
}
