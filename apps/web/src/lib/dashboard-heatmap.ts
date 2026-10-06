import { addDays, formatPerformedOn, mondayOf } from "@/lib/dates";
import { formatVolume } from "@/lib/workout-summary";
import type { DayStat } from "@/lib/types";

export const HEATMAP_WEEKS = 12;

/** 0 = no sets; 1–4 = the four lime steps of DESIGN_SYSTEM.md §2. */
export type HeatmapLevel = 0 | 1 | 2 | 3 | 4;

export type HeatmapCell = {
  date: string;
  level: HeatmapLevel;
  setCount: number;
  volumeKg: number;
  isFuture: boolean;
};

/** The Monday the window opens on: `weeks - 1` weeks before this week's Monday. */
export function heatmapStart(today: string, weeks = HEATMAP_WEEKS): string {
  return addDays(mondayOf(today), -7 * (weeks - 1));
}

/** One row per workout in, one row per calendar day out. */
export function sumByDay(rows: DayStat[]): DayStat[] {
  const byDate = new Map<string, DayStat>();
  for (const row of rows) {
    const current = byDate.get(row.date);
    byDate.set(
      row.date,
      current
        ? {
            date: row.date,
            setCount: current.setCount + row.setCount,
            volumeKg: current.volumeKg + row.volumeKg,
          }
        : { ...row }
    );
  }
  return [...byDate.values()];
}

function levelFor(setCount: number, volumeKg: number, maxVolumeKg: number): HeatmapLevel {
  if (setCount === 0) return 0;
  // A day with sets is a training day even at 0 kg: the calendar must never
  // call a pull-up day a rest day.
  if (maxVolumeKg === 0) return 1;
  return Math.max(1, Math.ceil((volumeKg / maxVolumeKg) * 4)) as HeatmapLevel;
}

/**
 * `weeks` columns of 7 cells, oldest column first, Monday on top. Levels scale
 * against the heaviest day inside the window, so the calendar re-scales as the
 * lifts grow instead of saturating.
 */
export function heatmapColumns(
  days: DayStat[],
  today: string,
  weeks = HEATMAP_WEEKS
): HeatmapCell[][] {
  const start = heatmapStart(today, weeks);
  const byDate = new Map(sumByDay(days).map((d) => [d.date, d]));

  let maxVolumeKg = 0;
  for (const d of byDate.values()) {
    if (d.date >= start && d.date <= today) maxVolumeKg = Math.max(maxVolumeKg, d.volumeKg);
  }

  const columns: HeatmapCell[][] = [];
  for (let w = 0; w < weeks; w++) {
    const column: HeatmapCell[] = [];
    for (let d = 0; d < 7; d++) {
      const date = addDays(start, w * 7 + d);
      const setCount = byDate.get(date)?.setCount ?? 0;
      const volumeKg = byDate.get(date)?.volumeKg ?? 0;
      column.push({
        date,
        level: levelFor(setCount, volumeKg, maxVolumeKg),
        setCount,
        volumeKg,
        isFuture: date > today,
      });
    }
    columns.push(column);
  }
  return columns;
}

/** The per-cell `title`: "1. Sep · 8 Sätze · 1.500 kg" or "1. Sep · kein Training". */
export function cellLabel(cell: HeatmapCell): string {
  const date = formatPerformedOn(cell.date);
  if (cell.setCount === 0) return `${date} · kein Training`;
  const sets = `${cell.setCount} ${cell.setCount === 1 ? "Satz" : "Sätze"}`;
  return `${date} · ${sets} · ${formatVolume(cell.volumeKg)}`;
}

/** For the grid's aria-label: past days with at least one set. */
export function trainingDayCount(columns: HeatmapCell[][]): number {
  return columns.flat().filter((cell) => !cell.isFuture && cell.setCount > 0).length;
}
