import { cellLabel, trainingDayCount, type HeatmapCell, type HeatmapLevel } from "@/lib/dashboard-heatmap";
import { cn } from "@/lib/utils";

/** `--muted`, then lime in four steps (DESIGN_SYSTEM.md §2). */
const LEVEL_CLASS: Record<HeatmapLevel, string> = {
  0: "bg-muted",
  1: "bg-primary/25",
  2: "bg-primary/50",
  3: "bg-primary/75",
  4: "bg-primary",
};

const LEVELS: HeatmapLevel[] = [0, 1, 2, 3, 4];

/**
 * The 12-week calendar: one column per week, Monday on top. A plain div grid
 * (spec §2.3) — `role="img"` with a summary for screen readers, a `title` per
 * day, and a legend, because a colour ramp means nothing without one.
 */
export function WeekHeatmap({ columns }: { columns: HeatmapCell[][] }) {
  const trainingDays = trainingDayCount(columns);
  return (
    <div>
      <div
        role="img"
        aria-label={`${trainingDays} ${trainingDays === 1 ? "Trainingstag" : "Trainingstage"} in den letzten ${columns.length} Wochen`}
        className="grid auto-cols-fr grid-flow-col grid-rows-7 gap-1"
      >
        {columns.flat().map((cell) => (
          <div
            key={cell.date}
            title={cell.isFuture ? undefined : cellLabel(cell)}
            className={cn(
              "aspect-square rounded-sm",
              cell.isFuture ? "bg-transparent" : LEVEL_CLASS[cell.level]
            )}
          />
        ))}
      </div>

      <div
        aria-hidden="true"
        className="mt-2 flex items-center justify-end gap-1 text-xs text-muted-foreground"
      >
        <span className="mr-1">weniger</span>
        {LEVELS.map((level) => (
          <span key={level} className={cn("size-3 rounded-sm", LEVEL_CLASS[level])} />
        ))}
        <span className="ml-1">mehr</span>
      </div>
    </div>
  );
}
