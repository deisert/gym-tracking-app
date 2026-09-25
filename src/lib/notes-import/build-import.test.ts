import { describe, expect, it } from "vitest";
import { buildImport } from "@/lib/notes-import/build-import";
import { parseLog } from "@/lib/notes-import/parse-log";

const LOG = [
  "17.09",
  "Incline machine",
  "60/10 (30 each)",
  "60/9",
  "",
  "Incline bench machine",
  "60/12",
  "50/8",
  "———",
  "Row machine",
  "80/10 _3 slow",
  "42.5/8 L",
  "———",
  "21.09",
  "Butterfly",
  "75/10 dropset",
  "———",
  "25.09",
  "Mit Zoffi",
].join("\n");

describe("buildImport", () => {
  const result = buildImport(parseLog(LOG, []), { startYear: 2024 });

  it("dates every workout, estimating the undated one", () => {
    expect(result.workouts.map((w) => [w.performedOn, w.dateEstimated, w.note])).toEqual([
      ["2024-09-17", false, null],
      ["2024-09-19", true, "Datum geschätzt"],
      ["2024-09-21", false, null],
    ]);
  });

  it("drops a workout without sets", () => {
    expect(result.dropped).toEqual([{ line: 18, reason: "Workout ohne Sätze" }]);
  });

  it("converts written totals to per-side weights", () => {
    const [named, assumed] = result.workouts[0].exercises;
    expect(named).toMatchObject({ name: "Incline bench machine", flags: ["umgerechnet"] });
    expect(named.sets.map((s) => s.weightKg)).toEqual([30, 30]);
    expect(named.note).toContain("Gesamtgewicht auf pro Seite umgerechnet");
    expect(assumed).toMatchObject({ flags: ["halbiert"] });
    expect(assumed.sets.map((s) => s.weightKg)).toEqual([30, 25]);
  });

  it("carries unclean reps, annotations and sides into sets and notes", () => {
    const row = result.workouts[1].exercises[0];
    expect(row.name).toBe("Row machine");
    expect(row.sets[0]).toEqual({ weightKg: 80, reps: 10, uncleanReps: 3, isWarmup: false, isDropset: false });
    expect(row.note).toBe("S1: slow · Sätze einzeln L/R");
  });

  it("keeps dropsets", () => {
    expect(result.workouts[2].exercises[0].sets[0].isDropset).toBe(true);
  });
});
