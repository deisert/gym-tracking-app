import type { ExerciseOption, LastPerformance, SetRecord } from "@/lib/types";
import { createServerSupabase } from "@/lib/supabase/server";

type RawSet = {
  id: string;
  position: number;
  weight_kg: number | string;
  reps: number;
  is_warmup: boolean;
};

function toSetRecord(raw: RawSet): SetRecord {
  return {
    id: raw.id,
    position: raw.position,
    weight_kg: Number(raw.weight_kg),
    reps: raw.reps,
    is_warmup: raw.is_warmup,
  };
}

/** Escapes `%`, `_` and `\` so an `ilike` pattern matches the literal input. */
function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/**
 * Non-archived exercises matching `query`, most recently used first.
 *
 * Recency is computed in JS rather than SQL: this is a single-user library of
 * tens of rows, and a view or RPC would be more machinery than the ordering is
 * worth. Revisit if the library ever grows past a few hundred exercises.
 */
export async function searchExercises(query: string): Promise<ExerciseOption[]> {
  const supabase = await createServerSupabase();

  const trimmed = query.trim();

  let exerciseQuery = supabase
    .from("exercises")
    .select("id, name, note")
    .eq("is_archived", false);

  if (trimmed.length > 0) {
    exerciseQuery = exerciseQuery.ilike("name", `%${escapeLikePattern(trimmed)}%`);
  }

  const [
    { data: exercises, error: exercisesError },
    { data: usage, error: usageError },
  ] = await Promise.all([
    exerciseQuery.order("name", { ascending: true }),
    supabase
      .from("workout_exercises")
      .select("exercise_id, created_at")
      .order("created_at", { ascending: false })
      .limit(200),
  ]);

  if (exercisesError) {
    console.error("searchExercises: failed to load exercises", { query }, exercisesError);
  }
  if (usageError) {
    console.error("searchExercises: failed to load exercise usage", { query }, usageError);
  }

  if (!exercises) return [];

  // First occurrence wins because `usage` is already newest-first.
  const lastUsedAt = new Map<string, string>();
  for (const row of usage ?? []) {
    if (!lastUsedAt.has(row.exercise_id)) lastUsedAt.set(row.exercise_id, row.created_at);
  }

  return [...exercises].sort((a, b) => {
    const usedA = lastUsedAt.get(a.id);
    const usedB = lastUsedAt.get(b.id);
    if (usedA && usedB) return usedA < usedB ? 1 : -1;
    if (usedA) return -1;
    if (usedB) return 1;
    return a.name.localeCompare(b.name, "de");
  });
}

/**
 * The last session of each requested exercise, for ghost values.
 *
 * "Last" means: the newest workout by `performed_on` that is not later than
 * `beforeDate` and is not `excludeWorkoutId` — so a backdated workout never
 * shows numbers from the future.
 */
export async function getLastPerformances(
  exerciseIds: string[],
  beforeDate: string,
  excludeWorkoutId: string
): Promise<Map<string, LastPerformance>> {
  const result = new Map<string, LastPerformance>();
  if (exerciseIds.length === 0) return result;

  const supabase = await createServerSupabase();

  const { data, error } = await supabase
    .from("workout_exercises")
    .select(
      `id, exercise_id, workout_id,
       workouts!inner ( id, performed_on ),
       sets ( id, position, weight_kg, reps, is_warmup )`
    )
    .in("exercise_id", exerciseIds)
    .neq("workout_id", excludeWorkoutId)
    .lte("workouts.performed_on", beforeDate);

  if (error) {
    console.error(
      "getLastPerformances: failed to load last performances",
      { exerciseIds, beforeDate, excludeWorkoutId },
      error
    );
  }
  if (error || !data) return result;

  type Row = {
    exercise_id: string;
    workouts: { id: string; performed_on: string } | null;
    sets: RawSet[] | null;
  };

  // Pick the newest row per exercise in JS: the candidate set is one user's
  // history for a handful of exercises, so sorting here beats a window function.
  for (const row of data as unknown as Row[]) {
    if (!row.workouts) continue;
    if (!row.sets || row.sets.length === 0) continue; // an exercise with no sets is no comparison

    const current = result.get(row.exercise_id);
    if (current && current.performedOn >= row.workouts.performed_on) continue;

    result.set(row.exercise_id, {
      workoutId: row.workouts.id,
      performedOn: row.workouts.performed_on,
      sets: row.sets.map(toSetRecord).sort((a, b) => a.position - b.position),
    });
  }

  return result;
}
