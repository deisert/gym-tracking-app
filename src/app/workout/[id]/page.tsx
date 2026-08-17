import { notFound } from "next/navigation";

import { WorkoutHeader } from "@/components/workout/workout-header";
import { getWorkoutDetail } from "@/lib/data/workouts";

export default async function WorkoutPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // `params` is a Promise in this Next.js version — see the Global Constraints.
  const { id } = await params;

  // RLS means a foreign or missing id simply returns nothing.
  const workout = await getWorkoutDetail(id);
  if (!workout) notFound();

  return (
    <main className="mx-auto w-full max-w-md p-4">
      <WorkoutHeader
        workoutId={workout.id}
        performedOn={workout.performed_on}
        category={workout.category}
        note={workout.note}
      />

      <p className="mt-8 text-sm text-muted-foreground">
        Noch keine Übung in diesem Workout.
      </p>
    </main>
  );
}
