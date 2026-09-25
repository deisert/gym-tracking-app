import type { DayMonth } from "./types";

// Always two-digit day and month: "22.5" is a weight, not the 22nd of May.
const DATE = /^(\d{2})\.(\d{2})(?!\d)(?:\.(\d{4}))?\.?(?:\s+(.*))?$/;

export function parseDateLine(input: string): { date: DayMonth; rest: string | null } | null {
  const match = DATE.exec(input.trim());
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return {
    date: { day, month, year: match[3] ? Number(match[3]) : null },
    rest: match[4]?.trim() || null,
  };
}

function iso(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Verify that a calendar date is real (e.g., not 31 April or 29 Feb in a non-leap year).
 * Throws if the date is impossible.
 */
function validateCalendarDate(year: number, month: number, day: number): void {
  const dateUtc = Date.UTC(year, month - 1, day);
  const d = new Date(dateUtc);
  if (d.getUTCFullYear() !== year || d.getUTCMonth() + 1 !== month || d.getUTCDate() !== day) {
    throw new Error(`Impossible date ${day}.${month}.${year}`);
  }
}

/**
 * The log never writes a year. It runs forward in time, so the year goes up
 * exactly when the month jumps back by more than half a year (Dec → Jan).
 * A small step back (17.01 then 16.01) is a late entry, not a new year.
 */
export function assignYears(dates: (DayMonth | null)[], startYear: number): (string | null)[] {
  let year = startYear;
  let lastMonth: number | null = null;
  return dates.map((date) => {
    if (!date) return null;
    if (date.year !== null) year = date.year;
    else if (lastMonth !== null && date.month < lastMonth - 6) year += 1;
    lastMonth = date.month;
    validateCalendarDate(year, date.month, date.day);
    return iso(year, date.month, date.day);
  });
}

const DAY_MS = 24 * 60 * 60 * 1000;

function toDayNumber(isoDate: string): number {
  const [y, m, d] = isoDate.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / DAY_MS;
}

function fromDayNumber(day: number): string {
  const date = new Date(day * DAY_MS);
  return iso(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

/** Undated workouts are kept and spread evenly between the dated ones around them. */
export function fillMissingDates(dates: (string | null)[]): { date: string; estimated: boolean }[] {
  const result = dates.map((date) => ({ date: date ?? "", estimated: date === null }));
  let index = 0;
  while (index < dates.length) {
    if (dates[index] !== null) {
      index += 1;
      continue;
    }
    const before = index - 1;
    let after = index;
    while (after < dates.length && dates[after] === null) after += 1;
    const from = before >= 0 ? dates[before] : null;
    const to = after < dates.length ? dates[after] : null;
    if (from === null || to === null) {
      throw new Error(`Undated workout at position ${index} has no dated neighbour on both sides`);
    }
    const start = toDayNumber(from);
    const span = toDayNumber(to) - start;
    const gaps = after - before;
    for (let k = before + 1; k < after; k += 1) {
      result[k].date = fromDayNumber(start + Math.round((span * (k - before)) / gaps));
    }
    index = after;
  }
  return result;
}
