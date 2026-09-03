import { logout } from "@/app/login/actions";
import { StartWorkoutButton } from "@/components/workout/start-workout-button";
import { WorkoutList } from "@/components/workout/workout-list";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { countWorkoutsSince, listRecentWorkouts } from "@/lib/data/workouts";
import { startOfWeekMonday, todayInAppTimezone } from "@/lib/dates";
import { createServerSupabase } from "@/lib/supabase/server";

/**
 * Verlauf: the merged Today/History screen (DESIGN_SYSTEM.md §4).
 *
 * One screen, no separate landing page — starting a workout and browsing
 * past ones happen in the same place: "Start workout" up top, this week's
 * count directly under it, then the full reverse-chronological list.
 */
export default async function VerlaufPage({
  searchParams,
}: {
  // A Promise in this Next.js version — see `src/app/login/page.tsx`.
  searchParams: Promise<{ error?: string }>;
}) {
  // `startWorkout` redirects here with ?error=start when the insert fails.
  // Without reading it, the app's primary action dead-ends on a silent screen.
  const { error } = await searchParams;

  const supabase = await createServerSupabase();
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .maybeSingle();

  const weekStart = startOfWeekMonday(new Date(`${todayInAppTimezone()}T12:00:00`));
  const [thisWeek, workouts] = await Promise.all([
    countWorkoutsSince(weekStart),
    listRecentWorkouts(100),
  ]);

  return (
    <main className="mx-auto w-full max-w-md p-4">
      <header className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold">Verlauf</h1>
        <form action={logout}>
          <Button type="submit" variant="ghost" size="sm" className="text-muted-foreground">
            Abmelden
          </Button>
        </form>
      </header>

      <p className="mt-1 text-sm text-muted-foreground">
        Hallo {profile?.display_name ?? "du"}
      </p>

      <div className="mt-6">
        <StartWorkoutButton />
        {error === "start" && (
          <p className="mt-2 text-sm text-destructive">
            Workout konnte nicht gestartet werden – versuch es noch einmal.
          </p>
        )}
      </div>

      <Card className="mt-6">
        <CardContent className="flex items-baseline gap-3 p-4">
          <span className="text-4xl font-bold tabular-nums">{thisWeek}</span>
          <span className="text-sm text-muted-foreground">
            {thisWeek === 1 ? "Workout diese Woche" : "Workouts diese Woche"}
          </span>
        </CardContent>
      </Card>

      <WorkoutList
        workouts={workouts}
        emptyText="Noch kein Workout geloggt. Starte dein erstes."
        className="mt-8"
      />
    </main>
  );
}
