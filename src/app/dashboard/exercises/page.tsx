import Link from "next/link";

import { BlockError } from "@/components/dashboard/section";
import { getExerciseOverview } from "@/lib/data/exercise-detail";
import { formatPerformedOnInYear, todayInAppTimezone } from "@/lib/dates";

/**
 * „Alle Übungen“: the way into every exercise page, not only the top five
 * (spec §3). Most recently trained first.
 */
export default async function ExercisesPage() {
  const today = todayInAppTimezone();
  const exercises = await getExerciseOverview();

  return (
    <main className="mx-auto w-full max-w-md p-4">
      <Link href="/dashboard" className="inline-flex min-h-11 items-center text-sm text-muted-foreground">
        ← Dashboard
      </Link>
      <h1 className="text-xl font-semibold">Alle Übungen</h1>

      <div className="mt-6">
        {exercises === null ? (
          <BlockError />
        ) : exercises.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Noch keine Arbeitssätze geloggt. Jede Übung, die du trainierst, erscheint hier.
          </p>
        ) : (
          <ul className="flex flex-col">
            {exercises.map((exercise) => (
              <li key={exercise.exerciseId}>
                <Link
                  href={`/dashboard/exercises/${exercise.exerciseId}`}
                  className="-mx-2 flex items-baseline justify-between gap-3 rounded-lg px-2 py-2 hover:bg-muted"
                >
                  <span className="min-w-0 truncate">
                    {exercise.name}
                    {exercise.isArchived && (
                      <span className="ml-2 text-sm text-muted-foreground">archiviert</span>
                    )}
                  </span>
                  <span className="shrink-0 text-right text-sm text-muted-foreground tabular-nums">
                    {exercise.sessionCount}× · {formatPerformedOnInYear(exercise.lastPerformedOn, today)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
