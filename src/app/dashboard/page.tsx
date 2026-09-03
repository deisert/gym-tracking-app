import { StartWorkoutButton } from "@/components/workout/start-workout-button";

/**
 * Dashboard: consistency + per-exercise progress (CONCEPT.md §2.9, §6).
 *
 * Deliberately empty for now — DESIGN_SYSTEM.md §5 "Empty states" spec for
 * this screen: one line of guidance + one primary action. Wire up the
 * heatmap and progress charts once there is data to show.
 */
export default function DashboardPage() {
  return (
    <main className="mx-auto w-full max-w-md p-4">
      <h1 className="text-xl font-semibold">Dashboard</h1>

      <p className="mt-6 text-sm text-muted-foreground">
        Noch keine Workouts geloggt. Starte dein erstes und die Charts füllen sich.
      </p>

      <div className="mt-4">
        <StartWorkoutButton />
      </div>
    </main>
  );
}
