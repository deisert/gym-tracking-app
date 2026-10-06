import { describe, expect, it } from "vitest";

import {
  currentStreak,
  formatAverage,
  sumTotals,
  thisWeek,
  weeklyAverage,
} from "@/lib/dashboard-weeks";
import type { WeekStat } from "@/lib/types";

// Wednesday. Its week starts Monday 2026-09-21; the last completed week is 2026-09-14.
const TODAY = "2026-09-23";

function week(weekStart: string, workoutCount: number): WeekStat {
  return { weekStart, workoutCount, setCount: workoutCount * 10, volumeKg: workoutCount * 1000 };
}

describe("thisWeek", () => {
  it("returns the row for the week containing today", () => {
    expect(thisWeek([week("2026-09-14", 3), week("2026-09-21", 2)], TODAY)).toEqual(
      week("2026-09-21", 2)
    );
  });

  it("returns zeros when nothing was trained this week — an empty week is a real week", () => {
    expect(thisWeek([week("2026-09-14", 3)], TODAY)).toEqual({
      weekStart: "2026-09-21",
      workoutCount: 0,
      setCount: 0,
      volumeKg: 0,
    });
  });
});

describe("currentStreak", () => {
  it("counts back from the last completed week until one falls short", () => {
    const weeks = [
      week("2026-08-17", 4),
      week("2026-08-24", 1),
      week("2026-08-31", 2),
      week("2026-09-07", 2),
      week("2026-09-14", 3),
    ];
    expect(currentStreak(weeks, TODAY)).toBe(3);
  });

  it("lets the running week extend the streak once it reaches the threshold", () => {
    expect(currentStreak([week("2026-09-07", 2), week("2026-09-14", 3), week("2026-09-21", 2)], TODAY)).toBe(3);
  });

  it("never lets the running week break it — on a Wednesday it has not happened yet", () => {
    expect(currentStreak([week("2026-09-07", 2), week("2026-09-14", 3), week("2026-09-21", 1)], TODAY)).toBe(2);
  });

  it("treats a week without a row as zero workouts", () => {
    expect(currentStreak([week("2026-08-31", 2), week("2026-09-14", 2)], TODAY)).toBe(1);
  });

  it("starts over when the last completed week fell short", () => {
    expect(currentStreak([week("2026-09-07", 3), week("2026-09-14", 1), week("2026-09-21", 2)], TODAY)).toBe(1);
  });

  it("is zero without history", () => {
    expect(currentStreak([], TODAY)).toBe(0);
  });

  it("takes the threshold as a parameter", () => {
    expect(currentStreak([week("2026-09-14", 1)], TODAY, 1)).toBe(1);
  });
});

describe("weeklyAverage", () => {
  it("is null without history", () => {
    expect(weeklyAverage([], TODAY)).toBeNull();
  });

  it("is null while the only training is in the running week", () => {
    expect(weeklyAverage([week("2026-09-21", 2)], TODAY)).toBeNull();
  });

  it("averages completed weeks since the first one, empty weeks included", () => {
    // 2026-08-31: 2, 2026-09-07: nothing, 2026-09-14: 3 → 5 / 3
    const result = weeklyAverage([week("2026-08-31", 2), week("2026-09-14", 3)], TODAY);
    expect(result?.weekCount).toBe(3);
    expect(result?.average).toBeCloseTo(5 / 3, 5);
  });

  it("looks back at most eight completed weeks", () => {
    // Eight weeks back from 2026-09-14 is 2026-07-27; January is outside.
    const result = weeklyAverage([week("2026-01-05", 1), week("2026-09-14", 4)], TODAY);
    expect(result).toEqual({ average: 0.5, weekCount: 8 });
  });

  it("leaves the running week out", () => {
    expect(weeklyAverage([week("2026-09-14", 2), week("2026-09-21", 5)], TODAY)).toEqual({
      average: 2,
      weekCount: 1,
    });
  });
});

describe("formatAverage", () => {
  it("always shows one German decimal", () => {
    expect(formatAverage(2.375)).toBe("2,4");
    expect(formatAverage(2)).toBe("2,0");
    expect(formatAverage(1.25)).toBe("1,3");
  });
});

describe("sumTotals", () => {
  it("adds every week", () => {
    expect(sumTotals([week("2026-09-07", 2), week("2026-09-14", 3)])).toEqual({
      workoutCount: 5,
      setCount: 50,
      volumeKg: 5000,
    });
  });

  it("is zero without history", () => {
    expect(sumTotals([])).toEqual({ workoutCount: 0, setCount: 0, volumeKg: 0 });
  });
});
