"use client";

import { useEffect, useState, useTransition } from "react";

import {
  addExerciseToWorkout,
  findOrCreateExercise,
  searchExercisesAction,
} from "@/app/workout/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { ExerciseOption } from "@/lib/types";

export function ExercisePicker({ workoutId }: { workoutId: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<ExerciseOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;
    // Debounced so typing does not queue one action per keystroke — this
    // Next.js version dispatches server actions sequentially per client.
    const timer = setTimeout(() => {
      searchExercisesAction(query).then((result) => {
        if (!cancelled) setOptions(result);
      });
    }, 150);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, isOpen]);

  const trimmedQuery = query.trim();
  const hasExactMatch = options.some(
    (option) => option.name.toLowerCase() === trimmedQuery.toLowerCase()
  );

  function addExisting(exerciseId: string) {
    startTransition(async () => {
      const result = await addExerciseToWorkout(workoutId, exerciseId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setError(null);
      setQuery("");
      setIsOpen(false);
    });
  }

  function createAndAdd() {
    startTransition(async () => {
      const created = await findOrCreateExercise(trimmedQuery);
      if (!created.ok) {
        setError(created.error);
        return;
      }
      const added = await addExerciseToWorkout(workoutId, created.data.id);
      if (!added.ok) {
        setError(added.error);
        return;
      }
      setError(null);
      setQuery("");
      setIsOpen(false);
    });
  }

  return (
    <>
      <Button
        size="lg"
        className="min-h-14 w-full text-base"
        onClick={() => setIsOpen(true)}
      >
        Übung hinzufügen
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="inset-x-0 bottom-0 top-auto mx-auto max-h-[85dvh] w-full max-w-md translate-x-0 translate-y-0 rounded-b-none rounded-t-2xl">
        <DialogHeader>
          <DialogTitle>Übung wählen</DialogTitle>
        </DialogHeader>

        <Input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Suchen oder neu anlegen"
          aria-label="Übung suchen"
        />

        <ul className="mt-2 flex max-h-[50dvh] flex-col overflow-y-auto">
          {options.map((option) => (
            <li key={option.id}>
              <button
                type="button"
                disabled={isPending}
                onClick={() => addExisting(option.id)}
                className="flex min-h-12 w-full items-center justify-between text-left"
              >
                <span>{option.name}</span>
                {option.note && (
                  <span className="text-sm text-muted-foreground">{option.note}</span>
                )}
              </button>
            </li>
          ))}

          {trimmedQuery.length > 0 && !hasExactMatch && (
            <li>
              <button
                type="button"
                disabled={isPending}
                onClick={createAndAdd}
                className="flex min-h-12 w-full items-center text-left text-primary"
              >
                ＋ „{trimmedQuery}&ldquo; anlegen
              </button>
            </li>
          )}

          {options.length === 0 && trimmedQuery.length === 0 && (
            <li className="py-3 text-sm text-muted-foreground">
              Noch keine Übungen. Tippe einen Namen, um die erste anzulegen.
            </li>
          )}
        </ul>

        {error && <p className="text-sm text-destructive">{error}</p>}
      </DialogContent>
      </Dialog>
    </>
  );
}
