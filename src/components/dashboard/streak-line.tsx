import { formatAverage, STREAK_THRESHOLD } from "@/lib/dashboard-weeks";

/** Below this, a "streak" is just a week — shown only as the average (spec §10.8). */
const MIN_STREAK_SHOWN = 2;

type Props = {
  streak: number;
  average: { average: number; weekCount: number };
};

/** „Rhythmus“: the Ø line always, the streak only once there is one worth naming. */
export function StreakLine({ streak, average }: Props) {
  const span = average.weekCount === 1 ? "letzte Woche" : `letzte ${average.weekCount} Wochen`;
  return (
    <p className="text-sm tabular-nums">
      {streak >= MIN_STREAK_SHOWN && (
        <>
          <span className="font-semibold">{streak} Wochen in Folge</span> mit {STREAK_THRESHOLD}+
          Workouts ·{" "}
        </>
      )}
      Ø {formatAverage(average.average)} pro Woche{" "}
      <span className="text-muted-foreground">({span})</span>
    </p>
  );
}
