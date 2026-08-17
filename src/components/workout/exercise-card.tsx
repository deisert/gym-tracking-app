"use client";

import { useTransition } from "react";

import { removeWorkoutExercise } from "@/app/workout/actions";
import { Button } from "@/components/ui/button";
import type { WorkoutExerciseDetail } from "@/lib/types";

type Props = {
  workoutId: string;
  workoutExercise: WorkoutExerciseDetail;
  /** "12. Aug: 80 × 8 · 82,5 × 6", or null when there is no previous session. */
  lastSummary: string | null;
};

export function ExerciseCard({ workoutId, workoutExercise, lastSummary }: Props) {
  const [isPending, startTransition] = useTransition();

  return (
    <article className="rounded-xl bg-card p-4">
      <header className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-medium">{workoutExercise.exercise.name}</h3>
          {lastSummary && (
            <p className="mt-1 text-sm text-muted-foreground tabular-nums">{lastSummary}</p>
          )}
        </div>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={isPending}
          className="text-muted-foreground"
          onClick={() =>
            startTransition(async () => {
              await removeWorkoutExercise(workoutId, workoutExercise.id);
            })
          }
        >
          Entfernen
        </Button>
      </header>
    </article>
  );
}
