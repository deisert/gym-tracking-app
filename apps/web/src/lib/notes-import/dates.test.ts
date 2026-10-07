import { describe, expect, it } from "vitest";
import { assignYears, fillMissingDates, parseDateLine } from "@/lib/notes-import/dates";

describe("parseDateLine", () => {
  it("reads day.month", () => {
    expect(parseDateLine("05.11")).toEqual({ date: { day: 5, month: 11, year: null }, rest: null });
  });

  it("keeps trailing text", () => {
    expect(parseDateLine("07.05 abends")?.rest).toBe("abends");
  });

  it("reads an explicit year and a trailing dot", () => {
    expect(parseDateLine("02.02.2025")?.date).toEqual({ day: 2, month: 2, year: 2025 });
    expect(parseDateLine("04.04.")?.date).toEqual({ day: 4, month: 4, year: null });
  });

  it.each(["22.5", "21.25", "65/8", "28/07", "11.85/11", "17.5/9"])("rejects %s", (line) => {
    expect(parseDateLine(line)).toBeNull();
  });
});

describe("assignYears", () => {
  const dm = (day: number, month: number, year: number | null = null) => ({ day, month, year });

  it("starts at the given year and rolls over at the new year", () => {
    expect(
      assignYears(
        [dm(5, 4), dm(17, 9), dm(23, 12), dm(5, 1), dm(2, 2, 2025), dm(30, 12), dm(3, 1)],
        2024
      )
    ).toEqual([
      "2024-04-05",
      "2024-09-17",
      "2024-12-23",
      "2025-01-05",
      "2025-02-02",
      "2025-12-30",
      "2026-01-03",
    ]);
  });

  it("does not roll over for a day logged out of order", () => {
    expect(assignYears([dm(17, 1), dm(16, 1)], 2025)).toEqual(["2025-01-17", "2025-01-16"]);
  });

  it("passes undated entries through", () => {
    expect(assignYears([dm(1, 3), null, dm(5, 3)], 2025)).toEqual(["2025-03-01", null, "2025-03-05"]);
  });

  it("throws for impossible dates (e.g. 31st of April)", () => {
    expect(() => assignYears([dm(31, 4, null)], 2025)).toThrow(/Impossible date/);
  });

  it("accepts 29 Feb in a leap year", () => {
    expect(assignYears([dm(29, 2, null)], 2024)).toEqual(["2024-02-29"]);
  });

  it("throws for 29 Feb in a non-leap year", () => {
    expect(() => assignYears([dm(29, 2, null)], 2025)).toThrow(/Impossible date/);
  });
});

describe("fillMissingDates", () => {
  it("spreads undated workouts evenly between their neighbours", () => {
    expect(fillMissingDates(["2026-07-23", null, null, "2026-07-31"])).toEqual([
      { date: "2026-07-23", estimated: false },
      { date: "2026-07-26", estimated: true },
      { date: "2026-07-28", estimated: true },
      { date: "2026-07-31", estimated: false },
    ]);
  });

  it("works across a month boundary", () => {
    expect(fillMissingDates(["2024-11-27", null, "2024-12-13"])[1]).toEqual({
      date: "2024-12-05",
      estimated: true,
    });
  });

  it("refuses an undated workout without a dated neighbour", () => {
    expect(() => fillMissingDates([null, "2024-12-13"])).toThrow(/neighbour/);
  });
});
