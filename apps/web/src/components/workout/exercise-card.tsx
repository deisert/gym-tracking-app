"use client";

import { useState, useTransition } from "react";

import { removeWorkoutExercise, updateExercise } from "@/app/workout/actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SetList } from "@/components/workout/set-list";
import { SwipeableRow, SwipeGroupProvider } from "@/components/ui/swipeable-row";
import type { LastPerformance, WorkoutExerciseDetail } from "@gymtrack/core";

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
  const { exercise } = workoutExercise;
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState({ name: exercise.name, note: exercise.note ?? "" });
  const [editError, setEditError] = useState<string | null>(null);
  const [, startSave] = useTransition();

  function save() {
    const note = draft.note.trim() || null;
    if (draft.name.trim() === exercise.name && note === exercise.note) return;
    startSave(async () => {
      const result = await updateExercise(exercise.id, { name: draft.name, note });
      setEditError(result.ok ? null : result.error);
    });
  }

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
          deleteLabel={`${exercise.name} entfernen`}
          onDelete={remove}
        >
          <header className="flex items-start justify-between gap-2">
            <div>
              <h3 className="font-medium">{exercise.name}</h3>
              {exercise.note && !isEditing && (
                <p className="mt-1 text-sm text-muted-foreground">{exercise.note}</p>
              )}
              {lastSummary && (
                <p className="mt-1 text-sm text-muted-foreground tabular-nums">{lastSummary}</p>
              )}
              {/* A dropped delete (RLS filtered it, or the network went) otherwise
                  leaves the card sitting there with nothing said. */}
              {removeError && (
                <p className="mt-1 text-sm text-destructive">{removeError}</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => setIsEditing((open) => !open)}
              aria-expanded={isEditing}
              className="min-h-11 shrink-0 text-sm text-muted-foreground"
            >
              {isEditing ? "Fertig" : "Bearbeiten"}
            </button>
          </header>
        </SwipeableRow>
      </SwipeGroupProvider>

      {isEditing && (
        <div className="mt-3 flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor={`exercise-name-${workoutExercise.id}`}>Name</Label>
            <Input
              id={`exercise-name-${workoutExercise.id}`}
              className="min-h-11"
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              onBlur={save}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor={`exercise-note-${workoutExercise.id}`}>Notiz</Label>
            <Input
              id={`exercise-note-${workoutExercise.id}`}
              className="min-h-11"
              value={draft.note}
              placeholder="Griff, Sitzposition …"
              onChange={(event) => setDraft({ ...draft, note: event.target.value })}
              onBlur={save}
            />
          </div>

          {editError && <p className="text-sm text-destructive">{editError}</p>}
        </div>
      )}

      <SetList
        workoutId={workoutId}
        workoutExerciseId={workoutExercise.id}
        sets={workoutExercise.sets}
        lastPerformance={lastPerformance}
      />
    </article>
  );
}
