import { describe, expect, it } from "vitest";
import { emitImportSql, emitRollbackSql } from "@/lib/notes-import/emit-sql";
import type { ImportWorkout } from "@/lib/notes-import/types";

const USER = "4458ae8e-cf70-4ba5-8416-e9e7983cf181";

const workouts: ImportWorkout[] = [
  {
    line: 3,
    performedOn: "2024-09-17",
    dateEstimated: false,
    category: "Push",
    note: "it's fine",
    exercises: [
      {
        line: 4,
        rawHeader: "Incline BB",
        name: "Incline bench press barbell",
        attributes: {},
        note: null,
        flags: [],
        sets: [{ weightKg: 50, reps: 9, uncleanReps: 0, isWarmup: false, isDropset: false }],
      },
      {
        line: 9,
        rawHeader: "Lat pulldown wide",
        name: "Lat Pulldown",
        attributes: { grip: "wide" },
        note: null,
        flags: [],
        sets: [{ weightKg: 80, reps: 8, uncleanReps: 2, isWarmup: false, isDropset: true }],
      },
    ],
  },
];

function payloadOf(sql: string) {
  const match = /\$payload\$([\s\S]*)\$payload\$/.exec(sql);
  if (!match) throw new Error("no payload");
  return JSON.parse(match[1]);
}

describe("emitImportSql", () => {
  it("embeds the model as a JSON payload", () => {
    const payload = payloadOf(emitImportSql(workouts, { userId: USER, mode: "commit" }));
    expect(payload.exerciseNames).toEqual(["Incline bench press barbell", "Lat Pulldown"]);
    expect(payload.attributeOptions).toEqual([{ name: "Lat Pulldown", key: "grip", values: ["wide"] }]);
    expect(payload.lastDate).toBe("2024-09-17");
    expect(payload.workouts[0]).toMatchObject({ performedOn: "2024-09-17", category: "Push", note: "it's fine" });
    expect(payload.workouts[0].exercises[1].sets).toEqual([[80, 8, 2, false, true]]);
  });

  it("runs as the owner under RLS", () => {
    const sql = emitImportSql(workouts, { userId: USER, mode: "commit" });
    expect(sql).toContain("set local role authenticated");
    expect(sql).toContain(`'${USER}'`);
  });

  it("aborts the dry run at the end so nothing is kept", () => {
    const sql = emitImportSql(workouts, { userId: USER, mode: "dry-run" });
    expect(sql).toMatch(/raise exception 'NOTES_IMPORT_DRY_RUN_OK/);
  });

  it("refuses to import twice", () => {
    const sql = emitImportSql(workouts, { userId: USER, mode: "commit" });
    expect(sql).toContain("NOTES_IMPORT_ABORT");
    expect(sql).not.toContain("NOTES_IMPORT_DRY_RUN_OK");
  });

  it("rejects a malformed user id", () => {
    expect(() => emitImportSql(workouts, { userId: "x'; drop table sets;--", mode: "commit" })).toThrow(/user id/);
  });

  it("rejects text that would end the payload quote", () => {
    const bad = [{ ...workouts[0], note: "$payload$" }];
    expect(() => emitImportSql(bad, { userId: USER, mode: "commit" })).toThrow(/payload/);
  });

  it("rejects text that would end the do-block quote", () => {
    const bad = [{ ...workouts[0], note: "$import$" }];
    expect(() => emitImportSql(bad, { userId: USER, mode: "commit" })).toThrow(/import/);
  });

  it("rehearses the double-import guard in dry-run mode too", () => {
    const sql = emitImportSql(workouts, { userId: USER, mode: "dry-run" });
    expect(sql).toContain("NOTES_IMPORT_ABORT");
  });
});

describe("emitRollbackSql", () => {
  const NAMES = ["Incline bench press barbell", "Lat Pulldown"];

  it("deletes the imported range and the exercises it created", () => {
    const sql = emitRollbackSql({
      userId: USER,
      lastDate: "2026-08-16",
      generatedAt: "2026-09-25T10:00:00.000Z",
      exerciseNames: NAMES,
    });
    expect(sql).toContain("performed_on <= '2026-08-16'");
    expect(sql).toContain("created_at >= '2026-09-25T10:00:00.000Z'");
    expect(sql).toContain("jsonb_array_elements_text(names)");
    expect(sql).toContain(JSON.stringify(NAMES));
  });

  it("rejects a name containing the quote tag", () => {
    expect(() =>
      emitRollbackSql({
        userId: USER,
        lastDate: "2026-08-16",
        generatedAt: "2026-09-25T10:00:00.000Z",
        exerciseNames: ["$names$"],
      })
    ).toThrow(/quote tag/);
  });

  it("rejects a malformed generatedAt", () => {
    expect(() =>
      emitRollbackSql({
        userId: USER,
        lastDate: "2026-08-16",
        generatedAt: "2026-09-25 (x')",
        exerciseNames: NAMES,
      })
    ).toThrow(/timestamp/);
  });
});
