import { describe, expect, it } from "vitest";

import { formatLift, pickRecords, recordLabel } from "@/lib/records";
import type { ExerciseRecord, RecordKind } from "@/lib/types";

function record(
  exerciseId: string,
  exerciseName: string,
  kind: RecordKind,
  performedOn: string,
  weightKg = 80,
  reps = 5,
  e1rmKg = 93.3
): ExerciseRecord {
  return { exerciseId, exerciseName, kind, performedOn, weightKg, reps, e1rmKg };
}

describe("pickRecords", () => {
  it("keeps one line per exercise: the newest record", () => {
    const picked = pickRecords([
      record("a", "Bankdrücken", "weight", "2026-09-10"),
      record("a", "Bankdrücken", "reps", "2026-09-20"),
    ]);
    expect(picked).toEqual([record("a", "Bankdrücken", "reps", "2026-09-20")]);
  });

  it("prefers the strongest claim when one session set several: Gewicht, e1RM, Wiederholungen", () => {
    const picked = pickRecords([
      record("a", "Bankdrücken", "reps", "2026-09-20"),
      record("a", "Bankdrücken", "e1rm", "2026-09-20"),
    ]);
    expect(picked.map((r) => r.kind)).toEqual(["e1rm"]);

    const withWeight = pickRecords([
      record("a", "Bankdrücken", "e1rm", "2026-09-20"),
      record("a", "Bankdrücken", "weight", "2026-09-20"),
    ]);
    expect(withWeight.map((r) => r.kind)).toEqual(["weight"]);
  });

  it("orders newest first, then by name", () => {
    const picked = pickRecords([
      record("b", "Klimmzüge", "reps", "2026-09-10"),
      record("c", "Kniebeuge", "weight", "2026-09-20"),
      record("a", "Bankdrücken", "weight", "2026-09-20"),
    ]);
    expect(picked.map((r) => r.exerciseName)).toEqual(["Bankdrücken", "Kniebeuge", "Klimmzüge"]);
  });

  it("returns nothing for nothing", () => {
    expect(pickRecords([])).toEqual([]);
  });
});

describe("formatLift", () => {
  it("writes weight × reps with the German comma", () => {
    expect(formatLift(85, 5)).toBe("85 kg × 5");
    expect(formatLift(82.5, 8)).toBe("82,5 kg × 8");
  });

  it("writes bodyweight as reps only — '0 kg × 12' reads like an error", () => {
    expect(formatLift(0, 12)).toBe("12 Wdh.");
  });
});

describe("recordLabel", () => {
  it("names each kind", () => {
    expect(recordLabel(record("a", "Bankdrücken", "weight", "2026-09-20"))).toBe("bester Satz");
    expect(recordLabel(record("a", "Kreuzheben", "e1rm", "2026-09-20", 140, 3, 153.6))).toBe(
      "bester e1RM 154 kg"
    );
    expect(recordLabel(record("a", "Klimmzüge", "reps", "2026-09-20", 0, 12, 0))).toBe("meiste Wdh.");
  });
});
