import { formatWeight } from "./sets";
import type { RecordKind } from "./types";

/**
 * Best marks of one exercise over every EARLIER session, working sets only.
 * `null` = no earlier session, so nothing can be a record yet.
 * `maxRepsAtWeight` is keyed by `String(weight_kg)`, which keeps it JSON-safe
 * for the server → client hand-off.
 */
export type RecordBaseline = {
  maxWeightKg: number;
  maxE1rmKg: number;
  maxRepsAtWeight: Record<string, number>;
} | null;

type SetInput = { weight_kg: number; reps: number; is_warmup: boolean };

/** `previous` is kg for weight / e1rm and a rep count for reps. */
export type RecordHit = { kind: RecordKind; previous: number };

/** Epley, rounded like `v_working_sets.e1rm_kg`. */
export function e1rm(weightKg: number, reps: number): number {
  return Math.round(weightKg * (1 + reps / 30) * 10) / 10;
}

/**
 * Which sets of THIS session beat the baseline — same rules as the SQL
 * `exercise_records()`: working sets only, strictly greater, a reps record
 * needs an earlier session at exactly that weight.
 *
 * A climb (80 → 82,5 → 85) is celebrated once per kind, on its best set, so
 * the result is one hit list per input set, index-aligned.
 */
export function detectSessionRecords(baseline: RecordBaseline, sets: SetInput[]): RecordHit[][] {
  const hits: RecordHit[][] = sets.map(() => []);
  if (!baseline) return hits;

  const bestIndex = (
    candidates: number[],
    score: (set: SetInput) => number
  ): number | null =>
    candidates.reduce<number | null>(
      (best, index) =>
        best === null || score(sets[index]) > score(sets[best]) ? index : best,
      null
    );

  const working = sets.flatMap((set, index) => (set.is_warmup ? [] : [index]));

  const heaviest = bestIndex(
    working.filter((i) => sets[i].weight_kg > baseline.maxWeightKg),
    (set) => set.weight_kg * 1000 + set.reps
  );
  if (heaviest !== null) hits[heaviest].push({ kind: "weight", previous: baseline.maxWeightKg });

  const strongest = bestIndex(
    working.filter((i) => e1rm(sets[i].weight_kg, sets[i].reps) > baseline.maxE1rmKg),
    (set) => e1rm(set.weight_kg, set.reps)
  );
  if (strongest !== null) hits[strongest].push({ kind: "e1rm", previous: baseline.maxE1rmKg });

  // One reps record per weight: the set with the most reps at that weight.
  const byWeight = new Map<number, number>();
  for (const i of working) {
    const before = baseline.maxRepsAtWeight[String(sets[i].weight_kg)];
    if (before === undefined || sets[i].reps <= before) continue;
    const held = byWeight.get(sets[i].weight_kg);
    if (held === undefined || sets[i].reps > sets[held].reps) byWeight.set(sets[i].weight_kg, i);
  }
  for (const i of byWeight.values()) {
    hits[i].push({
      kind: "reps",
      previous: baseline.maxRepsAtWeight[String(sets[i].weight_kg)],
    });
  }

  return hits;
}

/** "Neuer Rekord · Gewicht 85 kg (vorher 80) · e1RM 107,7 kg (vorher 101,3)" */
export function formatRecordHits(hits: RecordHit[], set: Pick<SetInput, "weight_kg" | "reps">): string {
  const parts = hits.map((hit) => {
    switch (hit.kind) {
      case "weight":
        return `Gewicht ${formatWeight(set.weight_kg)} kg (vorher ${formatWeight(hit.previous)})`;
      case "e1rm":
        return `e1RM ${formatWeight(e1rm(set.weight_kg, set.reps))} kg (vorher ${formatWeight(hit.previous)})`;
      case "reps":
        return `${set.reps} Wdh. bei ${formatWeight(set.weight_kg)} kg (vorher ${hit.previous})`;
    }
  });
  return ["Neuer Rekord", ...parts].join(" · ");
}
