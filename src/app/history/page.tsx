import { WorkoutList } from "@/components/workout/workout-list";
import { listRecentWorkouts } from "@/lib/data/workouts";

export default async function HistoryPage() {
  const workouts = await listRecentWorkouts(100);

  return (
    <main className="mx-auto w-full max-w-md p-4">
      <h1 className="text-xl font-semibold">Verlauf</h1>

      <WorkoutList
        workouts={workouts}
        emptyText="Noch keine Workouts. Sobald du eins loggst, steht es hier."
        className="mt-6"
      />
    </main>
  );
}
