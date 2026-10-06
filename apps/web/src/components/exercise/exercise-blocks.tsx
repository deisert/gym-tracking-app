import Link from "next/link";
import type { ReactNode } from "react";

import { Card, CardContent } from "@/components/ui/card";
import { formatMonthYear, formatPerformedOnInYear } from "@/lib/dates";
import {
  formatLastTrained,
  formatSessionExtras,
  formatSessionSets,
  type Bests,
  type RepRow,
} from "@/lib/exercise-detail";
import { formatLift } from "@/lib/records";
import { formatWeight } from "@/lib/sets";
import type { DatedLift, ExerciseInfo, ExerciseSession } from "@/lib/types";

/** "100 × 3" — the tile's second line already says kg. */
function shortLift(lift: DatedLift): string {
  return lift.weightKg === 0 ? `${lift.reps} Wdh.` : `${formatWeight(lift.weightKg)} × ${lift.reps}`;
}

/** Name, how much history there is, the setup note (spec §4.1). */
export function ExerciseHeader({
  exercise,
  trained,
  today,
}: {
  exercise: ExerciseInfo;
  trained: ExerciseSession[] | null;
  today: string;
}) {
  const first = trained?.[0];
  const last = trained?.[trained.length - 1];

  return (
    <header>
      <Link href="/dashboard" className="inline-flex min-h-11 items-center text-sm text-muted-foreground">
        ← Dashboard
      </Link>
      <h1 className="text-xl font-semibold">
        {exercise.name}
        {exercise.isArchived && (
          <span className="ml-2 align-middle text-sm font-normal text-muted-foreground">archiviert</span>
        )}
      </h1>
      {first && last && (
        <p className="mt-1 text-sm text-muted-foreground tabular-nums">
          {trained.length} {trained.length === 1 ? "Session" : "Sessions"} seit{" "}
          {formatMonthYear(first.performedOn)} · zuletzt {formatLastTrained(last.performedOn, today)}
        </p>
      )}
      {exercise.note && <p className="mt-2 text-sm">„{exercise.note}“</p>}
    </header>
  );
}

function Tile({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <Card>
      <CardContent className="px-4">
        <dl>
          <dt className="text-sm text-muted-foreground">{label}</dt>
          <dd className="text-2xl leading-tight font-bold">{value}</dd>
          <dd className="mt-1 text-sm text-muted-foreground tabular-nums">{detail}</dd>
        </dl>
      </CardContent>
    </Card>
  );
}

/**
 * „Letzte Session“ next to „Bestwert“ — two numbers, no delta (spec §4.2):
 * a percentage against a best from a year ago would report the gap, not the
 * training, and the reader can compare two numbers on their own.
 */
export function LastVsBestTiles({
  last,
  bests,
  repsMode,
  today,
}: {
  last: ExerciseSession;
  bests: Bests;
  repsMode: boolean;
  today: string;
}) {
  const lastDate = formatPerformedOnInYear(last.performedOn, today);

  if (repsMode) {
    const best = bests.mostReps!;
    return (
      <div className="grid grid-cols-2 gap-3">
        <Tile
          label="Letzte Session"
          value={`${last.maxReps} Wdh.`}
          detail={`${last.totalReps} gesamt · ${lastDate}`}
        />
        <Tile
          label="Meiste Wdh."
          value={`${best.reps} Wdh.`}
          detail={
            best.workoutId === last.workoutId
              ? "in der letzten Session"
              : formatPerformedOnInYear(best.performedOn, today)
          }
        />
      </div>
    );
  }

  const best = bests.e1rm!;
  const lastBest = last.bestE1rm!;
  return (
    <div className="grid grid-cols-2 gap-3">
      <Tile
        label="Letzte Session"
        value={formatLift(last.top!.weightKg, last.top!.reps)}
        detail={`e1RM ${formatWeight(lastBest.e1rmKg)} · ${lastDate}`}
      />
      <Tile
        label="Bester e1RM"
        value={`${formatWeight(best.e1rmKg)} kg`}
        detail={
          best.workoutId === last.workoutId
            ? "in der letzten Session"
            : `${shortLift(best)} · ${formatPerformedOnInYear(best.performedOn, today)}`
        }
      />
    </div>
  );
}

function LiftRow({ label, value, date }: { label: ReactNode; value: string; date: string }) {
  return (
    <li className="flex items-baseline justify-between gap-3">
      <span className="min-w-0 truncate">{label}</span>
      <span className="shrink-0 text-right tabular-nums">
        <span className="font-semibold">{value}</span>
        <span className="ml-3 inline-block min-w-20 text-sm text-muted-foreground">{date}</span>
      </span>
    </li>
  );
}

