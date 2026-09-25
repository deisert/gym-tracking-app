import { describe, expect, it } from "vitest";

import { formatKilos, formatMovedWeight, formatVolume, summarizeWorkout } from "@/lib/workout-summary";
import type { SetRecord, WorkoutExerciseDetail } from "@/lib/types";

function set(position: number, weight_kg: number, reps: number, is_warmup = false): SetRecord {
  return { id: `s${position}`, position, weight_kg, reps, is_warmup, unclean_reps: 0, is_dropset: false };
}

function exercise(id: string, name: string, sets: SetRecord[]): WorkoutExerciseDetail {
  return {
    id,
    position: 0,
    note: null,
    exercise: { id: `e-${id}`, name },
    sets,
  };
}

describe("summarizeWorkout", () => {
  it("counts sets, warm-ups and exercises", () => {
    const summary = summarizeWorkout([
      exercise("we1", "Bankdrücken", [set(0, 60, 10, true), set(1, 80, 8), set(2, 80, 8)]),
      exercise("we2", "Rudern", [set(0, 70, 10)]),
    ]);

    expect(summary.setCount).toBe(4);
    expect(summary.warmupSetCount).toBe(1);
    expect(summary.workingSetCount).toBe(3);
    expect(summary.exerciseCount).toBe(2);
  });

  it("lists sets and moved weight per exercise in workout order", () => {
    const summary = summarizeWorkout([
      exercise("we1", "Bankdrücken", [set(0, 80, 8)]),
      exercise("we2", "Rudern", [set(0, 70, 10), set(1, 70, 10)]),
    ]);

    expect(summary.perExercise).toEqual([
      { id: "we1", name: "Bankdrücken", setCount: 1, volumeKg: 640 },
      { id: "we2", name: "Rudern", setCount: 2, volumeKg: 1400 },
    ]);
  });

  it("keeps the per-exercise volumes adding up to the total", () => {
    const summary = summarizeWorkout([
      exercise("we1", "Bankdrücken", [set(0, 82.5, 6)]),
      exercise("we2", "Rudern", [set(0, 22.5, 7), set(1, 22.5, 7)]),
    ]);

    const sum = summary.perExercise.reduce((total, entry) => total + entry.volumeKg, 0);
    expect(sum).toBe(summary.totalVolumeKg);
  });

  it("ignores exercises without a single logged set", () => {
    const summary = summarizeWorkout([
      exercise("we1", "Bankdrücken", [set(0, 80, 8)]),
      exercise("we2", "Rudern", []),
    ]);

    expect(summary.exerciseCount).toBe(1);
    expect(summary.perExercise).toHaveLength(1);
  });

  it("sums each set's weight × reps over all sets, warm-ups included", () => {
    const summary = summarizeWorkout([
      exercise("we1", "Bankdrücken", [set(0, 60, 10, true), set(1, 80, 8), set(2, 82.5, 6)]),
    ]);

    // 600 + 640 + 495
    expect(summary.totalVolumeKg).toBe(1735);
  });

  it("keeps a half-kilo sum exact instead of drifting", () => {
    const summary = summarizeWorkout([
      exercise("we1", "Kurzhantel", [set(0, 22.5, 7), set(1, 22.5, 7), set(2, 22.5, 7)]),
    ]);

    expect(summary.totalVolumeKg).toBe(472.5);
  });

  it("counts bodyweight sets without adding volume", () => {
    const summary = summarizeWorkout([exercise("we1", "Klimmzüge", [set(0, 0, 12)])]);

    expect(summary.setCount).toBe(1);
    expect(summary.totalVolumeKg).toBe(0);
    expect(summary.perExercise[0].volumeKg).toBe(0);
  });

  it("returns an empty summary for a workout with nothing logged", () => {
    expect(summarizeWorkout([])).toEqual({
      setCount: 0,
      workingSetCount: 0,
      warmupSetCount: 0,
      exerciseCount: 0,
      totalVolumeKg: 0,
      perExercise: [],
    });
  });
});

describe("formatKilos", () => {
  it("groups thousands the German way without a unit", () => {
    expect(formatKilos(4320)).toBe("4.320");
    expect(formatKilos(620)).toBe("620");
  });
});

describe("formatVolume", () => {
  it("groups thousands the German way and appends the unit", () => {
    expect(formatVolume(4320)).toBe("4.320 kg");
  });

  it("rounds to whole kilos", () => {
    expect(formatVolume(1735.5)).toBe("1.736 kg");
    expect(formatVolume(620)).toBe("620 kg");
  });

  it("formats an empty workout as zero", () => {
    expect(formatVolume(0)).toBe("0 kg");
  });
});

describe("formatMovedWeight", () => {
  it("stays in kilos below 10.000", () => {
    expect(formatMovedWeight(9999)).toBe("9.999 kg");
    expect(formatMovedWeight(0)).toBe("0 kg");
  });

  it("switches to tonnes with one decimal from 10.000", () => {
    expect(formatMovedWeight(10000)).toBe("10 t");
    expect(formatMovedWeight(12480)).toBe("12,5 t");
  });

  it("drops the decimal from 100 t", () => {
    expect(formatMovedWeight(214380)).toBe("214 t");
    expect(formatMovedWeight(1234567)).toBe("1.235 t");
  });
});
