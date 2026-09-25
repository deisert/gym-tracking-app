// Types shared by the notes-file import (spec: docs/superpowers/specs/2026-09-24-notes-import-design.md).
// "Raw" = as written in the log; "Import" = what is inserted into the database.

export type Side = "L" | "R";

export type DayMonth = { day: number; month: number; year: number | null };

/** One set line, before exercise-level rules (per-side, halving) apply. */
export type RawSet = {
  line: number;
  weightKg: number;
  /** "85/12 42.5 each side" → 42.5: the line named the per-side weight itself. */
  perSideWeightKg: number | null;
  /** The line said "each side" / "each". */
  perSide: boolean;
  reps: number;
  uncleanReps: number;
  isWarmup: boolean;
  isDropset: boolean;
  side: Side | null;
  /** Leftover text ("90%", "slow") — becomes part of the exercise note. */
  annotation: string | null;
};

export type RawExercise = {
  line: number;
  header: string;
  /** Text lines that belong to the exercise but are not sets ("No straps", "Top grip"). */
  details: string[];
  sets: RawSet[];
};

export type RawWorkout = {
  line: number;
  date: DayMonth | null;
  notes: string[];
  category: string | null;
  exercises: RawExercise[];
};

/** What happened to one line of the log. Every line gets at least one. */
export type LineFate =
  | {
      line: number;
      kind:
        | "blank"
        | "separator"
        | "date"
        | "workout-note"
        | "category"
        | "cardio"
        | "header"
        | "exercise-note"
        | "set";
    }
  | { line: number; kind: "dropped"; reason: string }
  | { line: number; kind: "unclassified"; text: string };

export type ParsedLog = { workouts: RawWorkout[]; fates: LineFate[] };

export type ImportSet = {
  weightKg: number;
  reps: number;
  uncleanReps: number;
  isWarmup: boolean;
  isDropset: boolean;
};

export type ImportExercise = {
  line: number;
  rawHeader: string;
  name: string;
  attributes: Record<string, string>;
  note: string | null;
  /** Review markers for the preview: "halbiert", "umgerechnet". */
  flags: string[];
  sets: ImportSet[];
};

export type ImportWorkout = {
  line: number;
  performedOn: string; // "YYYY-MM-DD"
  dateEstimated: boolean;
  category: string | null;
  note: string | null;
  exercises: ImportExercise[];
};

export type ImportResult = {
  workouts: ImportWorkout[];
  /** Whole workouts that were left out, with the reason. */
  dropped: { line: number; reason: string }[];
};
