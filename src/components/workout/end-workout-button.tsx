"use client";

import { useState, useTransition } from "react";

import { endWorkout } from "@/app/workout/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatKilos, formatVolume } from "@/lib/workout-summary";
import type { WorkoutSummaryStats } from "@/lib/workout-summary";

function setsLabel(count: number): string {
  return count === 1 ? "Satz" : "Sätze";
}

/**
 * "Workout beenden" — shows what was logged, then returns to the overview.
 *
 * `summary` is counted on the server from the same workout data the page
 * already renders, so the numbers are the persisted ones. A row still being
 * typed into is not in them: that is the point of "abgeschlossene Sätze".
 */
export function EndWorkoutButton({ summary }: { summary: WorkoutSummaryStats }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  return (
    <>
      <Button
        variant="secondary"
        size="lg"
        className="min-h-14 w-full text-base"
        onClick={() => setIsOpen(true)}
      >
        Workout beenden
      </Button>

      <Dialog
        open={isOpen}
        // Dismissing mid-navigation would leave the button enabled again while
        // the redirect is still on its way.
        onOpenChange={(open) => {
          if (!isPending) setIsOpen(open);
        }}
      >
        {/* `sm:max-w-md` overrides DialogContent's own `sm:max-w-sm`, which
            survives twMerge — same reason as in the exercise picker. */}
        <DialogContent className="w-full max-w-md sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Geschafft</DialogTitle>
          </DialogHeader>

          {summary.setCount === 0 ? (
            <p className="text-sm text-muted-foreground">
              Noch kein Satz geloggt – du kannst trotzdem beenden und später weitermachen.
            </p>
          ) : (
            <div className="flex flex-col gap-4">
              {/* Two hero numbers, side by side: what you did, and what it
                  weighed. DESIGN_SYSTEM.md §3 — the numerals are the content. */}
              <dl className="grid grid-cols-2 gap-3">
                {/* `flex-col-reverse` puts the number on top visually while the
                    DOM keeps the label first — a <dd> may not precede its <dt>. */}
                <div className="flex flex-col-reverse">
                  <dt className="text-sm text-muted-foreground">
                    {setsLabel(summary.setCount)} in {summary.exerciseCount}{" "}
                    {summary.exerciseCount === 1 ? "Übung" : "Übungen"}
                  </dt>
                  <dd className="text-3xl leading-tight font-bold tabular-nums">
                    {summary.setCount}
                  </dd>
                </div>

                <div className="flex flex-col-reverse">
                  <dt className="text-sm text-muted-foreground">kg bewegt</dt>
                  <dd className="text-3xl leading-tight font-bold tabular-nums">
                    {formatKilos(summary.totalVolumeKg)}
                  </dd>
                </div>
              </dl>

              {summary.warmupSetCount > 0 && (
                <p className="-mt-2 text-sm text-muted-foreground tabular-nums">
                  davon {summary.warmupSetCount}{" "}
                  {summary.warmupSetCount === 1 ? "Aufwärmsatz" : "Aufwärmsätze"}
                </p>
              )}

              <ul className="flex max-h-[40dvh] flex-col gap-2 overflow-y-auto">
                {summary.perExercise.map((entry) => (
                  <li key={entry.id} className="flex items-baseline justify-between gap-3">
                    <span>{entry.name}</span>
                    <span className="shrink-0 text-sm text-muted-foreground tabular-nums">
                      {entry.setCount} {setsLabel(entry.setCount)} · {formatVolume(entry.volumeKg)}
                    </span>
                  </li>
                ))}
              </ul>

              {/* Otherwise a pull-up-only session just reads "0 kg bewegt" and
                  looks like a bug. `weight_kg = 0` is the bodyweight
                  convention (CONCEPT.md §4, open question 4). */}
              {summary.totalVolumeKg === 0 && (
                <p className="text-sm text-muted-foreground">
                  Körpergewichtssätze zählen mit 0 kg – dafür fehlt noch dein Körpergewicht.
                </p>
              )}
            </div>
          )}

          <div className="mt-1 flex flex-col gap-2">
            <Button
              size="lg"
              className="min-h-12 w-full text-base"
              disabled={isPending}
              onClick={() =>
                // Async and awaited so React tracks the transition and the
                // button stays disabled until the redirect lands — same
                // reasoning as `StartWorkoutButton`.
                startTransition(async () => {
                  await endWorkout();
                })
              }
            >
              {isPending ? "Wird beendet …" : "Zur Übersicht"}
            </Button>

            <Button
              variant="ghost"
              className="min-h-12 w-full"
              disabled={isPending}
              onClick={() => setIsOpen(false)}
            >
              Weiter loggen
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
