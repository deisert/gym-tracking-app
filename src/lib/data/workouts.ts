import "server-only";

import type {
  SetRecord,
  WorkoutDetail,
  WorkoutExerciseDetail,
  WorkoutSummary,
} from "@/lib/types";
import { createServerSupabase } from "@/lib/supabase/server";

/** Shape PostgREST returns for the nested select below. `numeric` may arrive as a string. */
type RawSet = {
  id: string;
  position: number;
  weight_kg: number | string;
  reps: number;
  is_warmup: boolean;
};

type RawWorkoutExercise = {
  id: string;
  position: number;
  note: string | null;
  exercises: { id: string; name: string } | null;
  sets: RawSet[] | null;
};

type RawWorkout = {
  id: string;
  performed_on: string;
  category: string | null;
  note: string | null;
  workout_exercises: RawWorkoutExercise[] | null;
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

export async function getWorkoutDetail(workoutId: string): Promise<WorkoutDetail | null> {
  const supabase = await createServerSupabase();

  const { data, error } = await supabase
    .from("workouts")
    .select(
      `id, performed_on, category, note,
       workout_exercises (
         id, position, note,
         exercises ( id, name ),
         sets ( id, position, weight_kg, reps, is_warmup )
       )`
    )
    .eq("id", workoutId)
    .maybeSingle();

  if (error) {
    console.error("getWorkoutDetail: failed to load workout", { workoutId }, error);
  }
  if (error || !data) return null;

  const raw = data as unknown as RawWorkout;

  const exercises: WorkoutExerciseDetail[] = (raw.workout_exercises ?? [])
    // An exercise row can only be null if the join broke; skip rather than crash.
    .filter((we) => we.exercises !== null)
    .map((we) => ({
      id: we.id,
      position: we.position,
      note: we.note,
      exercise: { id: we.exercises!.id, name: we.exercises!.name },
      sets: (we.sets ?? []).map(toSetRecord).sort((a, b) => a.position - b.position),
    }))
    .sort((a, b) => a.position - b.position);

  return {
    id: raw.id,
    performed_on: raw.performed_on,
    category: raw.category,
    note: raw.note,
    exercises,
  };
}

export async function listRecentWorkouts(limit: number): Promise<WorkoutSummary[]> {
  const supabase = await createServerSupabase();

  const { data, error } = await supabase
    .from("workouts")
    .select(
      `id, performed_on, category, note,
       workout_exercises ( id, sets ( id ) )`
    )
    .order("performed_on", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("listRecentWorkouts: failed to load workouts", { limit }, error);
  }
  if (error || !data) return [];

  return (data as unknown as RawWorkout[]).map((w) => {
    const exercises = w.workout_exercises ?? [];
    return {
      id: w.id,
      performed_on: w.performed_on,
      category: w.category,
      note: w.note,
      exerciseCount: exercises.length,
      setCount: exercises.reduce((total, we) => total + (we.sets?.length ?? 0), 0),
    };
  });
}

/** Number of workouts performed on or after `sinceDate` ("YYYY-MM-DD"). */
export async function countWorkoutsSince(sinceDate: string): Promise<number> {
  const supabase = await createServerSupabase();

  const { count, error } = await supabase
    .from("workouts")
    .select("id", { count: "exact", head: true })
    .gte("performed_on", sinceDate);

  if (error) {
    console.error("countWorkoutsSince: failed to count workouts", { sinceDate }, error);
    return 0;
  }
  return count ?? 0;
}
