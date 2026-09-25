import { describe, expect, it } from "vitest";
import { parseLog } from "@/lib/notes-import/parse-log";
import type { LineFate } from "@/lib/notes-import/types";

const LOG = [
  "", //                   1
  "05.04", //              2
  "Curls", //              3
  "45/12", //              4
  "", //                   5
  "————", //               6
  "After a break", //      7
  "17.09", //              8
  "Upper Body", //         9
  "", //                   10
  "Row machine", //        11
  "No straps", //          12
  "80/10 _3", //           13
  "80/?", //               14
  "Top grip", //           15
  "80/8", //               16
  "", //                   17
  "Incline bench", //      18
  "", //                   19
  "60/8", //               20
  "Laufband 25min", //     21
  "Leg raises", //         22
  "7 straight 4 bent", //  23
  "Straight / bent", //    24
  "", //                   25
  "Tri overhead pull", //  26
  "80", //                 27
  "———", //                28
  "19.09", //              29
  "3/10 tired", //         30
  "", //                   31
  "Butterfly", //          32
  "75/11", //              33
  "12 weird", //           34
].join("\n");

function fatesOf(fates: LineFate[], line: number) {
  return fates.filter((f) => f.line === line).map((f) => ("reason" in f ? `${f.kind}:${f.reason}` : f.kind));
}

describe("parseLog", () => {
  const { workouts, fates } = parseLog(LOG, []);

  it("splits workouts at separators and dates", () => {
    expect(workouts.map((w) => w.date)).toEqual([
      { day: 5, month: 4, year: null },
      { day: 17, month: 9, year: null },
      { day: 19, month: 9, year: null },
    ]);
  });

  it("collects workout notes and the category before the first exercise", () => {
    expect(workouts[1].notes).toEqual(["After a break", "Laufband 25min"]);
    expect(workouts[1].category).toBe("Upper");
    expect(workouts[2].notes).toEqual(["3/10 tired"]);
  });

  it("keeps text inside an exercise as details", () => {
    const row = workouts[1].exercises[0];
    expect(row.header).toBe("Row machine");
    expect(row.details).toEqual(["No straps", "Top grip"]);
    expect(row.sets.map((s) => [s.weightKg, s.reps, s.uncleanReps])).toEqual([
      [80, 10, 3],
      [80, 8, 0],
    ]);
  });

  it("joins a header separated from its sets by a blank line", () => {
    expect(workouts[1].exercises[1]).toMatchObject({ header: "Incline bench", sets: [{ weightKg: 60, reps: 8 }] });
  });

  it("parses bodyweight sets", () => {
    expect(workouts[1].exercises[2]).toMatchObject({
      header: "Leg raises",
      sets: [{ weightKg: 0, reps: 7, uncleanReps: 4 }],
    });
  });

  it("drops exercises without sets that follow real ones", () => {
    expect(workouts[1].exercises.map((e) => e.header)).toEqual(["Row machine", "Incline bench", "Leg raises"]);
    expect(fatesOf(fates, 26)).toEqual(["dropped:Übung ohne Sätze"]);
  });

  it("gives every line a fate", () => {
    const lines = new Set(fates.map((f) => f.line));
    for (let line = 1; line <= 34; line += 1) expect(lines.has(line), `line ${line}`).toBe(true);
    expect(fatesOf(fates, 14)).toEqual(["dropped:Wiederholungen unbekannt"]);
    expect(fatesOf(fates, 24)).toEqual(["dropped:Wiederholungen unbekannt"]);
    expect(fatesOf(fates, 27)).toEqual(["dropped:Wiederholungen unbekannt"]);
    expect(fatesOf(fates, 21)).toEqual(["cardio"]);
    expect(fatesOf(fates, 9)).toEqual(["category"]);
    expect(fatesOf(fates, 12)).toEqual(["exercise-note"]);
    expect(fatesOf(fates, 6)).toEqual(["separator"]);
    expect(fatesOf(fates, 8)).toEqual(["date"]);
  });

  it("flags digit lines inside an exercise it cannot read", () => {
    expect(fates.find((f) => f.line === 34)).toEqual({ line: 34, kind: "unclassified", text: "12 weird" });
  });
});

describe("parseLog overrides", () => {
  const text = ["05.04", "Curls", "408", "Rows", "80/8", "Butterfly", "70/8", "3 absetzen", "????"].join("\n");

  it("applies replacements, forced headers, notes and drops", () => {
    const { workouts, fates } = parseLog(text, [
      { line: 3, expect: "408", replace: ["40/8"] },
      { line: 6, expect: "Butterfly", replace: [{ header: "Butterfly" }] },
      { line: 8, expect: "3 absetzen", note: "3 Wdh. mit Absetzen" },
      { line: 9, expect: "????", drop: "unklar" },
    ]);
    expect(workouts[0].exercises.map((e) => [e.header, e.details, e.sets.length])).toEqual([
      ["Curls", ["Rows"], 2],
      ["Butterfly", ["3 Wdh. mit Absetzen"], 1],
    ]);
    expect(fatesOf(fates, 9)).toEqual(["dropped:unklar"]);
  });

  it("applies date overrides", () => {
    const { workouts } = parseLog(["28/07", "Curls", "45/10"].join("\n"), [
      { line: 1, expect: "28/07", date: "28.07" },
    ]);
    expect(workouts[0].date).toEqual({ day: 28, month: 7, year: null });
  });

  it("refuses an override whose text does not match", () => {
    expect(() => parseLog(text, [{ line: 3, expect: "409", replace: ["40/9"] }])).toThrow(/expected "409"/);
  });

  it("refuses two overrides for the same line", () => {
    expect(() =>
      parseLog(text, [
        { line: 3, expect: "408", replace: ["40/8"] },
        { line: 3, expect: "408", note: "duplicate" },
      ])
    ).toThrow(/Duplicate override for line 3/);
  });

  it("refuses a replace that erases the line entirely", () => {
    expect(() => parseLog(text, [{ line: 3, expect: "408", replace: [] }])).toThrow(
      /Override for line 3 replaces the line with nothing/
    );
  });

  it("refuses an override past the end of the file", () => {
    expect(() => parseLog(text, [{ line: 999, expect: "x", note: "n" }])).toThrow(
      /Override for line 999 is past the end of the file/
    );
  });
});

describe("parseLog splits workouts after bodyweight-only sets", () => {
  it("starts a new workout at a date line that follows a bodyweight set", () => {
    const { workouts } = parseLog("————\nLeg raises\n7 straight 4 bent\n17.09\nCurls\n45/12", []);

    // A leading separator with nothing before it yields an empty workout;
    // the two that matter are the bodyweight one and the dated one after it.
    expect(workouts).toHaveLength(3);
    expect(workouts[1]).toMatchObject({
      date: null,
      exercises: [{ header: "Leg raises", sets: [{ weightKg: 0, reps: 7, uncleanReps: 4 }] }],
    });
    expect(workouts[2]).toMatchObject({
      date: { day: 17, month: 9, year: null },
      exercises: [{ header: "Curls" }],
    });
  });
});
