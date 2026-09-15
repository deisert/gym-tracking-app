import "server-only";

import { sortByRecency } from "@/lib/exercise-search";
import type { ExercisePickerOption } from "@/lib/exercise-search";
import type { LastPerformance, SetRecord } from "@/lib/types";
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

type RawExercise = {
  id: string;
  name: string;
  note: string | null;
  last_picked_at: string | null;
};

/**
 * The whole non-archived exercise library, recently used first.
 *
 * Returned in full rather than filtered by a search term: the picker holds this
 * as a prop and narrows it in the browser, so typing costs no request at all.
 * That is affordable because the library is one user's few dozen exercises —
 * and because the ordering no longer needs a second query. `last_picked_at` is
 * maintained by a trigger (see the 20260909000001 migration), replacing the
 * 200-row `workout_exercises` scan this function used to run on every keystroke
 * *and* on every saved set, since `addSet` revalidates the workout route.
 *
 * Revisit if the library ever grows past a few hundred exercises: at that point
 * shipping all of them to the client stops being cheaper than searching them.
 */
export async function listExercises(): Promise<ExercisePickerOption[]> {
  const supabase = await createServerSupabase();

  const { data, error } = await supabase
    .from("exercises")
    .select("id, name, note, last_picked_at")
    .eq("is_archived", false);

  if (error) {
    console.error("listExercises: failed to load exercises", error);
  }
  if (error || !data) return [];

  return sortByRecency(
    (data as RawExercise[]).map((raw) => ({
      id: raw.id,
      name: raw.name,
      note: raw.note,
      lastPickedAt: raw.last_picked_at,
    }))
  );
}

/**
 * How far back a ghost value may reach.
 *
 * The floor exists because `addSet`/`updateSet` revalidate the workout route,
 * so this query re-runs on every set save. Without a lower bound it pulls the
 * user's entire history for these exercises — every `workout_exercises` row
 * with all its sets — and serialises it into each save response over gym
 * cellular. An exercise untouched for six months simply gets no ghost, which
 * is the right answer anyway: those numbers are no longer a useful target.
 */
const GHOST_LOOKBACK_DAYS = 180;

/**
 * `beforeDate` ("YYYY-MM-DD") minus `GHOST_LOOKBACK_DAYS`, as "YYYY-MM-DD".
 *
 * Arithmetic runs in UTC via `Date.UTC` so the server's timezone can never
 * shift the boundary by a day. Returns null for an unparseable input, in which
 * case the caller simply omits the floor rather than guessing a date.
 */
function ghostFloorDate(beforeDate: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(beforeDate);
  if (!match) return null;

  const [, year, month, day] = match;
  const ms = Date.UTC(Number(year), Number(month) - 1, Number(day));
  if (!Number.isFinite(ms)) return null;

  return new Date(ms - GHOST_LOOKBACK_DAYS * 86_400_000).toISOString().slice(0, 10);
}

/**
 * The last session of each requested exercise, for ghost values.
 *
 * "Last" means: the newest workout by `performed_on` that is not later than
 * `beforeDate`, not older than `GHOST_LOOKBACK_DAYS` before it, and is not
 * `excludeWorkoutId` — so a backdated workout never shows numbers from the
 * future.
 */
export async function getLastPerformances(
  exerciseIds: string[],
  beforeDate: string,
  excludeWorkoutId: string
): Promise<Map<string, LastPerformance>> {
  const result = new Map<string, LastPerformance>();
  if (exerciseIds.length === 0) return result;

  const supabase = await createServerSupabase();

  let query = supabase
    .from("workout_exercises")
    .select(
      `id, exercise_id, workout_id,
       workouts!inner ( id, performed_on, created_at ),
       sets ( id, position, weight_kg, reps, is_warmup )`
    )
    .in("exercise_id", exerciseIds)
    .neq("workout_id", excludeWorkoutId)
    .lte("workouts.performed_on", beforeDate);

  const floor = ghostFloorDate(beforeDate);
  if (floor) query = query.gte("workouts.performed_on", floor);

  const { data, error } = await query;

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
    workouts: { id: string; performed_on: string; created_at?: string | null } | null;
    sets: RawSet[] | null;
  };

  /** `created_at` of the workout currently winning for each exercise. */
  const chosenCreatedAt = new Map<string, string | null>();

  // Pick the newest row per exercise in JS: the candidate set is one user's
  // history for a handful of exercises, so sorting here beats a window function.
  for (const row of data as unknown as Row[]) {
    if (!row.workouts) continue;
    if (!row.sets || row.sets.length === 0) continue; // an exercise with no sets is no comparison

    const current = result.get(row.exercise_id);
    if (current) {
      if (row.workouts.performed_on < current.performedOn) continue;

      if (row.workouts.performed_on === current.performedOn) {
        // Two workouts on the same day, or the same exercise twice inside one
        // past workout: without a tie-break whichever row PostgREST happened
        // to return first would win. The later-created workout is the later
        // session, so it wins. Equal or missing `created_at` keeps the
        // incumbent, i.e. the previous first-wins behaviour.
        const incoming = row.workouts.created_at ?? null;
        const chosen = chosenCreatedAt.get(row.exercise_id) ?? null;
        if (!incoming || !chosen || incoming <= chosen) continue;
      }
    }

    chosenCreatedAt.set(row.exercise_id, row.workouts.created_at ?? null);
    result.set(row.exercise_id, {
      workoutId: row.workouts.id,
      performedOn: row.workouts.performed_on,
      sets: row.sets.map(toSetRecord).sort((a, b) => a.position - b.position),
    });
  }

  return result;
}
