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

// A dated but set-less workout (dropped) must still anchor date interpolation
// for its undated neighbours, and a category-only, set-less workout must not
// vanish from `dropped`.
const ANCHOR_LOG = [
  "01.09",
  "Row machine",
  "50/10",
  "———",
  "03.09",
  "———",
  "Squat",
  "60/8",
  "———",
  "30.09",
  "Row machine",
  "55/8",
  "———",
  "Upper Body",
  "———",
  "05.10",
  "Squat",
  "60/8",
].join("\n");

describe("buildImport - anchors on every dated workout", () => {
  const result = buildImport(parseLog(ANCHOR_LOG, []), { startYear: 2024 });

  it("interpolates an undated workout between its real dated neighbours, including a set-less one", () => {
    // Neighbours are 03.09 (dropped, set-less) and 30.09. Even spreading
    // between them lands on 2024-09-17 — not 2024-09-16, which is what you get
    // if the set-less 03.09 workout is dropped from the anchor list first and
    // 01.09 is used as the near anchor instead.
    const undated = result.workouts.find((w) => w.line === 7);
    expect(undated?.performedOn).toBe("2024-09-17");
    expect(undated?.dateEstimated).toBe(true);
  });

  it("keeps a category-only, set-less workout in dropped", () => {
    expect(result.dropped).toContainEqual({ line: 14, reason: "Workout ohne Sätze" });
  });
});

// A notes-only or category-only block with NO date must never enter the
// interpolation list itself — only a dated or exercise-bearing workout can.
// Otherwise a leading or trailing one has no dated neighbour on one side and
// fillMissingDates throws, even though the old (pre-round-1) importer parsed
// these logs fine.
describe("buildImport - remark-only blocks never anchor interpolation", () => {
  it("imports a leading, undated remark before any date without throwing", () => {
    const LEADING_REMARK_LOG = [
      "Some remark before any date",
      "———",
      "17.09",
      "Row machine",
      "60/10",
    ].join("\n");

    let result: ReturnType<typeof buildImport> | undefined;
    expect(() => {
      result = buildImport(parseLog(LEADING_REMARK_LOG, []), { startYear: 2024 });
    }).not.toThrow();

    expect(result?.workouts).toHaveLength(1);
    expect(result?.workouts[0].performedOn).toBe("2024-09-17");
    expect(result?.dropped).toContainEqual({ line: 1, reason: "Workout ohne Sätze" });
  });

  it("imports a trailing, undated remark after the last workout without throwing", () => {
    const TRAILING_REMARK_LOG = [
      "17.09",
      "Row machine",
      "60/10",
      "———",
      "Some trailing remark",
    ].join("\n");

    let result: ReturnType<typeof buildImport> | undefined;
    expect(() => {
      result = buildImport(parseLog(TRAILING_REMARK_LOG, []), { startYear: 2024 });
    }).not.toThrow();

    expect(result?.workouts).toHaveLength(1);
    expect(result?.workouts[0].performedOn).toBe("2024-09-17");
    expect(result?.dropped).toContainEqual({ line: 5, reason: "Workout ohne Sätze" });
  });
});
