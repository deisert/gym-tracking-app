"use client";

import { useTransition } from "react";

import { Button } from "@/components/ui/button";
import { localDateString } from "@/lib/dates";
import { startWorkout } from "@/app/workout/actions";

export function StartWorkoutButton() {
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      size="lg"
      className="min-h-14 w-full text-base"
      disabled={isPending}
      onClick={() =>
        // The client's own date — see the note in the plan's Task 7 header.
        startTransition(() => {
          void startWorkout(localDateString(new Date()));
        })
      }
    >
      {isPending ? "Wird gestartet …" : "Workout starten"}
    </Button>
  );
}
