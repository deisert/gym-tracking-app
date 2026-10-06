import "server-only";

import { heatmapStart } from "@/lib/dashboard-heatmap";
import { addDays } from "@/lib/dates";
import { RECORDS_WINDOW_DAYS } from "@/lib/records";
import { createServerSupabase } from "@/lib/supabase/server";
import type {
  DashboardData,
  DayStat,
  ExerciseRecord,
  RecordKind,
  TopExercise,
  WeekStat,
} from "@/lib/types";

/** „Deine Übungen“ shows this many (spec §10.6). */
export const TOP_EXERCISE_COUNT = 5;

/** PostgREST may hand `numeric` and `bigint` back as strings. */
type Num = number | string;

type RawWeek = { week_start: string; workout_count: Num; set_count: Num; volume_kg: Num };
type RawWorkoutStat = { performed_on: string; set_count: Num; volume_kg: Num };
type RawRecord = {
  exercise_id: string;
  exercise_name: string;
  kind: RecordKind;
  performed_on: string;
  weight_kg: Num;
  reps: number;
  e1rm_kg: Num;
};
type RawTopExercise = {
  exercise_id: string;
  exercise_name: string;
  session_count: Num;
  best_weight_kg: Num;
  best_reps: number;
  best_performed_on: string;
};

/**
 * Everything the dashboard shows, in four parallel queries — all aggregated in
 * Postgres (spec §7), all filtered to the caller by RLS through the
 * invoker-rights views.
 *
 * Each block degrades on its own: a failed query yields `null` for that block
 * and the rest of the page still renders. One broken block must never blank
 * the tab.
 */
export async function getDashboardData(today: string): Promise<DashboardData> {
  const supabase = await createServerSupabase();
  const windowStart = heatmapStart(today);
  const recordsSince = addDays(today, -(RECORDS_WINDOW_DAYS - 1));

  const [weeksResult, daysResult, recordsResult, exercisesResult] = await Promise.all([
    supabase
      .from("v_weekly_stats")
      .select("week_start, workout_count, set_count, volume_kg")
      .order("week_start"),
    supabase
      .from("v_workout_stats")
      .select("performed_on, set_count, volume_kg")
      .gte("performed_on", windowStart)
      .lte("performed_on", today),
    supabase.rpc("exercise_records", { p_since: recordsSince }),
    supabase.rpc("top_exercises", { p_since: windowStart, p_limit: TOP_EXERCISE_COUNT }),
  ]);

  if (weeksResult.error) {
    console.error("getDashboardData: failed to load weekly stats", weeksResult.error);
  }
  if (daysResult.error) {
    console.error("getDashboardData: failed to load workout stats", { windowStart }, daysResult.error);
  }
  if (recordsResult.error) {
    console.error("getDashboardData: failed to load records", { recordsSince }, recordsResult.error);
  }
  if (exercisesResult.error) {
    console.error("getDashboardData: failed to load top exercises", { windowStart }, exercisesResult.error);
  }

  const weeks: WeekStat[] | null = weeksResult.error
    ? null
    : ((weeksResult.data ?? []) as unknown as RawWeek[]).map((w) => ({
        weekStart: w.week_start,
        workoutCount: Number(w.workout_count),
        setCount: Number(w.set_count),
        volumeKg: Number(w.volume_kg),
      }));

  const days: DayStat[] | null = daysResult.error
    ? null
    : ((daysResult.data ?? []) as unknown as RawWorkoutStat[]).map((d) => ({
        date: d.performed_on,
        setCount: Number(d.set_count),
        volumeKg: Number(d.volume_kg),
      }));

  const records: ExerciseRecord[] | null = recordsResult.error
    ? null
    : ((recordsResult.data ?? []) as unknown as RawRecord[]).map((r) => ({
        exerciseId: r.exercise_id,
        exerciseName: r.exercise_name,
        kind: r.kind,
        performedOn: r.performed_on,
        weightKg: Number(r.weight_kg),
        reps: r.reps,
        e1rmKg: Number(r.e1rm_kg),
      }));

  const exercises: TopExercise[] | null = exercisesResult.error
    ? null
    : ((exercisesResult.data ?? []) as unknown as RawTopExercise[]).map((e) => ({
        exerciseId: e.exercise_id,
        exerciseName: e.exercise_name,
        sessionCount: Number(e.session_count),
        best: {
          weightKg: Number(e.best_weight_kg),
          reps: e.best_reps,
          performedOn: e.best_performed_on,
        },
      }));

  return { weeks, days, records, exercises };
}
