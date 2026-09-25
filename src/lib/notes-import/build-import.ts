import { assignYears, fillMissingDates } from "./dates";
import { resolveExercise } from "./exercise-map";
import { roundKg } from "./weights";
import type { ImportExercise, ImportResult, ImportWorkout, ParsedLog, RawExercise } from "./types";

export function buildExercise(raw: RawExercise, performedOn: string): ImportExercise {
  const maxWritten = Math.max(...raw.sets.map((set) => set.weightKg));
  const perSideNoted = raw.sets.some((set) => set.perSide);
  const resolved = resolveExercise({
    header: raw.header,
    details: raw.details,
    maxWeightKg: maxWritten,
    performedOn,
    perSideNoted,
  });
  if (!resolved) throw new Error(`No exercise rule for "${raw.header}" (line ${raw.line})`);

  // "85/12 42.5 each side": this session's plain numbers are totals.
  const writtenAsTotals = raw.sets.some(
    (set) => set.perSideWeightKg !== null && Math.abs(set.weightKg - 2 * set.perSideWeightKg) < 0.01
  );
  // A per-side machine written far above its per-side range, with no note.
  const assumedTotals = !perSideNoted && resolved.halveAbove !== null && maxWritten >= resolved.halveAbove;
  const halve = writtenAsTotals || assumedTotals;

  const sets = raw.sets.map((set) => ({
    weightKg: set.perSideWeightKg ?? (halve ? roundKg(set.weightKg / 2) : set.weightKg),
    reps: set.reps,
    uncleanReps: set.uncleanReps,
    isWarmup: set.isWarmup,
    // The database forbids both flags; a warm-up wins.
    isDropset: set.isDropset && !set.isWarmup,
  }));

  const parts: string[] = [...raw.details];
  raw.sets.forEach((set, index) => {
    if (set.annotation) parts.push(`S${index + 1}: ${set.annotation}`);
  });
  if (raw.sets.some((set) => set.side !== null)) parts.push("Sätze einzeln L/R");
  if (perSideNoted || resolved.halveAbove !== null) parts.push("Gewicht pro Seite");

  const flags: string[] = [];
  if (writtenAsTotals) {
    parts.push("Gesamtgewicht auf pro Seite umgerechnet");
    flags.push("umgerechnet");
  } else if (assumedTotals) {
    parts.push("Gewicht halbiert (vermutlich Gesamtgewicht notiert)");
    flags.push("halbiert");
  }

  return {
    line: raw.line,
    rawHeader: raw.header,
    name: resolved.name,
    attributes: resolved.attributes,
    note: parts.length > 0 ? parts.join(" · ") : null,
    flags,
    sets,
  };
}

export function buildImport(log: ParsedLog, options: { startYear: number }): ImportResult {
  // Years come from ALL dated blocks in file order, dropped ones included —
  // a set-less session still marks where the new year began.
  const isoDates = assignYears(log.workouts.map((workout) => workout.date), options.startYear);
  const kept = log.workouts
    .map((workout, index) => ({ workout, date: isoDates[index] }))
    .filter(({ workout }) => workout.exercises.length > 0);
  const filled = fillMissingDates(kept.map(({ date }) => date));

  const dropped = log.workouts
    .filter((workout) => workout.exercises.length === 0 && (workout.date !== null || workout.notes.length > 0))
    .map((workout) => ({ line: workout.line, reason: "Workout ohne Sätze" }));

  const workouts: ImportWorkout[] = kept.map(({ workout }, index) => {
    const { date, estimated } = filled[index];
    const notes = [...workout.notes, ...(estimated ? ["Datum geschätzt"] : [])];
    return {
      line: workout.line,
      performedOn: date,
      dateEstimated: estimated,
      category: workout.category,
      note: notes.length > 0 ? notes.join(" · ") : null,
      exercises: workout.exercises.map((exercise) => buildExercise(exercise, date)),
    };
  });

  workouts.sort((a, b) => a.performedOn.localeCompare(b.performedOn) || a.line - b.line);
  return { workouts, dropped };
}
