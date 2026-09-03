"use client";

import Link from "next/link";
import { useCallback, useRef, useState, useTransition } from "react";

import { deleteWorkout } from "@/app/workout/actions";
import { SwipeableRow, SwipeGroupProvider } from "@/components/ui/swipeable-row";
import { formatPerformedOn } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { WorkoutSummary } from "@/lib/types";

type Props = {
  workouts: WorkoutSummary[];
  /** Shown instead of the list when there is nothing left to show. */
  emptyText: string;
  /** Spacing the surrounding section wants — it differs per page. */
  className?: string;
};

/**
 * The workout list, swipeable-to-delete.
 *
 * A client island inside otherwise server-rendered pages: `SwipeableRow` needs
 * pointer events, but the data around it does not.
 *
 * Deleting a whole workout takes every exercise and set of that day with it,
 * so these rows opt out of full-swipe-through (`commitThreshold: Infinity`) —
 * a long flick past a row can reveal "Löschen", never fire it.
 */
export function WorkoutList({ workouts, emptyText, className }: Props) {
  // Removed client-side the moment the swipe commits: a hundred rows of
  // history must not sit there waiting for a round trip. Restored if the
  // server says no.
  const [removedIds, setRemovedIds] = useState<ReadonlySet<string>>(() => new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [, startTransition] = useTransition();
  /** Ids with a delete already dispatched — a second tap must not send another. */
  const inFlightRef = useRef<Set<string>>(new Set());

  const remove = useCallback((workoutId: string) => {
    if (inFlightRef.current.has(workoutId)) return;
    inFlightRef.current.add(workoutId);

    setRemovedIds((current) => new Set(current).add(workoutId));
    setErrors((current) => {
      if (!(workoutId in current)) return current;
      const next = { ...current };
      delete next[workoutId];
      return next;
    });

    startTransition(async () => {
      const result = await deleteWorkout(workoutId);
      inFlightRef.current.delete(workoutId);
      if (result.ok) return;

      // A dropped delete (RLS filtered it, or the network went) must put the
      // workout back rather than leave a session that only looks deleted.
      setRemovedIds((current) => {
        const next = new Set(current);
        next.delete(workoutId);
        return next;
      });
      setErrors((current) => ({ ...current, [workoutId]: result.error }));
    });
  }, []);

  const visible = workouts.filter((workout) => !removedIds.has(workout.id));

  if (visible.length === 0) {
    return <p className={cn("text-sm text-muted-foreground", className)}>{emptyText}</p>;
  }

  return (
    <ul className={cn("flex flex-col gap-2", className)}>
      <SwipeGroupProvider>
        {visible.map((workout) => (
          <li key={workout.id}>
            <SwipeableRow
              id={workout.id}
              deleteLabel={`Workout vom ${formatPerformedOn(workout.performed_on)} löschen`}
              onDelete={() => remove(workout.id)}
              commitThreshold={Number.POSITIVE_INFINITY}
            >
              <Link
                href={`/workout/${workout.id}`}
                draggable={false}
                className="flex min-h-14 items-center justify-between rounded-xl bg-card px-4 [-webkit-touch-callout:none]"
              >
                <span className="font-medium">
                  {formatPerformedOn(workout.performed_on)}
                  {workout.category ? ` · ${workout.category}` : ""}
                </span>
                <span className="text-sm text-muted-foreground tabular-nums">
                  {workout.exerciseCount} Übungen · {workout.setCount} Sätze
                </span>
              </Link>

              {errors[workout.id] && (
                <p className="px-4 pt-1 text-sm text-destructive">{errors[workout.id]}</p>
              )}
            </SwipeableRow>
          </li>
        ))}
      </SwipeGroupProvider>
    </ul>
  );
}
