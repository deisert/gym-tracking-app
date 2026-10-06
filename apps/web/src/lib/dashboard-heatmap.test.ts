import { describe, expect, it } from "vitest";

import {
  cellLabel,
  heatmapColumns,
  heatmapStart,
  sumByDay,
  trainingDayCount,
} from "@/lib/dashboard-heatmap";
import type { DayStat } from "@/lib/types";

const TODAY = "2026-09-23"; // Wednesday

function day(date: string, setCount: number, volumeKg: number): DayStat {
  return { date, setCount, volumeKg };
}

function cellOn(days: DayStat[], date: string) {
  const cell = heatmapColumns(days, TODAY).flat().find((c) => c.date === date);
  if (!cell) throw new Error(`no cell for ${date}`);
  return cell;
}

describe("heatmapStart", () => {
  it("is the Monday eleven weeks before this week's Monday", () => {
    expect(heatmapStart(TODAY)).toBe("2026-07-06");
  });
});

describe("heatmapColumns", () => {
  it("is 12 columns of 7 days, oldest first, Monday on top, ending with this week", () => {
    const columns = heatmapColumns([], TODAY);
    expect(columns).toHaveLength(12);
    expect(columns.every((column) => column.length === 7)).toBe(true);
    expect(columns[0][0].date).toBe("2026-07-06");
    expect(columns[11][0].date).toBe("2026-09-21");
    expect(columns[11][6].date).toBe("2026-09-27");
  });

  it("marks the days after today as future", () => {
    const columns = heatmapColumns([], TODAY);
    expect(columns[11][2]).toMatchObject({ date: "2026-09-23", isFuture: false });
    expect(columns[11][3]).toMatchObject({ date: "2026-09-24", isFuture: true });
  });

  it("gives a day without sets level 0", () => {
    expect(cellOn([day("2026-09-02", 5, 4000)], "2026-09-01").level).toBe(0);
  });

  it("never gives a day with sets level 0, even at 0 kg — a pull-up day is a training day", () => {
    expect(cellOn([day("2026-09-01", 10, 0)], "2026-09-01").level).toBe(1);
    expect(cellOn([day("2026-09-01", 10, 0), day("2026-09-02", 5, 4000)], "2026-09-01").level).toBe(1);
  });

  it("scales levels 1–4 against the heaviest day in the window", () => {
    const days = [
      day("2026-09-01", 5, 4000),
      day("2026-09-02", 5, 3000),
      day("2026-09-03", 5, 2001),
      day("2026-09-07", 5, 2000),
      day("2026-09-08", 5, 1),
    ];
    expect(cellOn(days, "2026-09-01").level).toBe(4);
    expect(cellOn(days, "2026-09-02").level).toBe(3);
    expect(cellOn(days, "2026-09-03").level).toBe(3);
    expect(cellOn(days, "2026-09-07").level).toBe(2);
    expect(cellOn(days, "2026-09-08").level).toBe(1);
  });

  it("ignores days outside the window when scaling", () => {
    expect(cellOn([day("2026-06-01", 5, 10000), day("2026-09-01", 5, 4000)], "2026-09-01").level).toBe(4);
  });

  it("sums two workouts on the same day into one cell", () => {
    const cell = cellOn([day("2026-09-01", 5, 1000), day("2026-09-01", 3, 500)], "2026-09-01");
    expect(cell).toMatchObject({ setCount: 8, volumeKg: 1500 });
  });
});

describe("sumByDay", () => {
  it("merges rows with the same date and keeps the others", () => {
    expect(sumByDay([day("2026-09-01", 5, 1000), day("2026-09-02", 1, 10), day("2026-09-01", 3, 500)])).toEqual([
      day("2026-09-01", 8, 1500),
      day("2026-09-02", 1, 10),
    ]);
  });
});

describe("cellLabel", () => {
  it("names date, sets and volume for a training day", () => {
    expect(cellLabel({ date: "2026-09-01", level: 2, setCount: 8, volumeKg: 1500, isFuture: false })).toBe(
      "1. Sep · 8 Sätze · 1.500 kg"
    );
    expect(cellLabel({ date: "2026-09-01", level: 1, setCount: 1, volumeKg: 0, isFuture: false })).toBe(
      "1. Sep · 1 Satz · 0 kg"
    );
  });

  it("says so for a rest day", () => {
    expect(cellLabel({ date: "2026-09-01", level: 0, setCount: 0, volumeKg: 0, isFuture: false })).toBe(
      "1. Sep · kein Training"
    );
  });
});

describe("trainingDayCount", () => {
  it("counts past days with sets", () => {
    expect(trainingDayCount(heatmapColumns([day("2026-09-01", 5, 1000), day("2026-09-02", 1, 0)], TODAY))).toBe(2);
  });
});
