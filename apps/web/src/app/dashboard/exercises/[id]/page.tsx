import { notFound } from "next/navigation";

import { BlockError, DashboardSection } from "@/components/dashboard/section";
import {
  BestsBlock,
  ExerciseHeader,
  LastVsBestTiles,
  SessionList,
} from "@/components/exercise/exercise-blocks";
import { ProgressChart } from "@/components/exercise/progress-chart";
import { getExerciseDetail } from "@/lib/data/exercise-detail";
import { todayInAppTimezone } from "@/lib/dates";
import {
  MIN_CHART_SESSIONS,
  MIN_SESSIONS_FOR_BESTS,
  SESSIONS_SHOWN,
  availableRanges,
  chartPoints,
  computeBests,
  groupSessions,
  isRepsMode,
  repTable,
  trainedSessions,
} from "@/lib/exercise-detail";

/**
 * One exercise: where it stands, how it got there, what was done
 * (docs/superpowers/specs/2026-09-30-exercise-detail-page-design.md).
 *
 * A server component; only the chart is a client island. Every block waits
 * until its number tells the truth (spec §2) instead of showing a thin version.
 */
export default async function ExercisePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  // Both are Promises in this Next.js version (AGENTS.md).
  const [{ id }, query] = await Promise.all([params, searchParams]);

  // RLS makes a foreign id and a missing one look the same.
  const detail = await getExerciseDetail(id);
  if (!detail) notFound();

  const today = todayInAppTimezone();
  const { exercise, sets } = detail;

  if (sets === null) {
    return (
      <main className="mx-auto w-full max-w-md p-4">
        <ExerciseHeader exercise={exercise} trained={null} today={today} />
        <div className="mt-8">
          <BlockError />
        </div>
      </main>
    );
  }

  const sessions = groupSessions(sets);
  const trained = trainedSessions(sessions);

  if (sessions.length === 0) {
    return (
      <main className="mx-auto w-full max-w-md p-4">
        <ExerciseHeader exercise={exercise} trained={trained} today={today} />
        <p className="mt-6 text-sm text-muted-foreground">Noch nicht trainiert.</p>
      </main>
    );
  }

  const repsMode = isRepsMode(trained);
  const bests = computeBests(trained);
  const points = chartPoints(trained);
  const ranges = availableRanges(points, today);
  const last = trained[trained.length - 1];

  const showAll = query.sessions === "alle";
  const newestFirst = [...sessions].reverse();
  const shown = showAll ? newestFirst : newestFirst.slice(0, SESSIONS_SHOWN);

  return (
    <main className="mx-auto w-full max-w-md p-4">
      <ExerciseHeader exercise={exercise} trained={trained} today={today} />

      {trained.length >= MIN_SESSIONS_FOR_BESTS && last && (
        <div className="mt-6">
          <LastVsBestTiles last={last} bests={bests} repsMode={repsMode} today={today} />
        </div>
      )}

      <DashboardSection title="Verlauf">
        {ranges.length > 0 ? (
          <ProgressChart points={points} ranges={ranges} repsMode={repsMode} today={today} />
        ) : (
          <p className="text-sm text-muted-foreground">
            Ab {MIN_CHART_SESSIONS} Sessions zeigt sich hier dein Verlauf.
          </p>
        )}
      </DashboardSection>

      {/* In reps mode the only best is „Meiste Wdh.“, which the tile already shows. */}
      {!repsMode && trained.length >= MIN_SESSIONS_FOR_BESTS && bests.heaviest && (
        <DashboardSection title="Bestwerte">
          <BestsBlock heaviest={bests.heaviest} reps={repTable(trained, today)} today={today} />
        </DashboardSection>
      )}

      <DashboardSection title="Sessions">
        <SessionList
          sessions={shown}
          total={sessions.length}
          showAllHref={shown.length < sessions.length ? `/dashboard/exercises/${exercise.id}?sessions=alle` : null}
          today={today}
        />
      </DashboardSection>
    </main>
  );
}
