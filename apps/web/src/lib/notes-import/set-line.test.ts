import { describe, expect, it } from "vitest";
import { parseBodyweightLine, parseSetLine } from "@/lib/notes-import/set-line";

const plain = {
  weightKg: 80,
  perSideWeightKg: null,
  perSide: false,
  reps: 10,
  uncleanReps: 0,
  isWarmup: false,
  isDropset: false,
  side: null,
  annotation: null,
};

function setOf(line: string) {
  const result = parseSetLine(line);
  if (result.kind !== "set") throw new Error(`${line} did not parse as a set: ${result.kind}`);
  return result.set;
}

describe("parseSetLine", () => {
  it("reads weight/reps", () => {
    expect(parseSetLine("80/10")).toEqual({ kind: "set", set: plain });
  });

  it("tolerates spaces around the slash", () => {
    expect(setOf("50 / 8")).toMatchObject({ weightKg: 50, reps: 8 });
  });

  it.each([
    ["20/10-12", 11],
    ["22/8-9", 8],
    ["40/8-10", 9],
  ])("takes the mean of range %s, rounded down", (line, reps) => {
    expect(setOf(line).reps).toBe(reps);
  });

  it.each([
    ["80/10 _3", 10, 3],
    ["42.5/7_3", 7, 3],
    ["45/4__4", 4, 4],
    ["77.5/12+2", 12, 2],
    ["20/10+5", 10, 5],
    ["40/7-3", 7, 3],
    ["82.5/11.5", 11, 1],
    ["82.5/11,5", 11, 1],
    ["45/12 3halbe", 12, 3],
    ["80/8 (3 -4 half)", 8, 3],
  ])("reads unclean reps in %s", (line, reps, unclean) => {
    const set = setOf(line);
    expect([set.reps, set.uncleanReps]).toEqual([reps, unclean]);
  });

  it.each(["40/5 dropset", "75/8 (dropset)", "75/7 drop", "25/10 drop set"])(
    "marks %s as a dropset",
    (line) => {
      expect(setOf(line)).toMatchObject({ isDropset: true, annotation: null });
    }
  );

  it("marks warm-ups but not 'no warmup'", () => {
    expect(setOf("55/8 warmup")).toMatchObject({ isWarmup: true, annotation: null });
    expect(setOf("50/6 slow (no warmup)")).toMatchObject({
      isWarmup: false,
      annotation: "slow no warmup",
    });
  });

  it.each([
    ["42.5/8 L", "L"],
    ["35/10R", "R"],
    ["5/10l", "L"],
    ["4.2/11 R", "R"],
  ])("reads the side of %s", (line, side) => {
    expect(setOf(line)).toMatchObject({ side, annotation: null });
  });

  it("reads per-side notes", () => {
    expect(setOf("40/12 each side")).toMatchObject({ perSide: true, perSideWeightKg: null, annotation: null });
    expect(setOf("85/12 42.5 each side")).toMatchObject({ weightKg: 85, perSideWeightKg: 42.5 });
    expect(setOf("60/10 (30 each)")).toMatchObject({ perSideWeightKg: 30, annotation: null });
    expect(setOf("40/12_3 (each side)")).toMatchObject({ uncleanReps: 3, perSide: true, annotation: null });
  });

  it("keeps other text as the annotation", () => {
    expect(setOf("22/12 90%").annotation).toBe("90%");
    expect(setOf("142.5/8 (70-80%)")).toMatchObject({ reps: 8, annotation: "70-80%" });
    expect(setOf("75/9 80-90%")).toMatchObject({ reps: 9, annotation: "80-90%" });
  });

  it("normalises separators and sums", () => {
    expect(setOf("40//10")).toMatchObject({ weightKg: 40, reps: 10 });
    expect(setOf("22.5:8")).toMatchObject({ weightKg: 22.5, reps: 8 });
    expect(setOf("25+15+10/8-10 each side")).toMatchObject({ weightKg: 50, reps: 9, perSide: true });
  });

  it("ignores question marks after known reps", () => {
    expect(setOf("70/12?").reps).toBe(12);
    expect(setOf("110/3 ????").reps).toBe(3);
  });

  it.each(["20/?", "22/", "85/???", "28.25/ ?", "80/ underhand"])(
    "reports unknown reps for %s",
    (line) => {
      expect(parseSetLine(line).kind).toBe("unknown-reps");
    }
  );

  it("reports bare numbers", () => {
    expect(parseSetLine("60")).toEqual({ kind: "bare", value: 60 });
    expect(parseSetLine("22.5")).toEqual({ kind: "bare", value: 22.5 });
  });

  it.each(["Row machine", "3 absetzen", "1 1/2 Wochen Pause"])("does not read %s", (line) => {
    expect(parseSetLine(line).kind).toBe("none");
  });
});

describe("parseBodyweightLine", () => {
  function bw(line: string) {
    const result = parseBodyweightLine(line);
    return result.kind === "set" ? [result.set.weightKg, result.set.reps, result.set.uncleanReps] : result.kind;
  }

  it.each([
    ["12", [0, 12, 0]],
    ["7_4", [0, 7, 4]],
    ["6_6", [0, 6, 6]],
    ["10 straight leg", [0, 10, 0]],
    ["11 straight", [0, 11, 0]],
    ["6 straight 4", [0, 6, 4]],
    ["7 straight 4 bent", [0, 7, 4]],
    ["Straight 12", [0, 12, 0]],
  ])("%s", (line, expected) => {
    expect(bw(line)).toEqual(expected);
  });

  it.each(["?_3", "Straight / bent", "Straight", "Bent"])("%s has unknown reps", (line) => {
    expect(bw(line)).toBe("unknown-reps");
  });

  it("leaves other lines alone", () => {
    expect(bw("Leg raises")).toBe("none");
  });
});
