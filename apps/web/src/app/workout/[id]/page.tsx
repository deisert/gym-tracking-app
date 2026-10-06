import { notFound } from "next/navigation";

import { EndWorkoutButton } from "@/components/workout/end-workout-button";
import { ExerciseCard } from "@/components/workout/exercise-card";
import { ExercisePicker } from "@/components/workout/exercise-picker";
import { WorkoutHeader } from "@/components/workout/workout-header";
import { getLastPerformances, listExercises } from "@/lib/data/exercises";
import { getWorkoutDetail } from "@/lib/data/workouts";
import { formatPerformedOn } from "@/lib/dates";
import { formatSetSummary } from "@/lib/sets";
import { summarizeWorkout } from "@/lib/workout-summary";

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

  // One batched query for every exercise in the workout — never one per card.
  // `listExercises` needs nothing from the workout, so it rides along in parallel:
  // handing the picker its library here is what makes typing in it cost no
  // request at all.
  const [lastPerformances, exercises] = await Promise.all([
    getLastPerformances(
      workout.exercises.map((workoutExercise) => workoutExercise.exercise.id),
      workout.performed_on,
      workout.id
    ),
    listExercises(),
  ]);

  // Counted here rather than in the client: every set of this workout is
  // already loaded above, so the end-of-workout summary costs no extra query.
  const summary = summarizeWorkout(workout.exercises);

  return (
    <main className="mx-auto w-full max-w-md p-4">
      <WorkoutHeader
        workoutId={workout.id}
        performedOn={workout.performed_on}
        category={workout.category}
        note={workout.note}
      />

      <div className="mt-6 flex flex-col gap-4">
        {workout.exercises.map((workoutExercise) => {
          const lastPerformance =
            lastPerformances.get(workoutExercise.exercise.id) ?? null;
          const summary = lastPerformance ? formatSetSummary(lastPerformance.sets) : "";

          return (
            <ExerciseCard
              key={workoutExercise.id}
              workoutId={workout.id}
              workoutExercise={workoutExercise}
              lastPerformance={lastPerformance}
              lastSummary={
                lastPerformance && summary
                  ? `${formatPerformedOn(lastPerformance.performedOn)}: ${summary}`
                  : null
              }
            />
          );
        })}
      </div>

      {workout.exercises.length === 0 && (
        <p className="mt-6 text-sm text-muted-foreground">
          Noch keine Übung in diesem Workout.
        </p>
      )}

      <div className="mt-6 flex flex-col gap-3">
        <ExercisePicker workoutId={workout.id} exercises={exercises} />
        <EndWorkoutButton summary={summary} />
      </div>
    </main>
  );
}
