import { Card, CardContent } from "@/components/ui/card";
import type { WeekStat } from "@/lib/types";
import { formatKilos } from "@/lib/workout-summary";

/** „Diese Woche“: the two numbers the end-of-workout summary speaks in, one level up. */
export function StatTiles({ week }: { week: WeekStat }) {
  return (
    <>
      {/* One <dl> per card: a <dl> may only wrap its dt/dd pairs in a single
          <div>, and a Card is two. */}
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardContent className="px-4">
            <dl className="flex flex-col-reverse">
              <dt className="text-sm text-muted-foreground">
                {week.workoutCount === 1 ? "Workout" : "Workouts"}
              </dt>
              <dd className="text-3xl leading-tight font-bold tabular-nums">{week.workoutCount}</dd>
            </dl>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="px-4">
            <dl className="flex flex-col-reverse">
              <dt className="text-sm text-muted-foreground">kg bewegt</dt>
              <dd className="text-3xl leading-tight font-bold tabular-nums">
                {formatKilos(week.volumeKg)}
              </dd>
            </dl>
          </CardContent>
        </Card>
      </div>

      {/* Same note as the end-of-workout dialog: a pull-up week must not
          silently read as "0 kg" (spec §4). */}
      {week.setCount > 0 && week.volumeKg === 0 && (
        <p className="mt-2 text-sm text-muted-foreground">
          Körpergewichtssätze zählen mit 0 kg – dafür fehlt noch dein Körpergewicht.
        </p>
      )}
    </>
  );
}
