import { notFound } from "next/navigation";

import { ExerciseCard } from "@/components/workout/exercise-card";
import { ExercisePicker } from "@/components/workout/exercise-picker";
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

      <div className="mt-6 flex flex-col gap-4">
        {workout.exercises.map((workoutExercise) => (
          <ExerciseCard
            key={workoutExercise.id}
            workoutId={workout.id}
            workoutExercise={workoutExercise}
            lastSummary={null}
          />
        ))}
      </div>

      {workout.exercises.length === 0 && (
        <p className="mt-6 text-sm text-muted-foreground">
          Noch keine Übung in diesem Workout.
        </p>
      )}

      <div className="mt-6">
        <ExercisePicker workoutId={workout.id} />
      </div>
    </main>
  );
}
