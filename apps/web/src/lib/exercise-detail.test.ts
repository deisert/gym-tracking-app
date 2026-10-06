import { describe, expect, it } from "vitest";

import {
  availableRanges,
  chartPoints,
  computeBests,
  defaultRange,
  formatAttributes,
  formatLastTrained,
  formatMonthTick,
  formatSessionExtras,
  formatSessionSets,
  groupSessions,
  isRepsMode,
  monthTicks,
  niceTicks,
  pointsInRange,
  repTable,
  trainedSessions,
  type ChartPoint,
} from "@/lib/exercise-detail";
import { type ExerciseSetRow, formatSetSummary } from "@gymtrack/core";

let nextId = 0;

/** A set row as `v_exercise_sets` delivers it; e1RM computed like the view would. */
function row(
  workoutId: string,
  performedOn: string,
  weightKg: number,
  reps: number,
  extra: Partial<ExerciseSetRow> & {
    warmup?: boolean;
    dropset?: boolean;
    unclean?: number;
    position?: number;
  } = {}
): ExerciseSetRow {
  const { warmup = false, dropset = false, unclean = 0, position = nextId, ...rest } = extra;
  nextId += 1;
  return {
    workoutId,
    performedOn,
    workoutCreatedAt: `${performedOn}T10:00:00Z`,
    category: null,
    workoutExerciseId: `${workoutId}-we`,
    workoutExercisePosition: 0,
    note: null,
    attributes: {},
    set: {
      id: `set-${nextId}`,
      position,
      weight_kg: weightKg,
      reps,
      is_warmup: warmup,
      unclean_reps: unclean,
      is_dropset: dropset,
    },
    volumeKg: weightKg * reps,
    e1rmKg: Math.round(weightKg * (1 + reps / 30) * 10) / 10,
    ...rest,
  };
}

