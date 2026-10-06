import "server-only";

import { createServerSupabase } from "@/lib/supabase/server";
import type { ExerciseInfo, ExerciseOverviewRow, ExerciseSetRow } from "@/lib/types";

/** PostgREST may hand `numeric` and `bigint` back as strings. */
type Num = number | string;

type RawSetRow = {
  workout_id: string;
  performed_on: string;
  workout_created_at: string;
  category: string | null;
  workout_exercise_id: string;
  exercise_position: number;
  note: string | null;
  attributes: Record<string, string> | null;
  set_id: string;
  position: number;
  weight_kg: Num;
  reps: number;
  unclean_reps: number;
  is_warmup: boolean;
  is_dropset: boolean;
  volume_kg: Num;
  e1rm_kg: Num;
};

type RawOverview = {
  exercise_id: string;
  name: string;
  is_archived: boolean;
  session_count: Num;
  first_performed_on: string;
  last_performed_on: string;
};

/**
 * PostgREST caps a response at the project's max-rows (1000 by default). The
 * biggest exercise is a few hundred sets today, but two more years of bench
 * press is not — so read in pages, ordered on a unique key so no row is
 * skipped or repeated between them.
 */
const PAGE_SIZE = 1000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ExerciseDetailData = {
  exercise: ExerciseInfo;
  /** null = the query FAILED, which the page must not render as „noch nicht trainiert“. */
  sets: ExerciseSetRow[] | null;
};

/**
 * One exercise and every set ever logged for it (spec §7): two queries in
 * parallel, both filtered to the caller by RLS through the invoker-rights view.
 *
 * Returns null when the exercise does not exist for this user — RLS makes a
 * stranger's id and a missing one look the same, and a malformed id never
 * reaches Postgres.
 */
export async function getExerciseDetail(exerciseId: string): Promise<ExerciseDetailData | null> {
  if (!UUID.test(exerciseId)) return null;

  const supabase = await createServerSupabase();

  const loadSets = async (): Promise<ExerciseSetRow[] | null> => {
    const rows: RawSetRow[] = [];
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await supabase
        .from("v_exercise_sets")
        .select(
          `workout_id, performed_on, workout_created_at, category, workout_exercise_id,
           exercise_position, note, attributes, set_id, position, weight_kg, reps,
           unclean_reps, is_warmup, is_dropset, volume_kg, e1rm_kg`
        )
        .eq("exercise_id", exerciseId)
        .order("performed_on")
        .order("workout_created_at")
        .order("workout_id")
        .order("exercise_position")
        .order("workout_exercise_id")
        .order("position")
        .order("set_id")
        .range(from, from + PAGE_SIZE - 1);

      if (error) {
        console.error("getExerciseDetail: failed to load sets", { exerciseId, from }, error);
        return null;
      }
      rows.push(...((data ?? []) as unknown as RawSetRow[]));
      if (!data || data.length < PAGE_SIZE) break;
    }

    return rows.map((raw) => ({
      workoutId: raw.workout_id,
      performedOn: raw.performed_on,
      workoutCreatedAt: raw.workout_created_at,
      category: raw.category,
      workoutExerciseId: raw.workout_exercise_id,
      workoutExercisePosition: raw.exercise_position,
      note: raw.note,
      attributes: raw.attributes ?? {},
      set: {
        id: raw.set_id,
        position: raw.position,
        weight_kg: Number(raw.weight_kg),
        reps: raw.reps,
        is_warmup: raw.is_warmup,
        unclean_reps: raw.unclean_reps,
        is_dropset: raw.is_dropset,
      },
      volumeKg: Number(raw.volume_kg),
      e1rmKg: Number(raw.e1rm_kg),
    }));
  };

  const [exerciseResult, sets] = await Promise.all([
    supabase
      .from("exercises")
      .select("id, name, note, is_archived")
      .eq("id", exerciseId)
      .maybeSingle(),
    loadSets(),
  ]);

  if (exerciseResult.error) {
    console.error("getExerciseDetail: failed to load exercise", { exerciseId }, exerciseResult.error);
  }
  if (exerciseResult.error || !exerciseResult.data) return null;

  const raw = exerciseResult.data as { id: string; name: string; note: string | null; is_archived: boolean };
  return {
    exercise: { id: raw.id, name: raw.name, note: raw.note, isArchived: raw.is_archived },
    sets,
  };
}

/**
 * „Alle Übungen“: every exercise with a working set, most recently trained
 * first. Null when the query failed.
 */
export async function getExerciseOverview(): Promise<ExerciseOverviewRow[] | null> {
  const supabase = await createServerSupabase();

  const { data, error } = await supabase
    .from("v_exercise_overview")
    .select("exercise_id, name, is_archived, session_count, first_performed_on, last_performed_on")
    .order("last_performed_on", { ascending: false })
    .order("name");

  if (error) {
    console.error("getExerciseOverview: failed to load exercises", error);
    return null;
  }

  return ((data ?? []) as unknown as RawOverview[]).map((raw) => ({
    exerciseId: raw.exercise_id,
    name: raw.name,
    isArchived: raw.is_archived,
    sessionCount: Number(raw.session_count),
    firstPerformedOn: raw.first_performed_on,
    lastPerformedOn: raw.last_performed_on,
  }));
}
