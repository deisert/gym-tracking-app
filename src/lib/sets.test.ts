import { describe, expect, it } from "vitest";
import {
  formatSetSummary,
  formatWeight,
  ghostForPosition,
  nextActiveKey,
  nextPosition,
} from "@/lib/sets";
import type { LastPerformance, SetRecord } from "@/lib/types";

function set(position: number, weight_kg: number, reps: number, is_warmup = false): SetRecord {
  return { id: `s${position}`, position, weight_kg, reps, is_warmup };
}

const lastSession: LastPerformance = {
  workoutId: "w1",
  performedOn: "2026-08-12",
  sets: [set(0, 80, 8), set(1, 80, 8), set(2, 82.5, 6)],
};

describe("ghostForPosition", () => {
  it("returns the set at the same index", () => {
    expect(ghostForPosition(lastSession, 0)).toEqual({ weight_kg: 80, reps: 8 });
    expect(ghostForPosition(lastSession, 2)).toEqual({ weight_kg: 82.5, reps: 6 });
  });

  it("falls back to the last set when this session goes deeper", () => {
    expect(ghostForPosition(lastSession, 5)).toEqual({ weight_kg: 82.5, reps: 6 });
  });

  it("returns null without a last performance", () => {
    expect(ghostForPosition(null, 0)).toBeNull();
  });

  it("returns null when the last performance has no sets", () => {
    expect(ghostForPosition({ workoutId: "w1", performedOn: "2026-08-12", sets: [] }, 0)).toBeNull();
  });

  it("maps by index over all sets, warm-ups included", () => {
    const withWarmup: LastPerformance = {
      workoutId: "w1",
      performedOn: "2026-08-12",
      sets: [set(0, 40, 10, true), set(1, 80, 8)],
    };
    expect(ghostForPosition(withWarmup, 0)).toEqual({ weight_kg: 40, reps: 10 });
    expect(ghostForPosition(withWarmup, 1)).toEqual({ weight_kg: 80, reps: 8 });
  });

  it("ignores the stored order of the input array", () => {
    const shuffled: LastPerformance = {
      workoutId: "w1",
      performedOn: "2026-08-12",
      sets: [set(2, 82.5, 6), set(0, 80, 8), set(1, 80, 8)],
    };
    expect(ghostForPosition(shuffled, 0)).toEqual({ weight_kg: 80, reps: 8 });
  });
});

describe("formatWeight", () => {
  it("uses a German decimal comma", () => {
    expect(formatWeight(82.5)).toBe("82,5");
  });

  it("drops trailing zeros", () => {
    expect(formatWeight(80)).toBe("80");
    expect(formatWeight(80.0)).toBe("80");
  });

  it("renders bodyweight as 0", () => {
    expect(formatWeight(0)).toBe("0");
  });
});

describe("formatSetSummary", () => {
  it("joins working sets with a middle dot", () => {
    expect(formatSetSummary(lastSession.sets)).toBe("80 × 8 · 80 × 8 · 82,5 × 6");
  });

  it("excludes warm-up sets", () => {
    expect(formatSetSummary([set(0, 40, 10, true), set(1, 80, 8)])).toBe("80 × 8");
  });

  it("returns an empty string when there are no working sets", () => {
    expect(formatSetSummary([set(0, 40, 10, true)])).toBe("");
    expect(formatSetSummary([])).toBe("");
  });
});

describe("nextPosition", () => {
  it("starts at 0", () => {
    expect(nextPosition([])).toBe(0);
  });

  it("continues after the highest existing position", () => {
    expect(nextPosition([{ position: 0 }, { position: 2 }])).toBe(3);
  });
});

describe("nextActiveKey", () => {
  it("keeps the current active key when a different row is removed", () => {
    expect(nextActiveKey(["a", "b"], "a", "c")).toBe("a");
  });

  it("falls back to the new last row when the active row is removed", () => {
    expect(nextActiveKey(["a", "b"], "c", "c")).toBe("b");
  });

  it("falls back to null when the active row was the only row", () => {
    expect(nextActiveKey([], "a", "a")).toBeNull();
  });
});