describe("groupSessions", () => {
  it("groups by workout, oldest first, whatever order the rows come in", () => {
    const sessions = groupSessions([
      row("w2", "2026-09-10", 85, 5),
      row("w1", "2026-09-01", 80, 5),
      row("w2", "2026-09-10", 85, 4),
    ]);
    expect(sessions.map((s) => s.workoutId)).toEqual(["w1", "w2"]);
    expect(sessions[1].sets).toHaveLength(2);
  });

  it("orders two workouts on the same day by creation", () => {
    const sessions = groupSessions([
      row("late", "2026-09-10", 80, 5, { workoutCreatedAt: "2026-09-10T18:00:00Z" }),
      row("early", "2026-09-10", 80, 5, { workoutCreatedAt: "2026-09-10T08:00:00Z" }),
    ]);
    expect(sessions.map((s) => s.workoutId)).toEqual(["early", "late"]);
  });

  it("keeps an exercise logged twice in one workout as one session, in logged order", () => {
    const sessions = groupSessions([
      row("w1", "2026-09-01", 70, 12, { workoutExerciseId: "b", workoutExercisePosition: 1, position: 0 }),
      row("w1", "2026-09-01", 85, 5, { workoutExerciseId: "a", workoutExercisePosition: 0, position: 0 }),
      row("w1", "2026-09-01", 85, 4, { workoutExerciseId: "a", workoutExercisePosition: 0, position: 1 }),
    ]);
    expect(sessions).toHaveLength(1);
    // Positions restart per instance; the summary must still read in logged order.
    expect(formatSetSummary(sessions[0].sets)).toBe("85 × 5 · 85 × 4 · 70 × 12");
  });

  it("counts volume over every set but tops and reps over working sets only", () => {
    const [session] = groupSessions([
      row("w1", "2026-09-01", 100, 1, { warmup: true }),
      row("w1", "2026-09-01", 80, 8),
      row("w1", "2026-09-01", 80, 6, { unclean: 2 }),
    ]);
    expect(session.volumeKg).toBe(100 + 640 + 480);
    expect(session.top).toMatchObject({ weightKg: 80, reps: 8 });
    expect(session.warmupCount).toBe(1);
    expect(session.workingSetCount).toBe(2);
    expect(session.maxReps).toBe(8);
    expect(session.totalReps).toBe(14);
    expect(session.uncleanReps).toBe(2);
  });

  it("breaks a top-set tie by reps and an e1RM tie by weight", () => {
    const [session] = groupSessions([
      row("w1", "2026-09-01", 80, 5),
      row("w1", "2026-09-01", 80, 7),
      row("w1", "2026-09-01", 60, 10, { e1rmKg: 90 }),
      row("w1", "2026-09-01", 75, 6, { e1rmKg: 90 }),
    ]);
    expect(session.top).toMatchObject({ weightKg: 80, reps: 7 });

    const [tie] = groupSessions([
      row("w1", "2026-09-01", 60, 10, { e1rmKg: 90 }),
      row("w1", "2026-09-01", 75, 6, { e1rmKg: 90 }),
    ]);
    expect(tie.bestE1rm).toMatchObject({ weightKg: 75, reps: 6 });
  });

  it("rounds a float volume back to two decimals", () => {
    const [session] = groupSessions([
      row("w1", "2026-09-01", 21.88, 3, { volumeKg: 65.64 }),
      row("w1", "2026-09-01", 21.88, 3, { volumeKg: 65.64 }),
      row("w1", "2026-09-01", 0.1, 1, { volumeKg: 0.1 }),
    ]);
    expect(session.volumeKg).toBe(131.38);
  });

  it("collects distinct notes and merges attributes", () => {
    const [session] = groupSessions([
      row("w1", "2026-09-01", 80, 5, { workoutExerciseId: "a", note: "S2: 90%", attributes: { grip: "wide" } }),
      row("w1", "2026-09-01", 80, 5, { workoutExerciseId: "a", note: "S2: 90%", attributes: { grip: "wide" } }),
      row("w1", "2026-09-01", 80, 5, { workoutExerciseId: "b", workoutExercisePosition: 1, note: " " }),
    ]);
    expect(session.notes).toEqual(["S2: 90%"]);
    expect(session.attributes).toEqual({ grip: "wide" });
  });

  it("gives a warm-up-only session no top and no e1RM", () => {
    const sessions = groupSessions([row("w1", "2026-09-01", 40, 10, { warmup: true })]);
    expect(sessions[0].top).toBeNull();
    expect(sessions[0].bestE1rm).toBeNull();
    expect(trainedSessions(sessions)).toEqual([]);
  });
});

describe("isRepsMode", () => {
  it("is on only when every working set weighs 0", () => {
    const bodyweight = trainedSessions(
      groupSessions([row("w1", "2026-09-01", 0, 8), row("w2", "2026-09-05", 0, 10)])
    );
    expect(isRepsMode(bodyweight)).toBe(true);

    const mixed = trainedSessions(
      groupSessions([row("w1", "2026-09-01", 0, 8), row("w2", "2026-09-05", 10, 6)])
    );
    expect(isRepsMode(mixed)).toBe(false);
    expect(isRepsMode([])).toBe(false);
  });
});

describe("computeBests", () => {
  it("dates every best to the first session that reached it — a tie is not a new best", () => {
    const trained = trainedSessions(
      groupSessions([
        row("w1", "2026-01-01", 80, 10),
        row("w2", "2026-02-01", 85, 3),
        row("w3", "2026-03-01", 85, 3),
        row("w4", "2026-04-01", 80, 10),
      ])
    );
    const bests = computeBests(trained);
    expect(bests.heaviest).toMatchObject({ workoutId: "w2", weightKg: 85, reps: 3 });
    expect(bests.e1rm).toMatchObject({ workoutId: "w1", weightKg: 80, reps: 10, e1rmKg: 106.7 });
    expect(bests.mostReps).toMatchObject({ workoutId: "w1", reps: 10 });
  });

  it("ignores warm-ups", () => {
    const trained = trainedSessions(
      groupSessions([row("w1", "2026-01-01", 120, 1, { warmup: true }), row("w1", "2026-01-01", 80, 5)])
    );
    expect(computeBests(trained).heaviest).toMatchObject({ weightKg: 80 });
  });

  it("returns nulls for nothing", () => {
    expect(computeBests([])).toEqual({ e1rm: null, heaviest: null, mostReps: null });
  });
});

