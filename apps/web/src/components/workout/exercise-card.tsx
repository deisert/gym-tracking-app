"use client";

import { useState, useTransition } from "react";

import { removeWorkoutExercise } from "@/app/workout/actions";
import { SetList } from "@/components/workout/set-list";
import { SwipeableRow, SwipeGroupProvider } from "@/components/ui/swipeable-row";
import type { LastPerformance, WorkoutExerciseDetail } from "@/lib/types";

type Props = {
  workoutId: string;
  workoutExercise: WorkoutExerciseDetail;
  /** "12. Aug: 80 × 8 · 82,5 × 6", or null when there is no previous session. */
  lastSummary: string | null;
  lastPerformance: LastPerformance;
};

export function ExerciseCard({
  workoutId,
  workoutExercise,
  lastSummary,
  lastPerformance,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [removeError, setRemoveError] = useState<string | null>(null);

  function remove() {
    // A tap on the revealed button while a previous removal is still in
    // flight would otherwise dispatch a second one for the same exercise.
    if (isPending) return;
    startTransition(async () => {
      const result = await removeWorkoutExercise(workoutId, workoutExercise.id);
      setRemoveError(result.ok ? null : result.error);
    });
  }

  return (
    <article className="rounded-xl bg-card p-4">
      <SwipeGroupProvider>
        <SwipeableRow
          id={workoutExercise.id}
          deleteLabel={`${workoutExercise.exercise.name} entfernen`}
          onDelete={remove}
        >
          <header className="flex items-start justify-between gap-2">
            <div>
              <h3 className="font-medium">{workoutExercise.exercise.name}</h3>
              {lastSummary && (
                <p className="mt-1 text-sm text-muted-foreground tabular-nums">{lastSummary}</p>
              )}
              {/* A dropped delete (RLS filtered it, or the network went) otherwise
                  leaves the card sitting there with nothing said. */}
              {removeError && (
                <p className="mt-1 text-sm text-destructive">{removeError}</p>
              )}
            </div>
          </header>
        </SwipeableRow>
      </SwipeGroupProvider>

      <SetList
        workoutId={workoutId}
        workoutExerciseId={workoutExercise.id}
        sets={workoutExercise.sets}
        lastPerformance={lastPerformance}
      />
    </article>
  );
}