/**
 * „Bestwerte“ (spec §4.4): the heaviest set, then the most reps at each
 * weight — the number to beat at the weight on the bar.
 */
export function BestsBlock({
  heaviest,
  reps,
  today,
}: {
  heaviest: DatedLift;
  reps: { recent: RepRow[]; rest: RepRow[] };
  today: string;
}) {
  const repRow = (row: RepRow) => (
    <LiftRow
      key={row.weightKg}
      label={<span className="tabular-nums">{formatWeight(row.weightKg)} kg</span>}
      value={`${row.reps} Wdh.`}
      date={formatPerformedOnInYear(row.performedOn, today)}
    />
  );

  return (
    <div>
      <ul className="flex flex-col gap-3">
        <LiftRow
          label="Schwerster Satz"
          value={formatLift(heaviest.weightKg, heaviest.reps)}
          date={formatPerformedOnInYear(heaviest.performedOn, today)}
        />
      </ul>

      <h3 className="mt-6 text-sm text-muted-foreground">Wiederholungen je Gewicht</h3>
      <ul className="mt-3 flex flex-col gap-2">{reps.recent.map(repRow)}</ul>
      {reps.rest.length > 0 && (
        // Native disclosure: no client JavaScript for a list that only expands.
        <details className="mt-2">
          <summary className="flex min-h-11 cursor-pointer items-center text-sm text-muted-foreground">
            Alle Gewichte ({reps.recent.length + reps.rest.length})
          </summary>
          <ul className="mt-1 flex flex-col gap-2">{reps.rest.map(repRow)}</ul>
        </details>
      )}
    </div>
  );
}

/**
 * „Sessions“ (spec §4.5), newest first, a heading per year. Each links to the
 * workout — editing lives there, not here.
 */
export function SessionList({
  sessions,
  total,
  showAllHref,
  today,
}: {
  /** Newest first, already cut to what is shown. */
  sessions: ExerciseSession[];
  total: number;
  /** Set when more exist than are shown. */
  showAllHref: string | null;
  today: string;
}) {
  const years: { year: string; sessions: ExerciseSession[] }[] = [];
  for (const session of sessions) {
    const year = session.performedOn.slice(0, 4);
    const current = years[years.length - 1];
    if (current?.year === year) current.sessions.push(session);
    else years.push({ year, sessions: [session] });
  }

  return (
    <div>
      {years.map(({ year, sessions: inYear }, index) => (
        <div key={year} className={index > 0 ? "mt-6" : undefined}>
          <h3 className="text-sm font-medium text-muted-foreground tabular-nums">{year}</h3>
          <ul className="mt-2 flex flex-col">
            {inYear.map((session) => (
              <li key={session.workoutId}>
                <SessionRow session={session} today={today} />
              </li>
            ))}
          </ul>
        </div>
      ))}
      {showAllHref && (
        <Link
          href={showAllHref}
          scroll={false}
          className="mt-4 flex min-h-11 items-center justify-center rounded-xl bg-muted text-sm font-medium"
        >
          Alle {total} Sessions
        </Link>
      )}
    </div>
  );
}

function SessionRow({ session, today }: { session: ExerciseSession; today: string }) {
  const summary = formatSessionSets(session);
  const extras = formatSessionExtras(session);

  return (
    <Link
      href={`/workout/${session.workoutId}`}
      className="-mx-2 block rounded-lg px-2 py-2 hover:bg-muted"
    >
      <div className="flex items-baseline justify-between gap-3">
        <p className="min-w-0 truncate">
          {formatPerformedOnInYear(session.performedOn, today)}
          {session.category && <span className="text-muted-foreground"> · {session.category}</span>}
        </p>
        {session.bestE1rm && session.bestE1rm.weightKg > 0 && (
          <p className="shrink-0 text-sm text-muted-foreground tabular-nums">
            e1RM {formatWeight(session.bestE1rm.e1rmKg)}
          </p>
        )}
      </div>
      <p className="text-sm tabular-nums">
        {summary || "nur Aufwärmsätze"}
        {summary && session.warmupCount > 0 && (
          <span className="text-muted-foreground">
            {" "}
            · +{session.warmupCount} {session.warmupCount === 1 ? "Aufwärmsatz" : "Aufwärmsätze"}
          </span>
        )}
      </p>
      {extras && <p className="text-sm text-muted-foreground">{extras}</p>}
      {session.notes.map((note) => (
        <p key={note} className="text-sm text-muted-foreground">
          „{note}“
        </p>
      ))}
    </Link>
  );
}
