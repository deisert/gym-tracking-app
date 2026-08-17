import Link from "next/link";

import { logout } from "@/app/login/actions";
import { StartWorkoutButton } from "@/components/workout/start-workout-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { countWorkoutsSince, listRecentWorkouts } from "@/lib/data/workouts";
import { formatPerformedOn, startOfWeekMonday, todayInAppTimezone } from "@/lib/dates";
import { createServerSupabase } from "@/lib/supabase/server";

export default async function HomePage() {
  const supabase = await createServerSupabase();
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .maybeSingle();

  const weekStart = startOfWeekMonday(new Date(`${todayInAppTimezone()}T12:00:00`));
  const [thisWeek, recent] = await Promise.all([
    countWorkoutsSince(weekStart),
    listRecentWorkouts(5),
  ]);

  return (
    <main className="mx-auto w-full max-w-md p-4">
      <header className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold">GymTrack</h1>
        <form action={logout}>
          <Button type="submit" variant="ghost" size="sm" className="text-muted-foreground">
            Abmelden
          </Button>
        </form>
      </header>

      <p className="mt-1 text-sm text-muted-foreground">
        Hallo {profile?.display_name ?? "du"}
      </p>

      <Card className="mt-6">
        <CardContent className="flex items-baseline gap-3 p-4">
          <span className="text-4xl font-bold tabular-nums">{thisWeek}</span>
          <span className="text-sm text-muted-foreground">
            {thisWeek === 1 ? "Workout diese Woche" : "Workouts diese Woche"}
          </span>
        </CardContent>
      </Card>

      <div className="mt-6">
        <StartWorkoutButton />
      </div>

      <section className="mt-8">
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Zuletzt
        </h2>

        {recent.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            Noch kein Workout geloggt. Starte dein erstes.
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {recent.map((workout) => (
              <li key={workout.id}>
                <Link
                  href={`/workout/${workout.id}`}
                  className="flex min-h-14 items-center justify-between rounded-xl bg-card px-4"
                >
                  <span className="font-medium">
                    {formatPerformedOn(workout.performed_on)}
                    {workout.category ? ` · ${workout.category}` : ""}
                  </span>
                  <span className="text-sm text-muted-foreground tabular-nums">
                    {workout.exerciseCount} Übungen · {workout.setCount} Sätze
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