describe("repTable", () => {
  it("keeps the most reps per weight, dated to when they were first reached", () => {
    const trained = trainedSessions(
      groupSessions([
        row("w1", "2026-08-01", 80, 8),
        row("w2", "2026-08-15", 80, 10),
        row("w3", "2026-09-01", 80, 10),
        row("w3", "2026-09-01", 90, 4),
        row("w3", "2026-09-01", 50, 20, { warmup: true }),
      ])
    );
    const { recent, rest } = repTable(trained, "2026-09-30");
    expect(recent).toEqual([
      { weightKg: 90, reps: 4, performedOn: "2026-09-01", lastUsedOn: "2026-09-01" },
      { weightKg: 80, reps: 10, performedOn: "2026-08-15", lastUsedOn: "2026-09-01" },
    ]);
    expect(rest).toEqual([]);
  });

  it("puts weights not used recently behind the recent ones", () => {
    const trained = trainedSessions(
      groupSessions([row("old", "2025-01-01", 100, 3), row("new", "2026-09-01", 80, 8)])
    );
    const { recent, rest } = repTable(trained, "2026-09-30");
    expect(recent.map((r) => r.weightKg)).toEqual([80]);
    expect(rest.map((r) => r.weightKg)).toEqual([100]);
  });

  it("caps the recent list and moves the overflow to rest", () => {
    const rows = Array.from({ length: 10 }, (_, i) => row(`w${i}`, "2026-09-01", 50 + i * 5, 5));
    const { recent, rest } = repTable(trainedSessions(groupSessions(rows)), "2026-09-30");
    expect(recent).toHaveLength(8);
    expect(rest.map((r) => r.weightKg)).toEqual([55, 50]);
  });

  it("shows everything when nothing is recent, instead of an empty table", () => {
    const trained = trainedSessions(groupSessions([row("old", "2024-01-01", 100, 3)]));
    expect(repTable(trained, "2026-09-30")).toEqual({
      recent: [{ weightKg: 100, reps: 3, performedOn: "2024-01-01", lastUsedOn: "2024-01-01" }],
      rest: [],
    });
  });
});

function points(dates: string[]): ChartPoint[] {
  return chartPoints(trainedSessions(groupSessions(dates.map((d, i) => row(`w${i}`, d, 80, 5)))));
}

describe("chart ranges", () => {
  const today = "2026-09-30";

  it("offers no chart below three sessions", () => {
    expect(availableRanges(points(["2026-09-01", "2026-09-10"]), today)).toEqual([]);
  });

  it("hides a range that shows the same points as „Alles“", () => {
    const ranges = availableRanges(points(["2026-08-01", "2026-09-01", "2026-09-20"]), today);
    expect(ranges).toEqual(["all"]);
    expect(defaultRange(ranges)).toBe("all");
  });

  it("offers 3 M and 1 J once they hold three sessions and drop some, defaulting to 1 J", () => {
    const history = points([
      "2024-05-01",
      "2025-11-01",
      "2026-03-01",
      "2026-07-15",
      "2026-08-01",
      "2026-09-01",
      "2026-09-20",
    ]);
    const ranges = availableRanges(history, today);
    expect(ranges).toEqual(["3m", "1y", "all"]);
    expect(defaultRange(ranges)).toBe("1y");
    expect(pointsInRange(history, "3m", today).map((p) => p.date)).toEqual([
      "2026-07-15",
      "2026-08-01",
      "2026-09-01",
      "2026-09-20",
    ]);
  });

  it("carries every metric on each point", () => {
    expect(points(["2026-09-01"])[0]).toEqual({
      date: "2026-09-01",
      e1rmKg: 93.3,
      topWeightKg: 80,
      topReps: 5,
      volumeKg: 400,
      maxReps: 5,
      totalReps: 5,
    });
  });
});

