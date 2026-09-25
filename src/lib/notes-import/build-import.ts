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

  // Interpolate over every workout that carries real content — a date,
  // notes, a category, or exercises — not just the ones we'll keep. A dated
  // but set-less workout (dropped below) still anchors the estimate for its
  // undated neighbours; excluding it here would silently interpolate from
  // the wrong, more distant anchor. Only a content-free undated block (e.g.
  // the empty block a leading separator produces) is left out entirely.
  const real = log.workouts
    .map((workout, index) => ({ workout, date: isoDates[index] }))
    .filter(
      ({ workout, date }) =>
        date !== null || workout.notes.length > 0 || workout.category !== null || workout.exercises.length > 0
    );

  const filled = fillMissingDates(real.map(({ date }) => date));
  const resolved = real.map(({ workout }, index) => ({ workout, ...filled[index] }));

  // Undated, set-less workouts in `resolved` (e.g. a category-only block)
  // get an estimate here too, but nobody reads it — they end up in `dropped`,
  // which only carries line + reason.
  const dropped = resolved
    .filter(({ workout }) => workout.exercises.length === 0)
    .map(({ workout }) => ({ line: workout.line, reason: "Workout ohne Sätze" }));

  const workouts: ImportWorkout[] = resolved
    .filter(({ workout }) => workout.exercises.length > 0)
    .map(({ workout, date, estimated }) => {
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
