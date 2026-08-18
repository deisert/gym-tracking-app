import Link from "next/link";

import { listRecentWorkouts } from "@/lib/data/workouts";
import { formatPerformedOn } from "@/lib/dates";

export default async function HistoryPage() {
  const workouts = await listRecentWorkouts(100);

  return (
    <main className="mx-auto w-full max-w-md p-4">
      <h1 className="text-xl font-semibold">Verlauf</h1>

      {workouts.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">
          Noch keine Workouts. Sobald du eins loggst, steht es hier.
        </p>
      ) : (
        <ul className="mt-6 flex flex-col gap-2">
          {workouts.map((workout) => (
            <li key={workout.id}>
              <Link
                href={`/workout/${workout.id}`}
                className="flex min-h-14 items-center justify-between rounded-xl bg-card px-4"
              >
                <span className="font-medium">
                  {formatPerformedOn(workout.performed_on)}
                  {workout.category ? ` · ${workout.category}` : ""}
                </span>
                <span className="text-sm text-muted-foreground tabular-nums">
                  {workout.exerciseCount} Übungen · {workout.setCount} Sätze
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
