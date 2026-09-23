import { formatPerformedOn } from "@/lib/dates";
import { HEATMAP_WEEKS } from "@/lib/dashboard-heatmap";
import { formatLift } from "@/lib/records";
import type { TopExercise } from "@/lib/types";

/** „Deine Übungen“. Rows become links once the exercise page exists (phase 2). */
export function ExerciseList({ exercises }: { exercises: TopExercise[] }) {
  if (exercises.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        In den letzten {HEATMAP_WEEKS} Wochen noch keine Arbeitssätze.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {exercises.map((exercise) => (
        <li key={exercise.exerciseId} className="flex items-baseline justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate">{exercise.exerciseName}</p>
            <p className="text-sm text-muted-foreground tabular-nums">
              {exercise.sessionCount}× in {HEATMAP_WEEKS} Wochen
            </p>
          </div>
          <div className="shrink-0 text-right tabular-nums">
            <p className="font-semibold">{formatLift(exercise.best.weightKg, exercise.best.reps)}</p>
            <p className="text-sm text-muted-foreground">
              Bestwert · {formatPerformedOn(exercise.best.performedOn)}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}
