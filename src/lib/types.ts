/** A logged set. `weight_kg` is always a number here — PostgREST may hand
 *  back `numeric` columns as strings, so the data layer converts on the way in. */
export type SetRecord = {
  id: string;
  position: number;
  weight_kg: number;
  reps: number;
  is_warmup: boolean;
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
