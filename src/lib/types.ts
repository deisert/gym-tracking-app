/** A logged set. `weight_kg` is always a number here — PostgREST may hand
 *  back `numeric` columns as strings, so the data layer converts on the way in.
 *  `reps` counts clean reps only; `unclean_reps` are extra, sloppy ones. */
export type SetRecord = {
  id: string;
  position: number;
  weight_kg: number;
  reps: number;
  is_warmup: boolean;
  unclean_reps: number;
  is_dropset: boolean;
};

/** The most recent session of one exercise, used for ghost values. */
export type LastPerformance = {
  workoutId: string;
  performedOn: string; // "YYYY-MM-DD"
  sets: SetRecord[];
} | null;

export type ExerciseOption = {
  id: string;
  name: string;
  note: string | null;
};

export type WorkoutSummary = {
  id: string;
  performed_on: string;
  category: string | null;
  note: string | null;
  exerciseCount: number;
  setCount: number;
};

export type WorkoutExerciseDetail = {
  id: string;
  position: number;
  note: string | null;
  exercise: { id: string; name: string };
  sets: SetRecord[];
};

export type WorkoutDetail = {
  id: string;
  performed_on: string;
  category: string | null;
  note: string | null;
  exercises: WorkoutExerciseDetail[];
};

/** One Monday-start week from `v_weekly_stats`. Weeks without a trained workout have no row. */
export type WeekStat = {
  weekStart: string; // "YYYY-MM-DD", always a Monday
  workoutCount: number;
  setCount: number;
  volumeKg: number;
};

/** One calendar day with every workout on it summed — the heatmap's unit. */
export type DayStat = {
  date: string; // "YYYY-MM-DD"
  setCount: number;
  volumeKg: number;
};

export type RecordKind = "weight" | "e1rm" | "reps";

/** One row of `exercise_records()`: the newest record of one kind for one exercise. */
export type ExerciseRecord = {
  exerciseId: string;
  exerciseName: string;
  kind: RecordKind;
  performedOn: string;
  weightKg: number;
  reps: number;
  e1rmKg: number;
};

/** One row of `top_exercises()`: sessions in the window, best set of all time. */
export type TopExercise = {
  exerciseId: string;
  exerciseName: string;
  sessionCount: number;
  best: { weightKg: number; reps: number; performedOn: string };
};

/**
 * Everything the dashboard reads. `null` means that block's query FAILED —
 * which the page must not render as "no data".
 */
export type DashboardData = {
  weeks: WeekStat[] | null; // all time, oldest first
  days: DayStat[] | null; // one row per workout inside the heatmap window
  records: ExerciseRecord[] | null;
  exercises: TopExercise[] | null;
};
