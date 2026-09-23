import { ExerciseList } from "@/components/dashboard/exercise-list";
import { RecordsList } from "@/components/dashboard/records-list";
import { BlockError, DashboardSection } from "@/components/dashboard/section";
import { StatTiles } from "@/components/dashboard/stat-tiles";
import { StreakLine } from "@/components/dashboard/streak-line";
import { TotalsRow } from "@/components/dashboard/totals-row";
import { WeekHeatmap } from "@/components/dashboard/week-heatmap";
import { StartWorkoutButton } from "@/components/workout/start-workout-button";
import { getDashboardData } from "@/lib/data/dashboard";
import { HEATMAP_WEEKS, heatmapColumns } from "@/lib/dashboard-heatmap";
import { currentStreak, sumTotals, thisWeek, weeklyAverage } from "@/lib/dashboard-weeks";
import { todayInAppTimezone } from "@/lib/dates";
import { pickRecords } from "@/lib/records";

/** Below this many trained workouts a top-5 ranking is noise (spec §2.5). */
const MIN_WORKOUTS_FOR_EXERCISES = 3;

/** The Ø line needs two completed weeks to be an average of anything. */
const MIN_WEEKS_FOR_RHYTHM = 2;

/**
 * Dashboard: consistency first, strength second (spec
 * docs/superpowers/specs/2026-09-03-dashboard-design.md, §10 wins over §2).
 *
 * A server component with no client island: every number is aggregated in
 * Postgres (`getDashboardData`) and shaped by pure functions in `src/lib/`.
 */
export default async function DashboardPage() {
  const today = todayInAppTimezone();
  const { weeks, days, records, exercises } = await getDashboardData(today);

  // Nothing trained yet: one line of guidance and the primary action
  // (DESIGN_SYSTEM.md §5) — not six empty blocks. Only when the query
  // succeeded: a failed query is not an empty log.
  if (weeks !== null && weeks.length === 0) {
    return (
      <main className="mx-auto w-full max-w-md p-4">
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <p className="mt-6 text-sm text-muted-foreground">
          Noch keine Workouts geloggt. Starte dein erstes und das Dashboard füllt sich.
        </p>
        <div className="mt-4">
          <StartWorkoutButton />
        </div>
      </main>
    );
  }

  const totals = weeks ? sumTotals(weeks) : null;
  const average = weeks ? weeklyAverage(weeks, today) : null;

  return (
    <main className="mx-auto w-full max-w-md p-4">
      <h1 className="text-xl font-semibold">Dashboard</h1>

      <DashboardSection title="Diese Woche">
        {weeks ? <StatTiles week={thisWeek(weeks, today)} /> : <BlockError />}
      </DashboardSection>

      {weeks && average && average.weekCount >= MIN_WEEKS_FOR_RHYTHM && (
        <DashboardSection title="Rhythmus">
          <StreakLine streak={currentStreak(weeks, today)} average={average} />
        </DashboardSection>
      )}

      <DashboardSection title={`Letzte ${HEATMAP_WEEKS} Wochen`}>
        {days ? <WeekHeatmap columns={heatmapColumns(days, today)} /> : <BlockError />}
      </DashboardSection>

      <DashboardSection title="Neue Rekorde">
        {records ? (
          <RecordsList
            records={pickRecords(records)}
            hasHistory={(totals?.workoutCount ?? 0) >= 2}
          />
        ) : (
          <BlockError />
        )}
      </DashboardSection>

      {totals && totals.workoutCount >= MIN_WORKOUTS_FOR_EXERCISES && (
        <DashboardSection title="Deine Übungen">
          {exercises ? <ExerciseList exercises={exercises} /> : <BlockError />}
        </DashboardSection>
      )}

      <DashboardSection title="Seit Beginn">
        {totals ? <TotalsRow totals={totals} /> : <BlockError />}
      </DashboardSection>
    </main>
  );
}
