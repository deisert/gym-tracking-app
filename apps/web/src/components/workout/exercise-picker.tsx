"use client";

import { useMemo, useState, useTransition } from "react";

import {
  addExerciseToWorkout,
  findOrCreateExercise,
} from "@/app/workout/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { filterExercises } from "@/lib/exercise-search";
import type { ExercisePickerOption } from "@/lib/exercise-search";

export function ExercisePicker({
  workoutId,
  exercises,
}: {
  workoutId: string;
  exercises: ExercisePickerOption[];
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Filtering happens here rather than on the server on purpose. The library
  // arrives as a prop from the workout page, already sorted recently-used-first,
  // so narrowing it is a string match over a few dozen rows — no request, no
  // debounce, no stale-result race. It used to be a debounced server action per
  // keystroke, which this Next.js version dispatches sequentially per client:
  // on gym cellular the queue was the whole of the latency.
  const options = useMemo(() => filterExercises(exercises, query), [exercises, query]);

  const trimmedQuery = query.trim();
  const hasExactMatch = options.some(
    (option) => option.name.toLowerCase() === trimmedQuery.toLowerCase()
  );

  function handleOpenChange(open: boolean) {
    setIsOpen(open);
    // Dismissing via Escape or the backdrop bypasses addExisting/createAndAdd,
    // so this is the only place a close-without-success can clear a stale error
    // before the sheet is reopened for an unrelated exercise. The query goes
    // too, so a reopen starts on the full recently-used list rather than the
    // previous filter.
    if (!open) {
      setError(null);
      setQuery("");
    }
  }

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
      // If findOrCreateExercise succeeds but addExerciseToWorkout below fails,
      // the exercise is left in the library unlinked to this workout. That's
      // fine: a retry re-resolves the same name idempotently via the
      // server's case-insensitive lookup instead of creating a duplicate.
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

      <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      {/* `sm:max-w-md` is not redundant: DialogContent ships `sm:max-w-sm`,
          which survives twMerge (different variant group) and would shrink the
          sheet to 384px on anything wider than 640px.
          Anchored to the TOP (not bottom): the search input above autoFocuses,
          so the mobile keyboard is open from the first frame. A bottom sheet
          would put the title/search input right where the keyboard covers
          them; anchoring top keeps both visible above the keyboard instead
          (user feedback 2026-08-20, screenshot: docs stored in chat history). */}
      <DialogContent className="inset-x-0 top-0 bottom-auto mx-auto max-h-[85dvh] w-full max-w-md translate-x-0 translate-y-0 rounded-t-none rounded-b-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Übung wählen</DialogTitle>
        </DialogHeader>

        <Input
          autoFocus
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setError(null);
          }}
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

          {exercises.length === 0 && (
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