describe("formatting", () => {
  it("translates the import's grip attributes and passes unknown ones through", () => {
    expect(formatAttributes({ grip: "narrow" })).toBe("Griff: eng");
    expect(formatAttributes({ grip: "lateral" })).toBe("Griff: einarmig");
    expect(formatAttributes({ seat: "4" })).toBe("seat: 4");
    expect(formatAttributes({})).toBeNull();
  });

  it("summarises unclean reps, dropsets and attributes of a session", () => {
    const [session] = groupSessions([
      row("w1", "2026-09-01", 80, 8, { unclean: 2, attributes: { grip: "wide" } }),
      row("w1", "2026-09-01", 60, 8, { dropset: true, unclean: 1 }),
    ]);
    expect(formatSessionExtras(session)).toBe("+3 unsauber · Dropset · Griff: weit");

    const [plain] = groupSessions([row("w1", "2026-09-01", 80, 8)]);
    expect(formatSessionExtras(plain)).toBeNull();
  });

  it("says when the exercise was last trained, in words while it is recent", () => {
    expect(formatLastTrained("2026-09-30", "2026-09-30")).toBe("heute");
    expect(formatLastTrained("2026-09-29", "2026-09-30")).toBe("gestern");
    expect(formatLastTrained("2026-09-25", "2026-09-30")).toBe("vor 5 Tagen");
    expect(formatLastTrained("2025-03-12", "2026-09-30")).toBe("am 12. Mär 2025");
  });
});

describe("monthTicks", () => {
  it("lists month starts inside the range", () => {
    expect(monthTicks("2026-06-15", "2026-09-30")).toEqual(["2026-07-01", "2026-08-01", "2026-09-01"]);
  });

  it("thins a long range to at most four ticks", () => {
    const ticks = monthTicks("2024-04-17", "2026-09-30");
    expect(ticks.length).toBeLessThanOrEqual(4);
    expect(ticks[0]).toBe("2024-05-01");
  });

  it("falls back to the start inside a single month", () => {
    expect(monthTicks("2026-09-02", "2026-09-28")).toEqual(["2026-09-02"]);
  });

  it("labels with a two-digit year only across years", () => {
    expect(formatMonthTick("2026-09-01", false)).toBe("Sep");
    expect(formatMonthTick("2025-03-01", true)).toBe("Mär 25");
  });
});

describe("niceTicks", () => {
  it("steps in round numbers and covers the data", () => {
    expect(niceTicks(0, 3032)).toEqual([0, 1000, 2000, 3000, 4000]);
    expect(niceTicks(56, 119)).toEqual([40, 60, 80, 100, 120]);
    expect(niceTicks(7, 12)).toEqual([6, 8, 10, 12]);
    expect(niceTicks(0, 10, 4, true)).toEqual([0, 5, 10]);
    expect(niceTicks(0, 10)).toEqual([0, 2.5, 5, 7.5, 10]);
  });

  it("opens a flat series into a range", () => {
    const ticks = niceTicks(80, 80);
    expect(ticks[0]).toBeLessThan(80);
    expect(ticks[ticks.length - 1]).toBeGreaterThan(80);
  });

  it("never runs away on a step", () => {
    for (const [min, max] of [[0, 1], [95.2, 146.3], [0, 12], [21.88, 29.38]]) {
      const ticks = niceTicks(min, max);
      expect(ticks.length).toBeLessThanOrEqual(7);
      expect(ticks[0]).toBeLessThanOrEqual(min);
      expect(ticks[ticks.length - 1]).toBeGreaterThanOrEqual(max);
    }
  });
});

describe("formatSessionSets", () => {
  it("writes bodyweight sets as reps, weighted ones like the log screen", () => {
    const [bodyweight] = groupSessions([row("w1", "2026-09-01", 0, 8), row("w1", "2026-09-01", 0, 7)]);
    expect(formatSessionSets(bodyweight)).toBe("8 · 7 Wdh.");

    const [weighted] = groupSessions([
      row("w1", "2026-09-01", 40, 10, { warmup: true }),
      row("w1", "2026-09-01", 82.5, 6),
    ]);
    expect(formatSessionSets(weighted)).toBe("82,5 × 6");
  });
});
