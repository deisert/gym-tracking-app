import { assignYears, fillMissingDates } from "./dates";
import { resolveExercise } from "./exercise-map";
import type { ImportExercise, ImportResult, ImportWorkout, ParsedLog, RawExercise } from "./types";

export function buildExercise(raw: RawExercise, performedOn: string): ImportExercise {
  const maxWritten = Math.max(...raw.sets.map((set) => set.weightKg));
  const perSideNoted = raw.sets.some((set) => set.perSide);
  // "85/12 42.5 each side": one set named the per-side weight explicitly.
  const explicitPerSide = raw.sets.some((set) => set.perSideWeightKg !== null);
  const resolved = resolveExercise({
    header: raw.header,
    details: raw.details,
    maxWeightKg: maxWritten,
    performedOn,
    perSideNoted,
  });
  if (!resolved) throw new Error(`No exercise rule for "${raw.header}" (line ${raw.line})`);

  // Weights are stored exactly as written — no halving or conversion (owner decision 2026-09-25).
  const sets = raw.sets.map((set) => ({
    weightKg: set.weightKg,
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
  // Only note "per side" when a set said "each side" AND none named an explicit per-side
  // number — an explicit number already makes it clear, and the weight isn't converted anyway.
  if (perSideNoted && !explicitPerSide) parts.push("Gewicht pro Seite");

  return {
    line: raw.line,
    rawHeader: raw.header,
    name: resolved.name,
    attributes: resolved.attributes,
    note: parts.length > 0 ? parts.join(" · ") : null,
    sets,
  };
}

export function buildImport(log: ParsedLog, options: { startYear: number }): ImportResult {
  // Years come from ALL dated blocks in file order, dropped ones included —
  // a set-less session still marks where the new year began.
  const isoDates = assignYears(log.workouts.map((workout) => workout.date), options.startYear);

  // Interpolate only over workouts that can actually anchor a date: dated
  // ones, and undated ones that carry exercises (which need an estimate). A
  // dated but set-less workout (dropped below) still anchors the estimate
  // for its undated neighbours; excluding it here would silently interpolate
  // from the wrong, more distant anchor (round 1). But an undated,
  // content-only block (just notes or a category, no exercises) must NOT
  // enter this list itself — unlike a set-less workout it has no date of its
  // own to contribute, so a leading or trailing one would have no dated
  // neighbour on one side and fillMissingDates would throw, even though the
  // old importer parsed logs like that fine.
  const anchored = log.workouts
    .map((workout, index) => ({ workout, date: isoDates[index] }))
    .filter(({ workout, date }) => date !== null || workout.exercises.length > 0);

  const filled = fillMissingDates(anchored.map(({ date }) => date));
  const resolved = anchored.map(({ workout }, index) => ({ workout, ...filled[index] }));

  // `dropped` is computed separately over ALL workouts (not just `anchored`)
  // so a content-only block — dated or not — is still reported, even though
  // an undated one never entered interpolation above.
  const dropped = log.workouts
    .filter(
      (workout) =>
        workout.exercises.length === 0 &&
        (workout.date !== null || workout.notes.length > 0 || workout.category !== null)
    )
    .map((workout) => ({ line: workout.line, reason: "Workout ohne Sätze" }));

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
