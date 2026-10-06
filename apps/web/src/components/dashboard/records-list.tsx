import Link from "next/link";

import { formatPerformedOn } from "@/lib/dates";
import { formatLift, recordLabel } from "@/lib/records";
import type { ExerciseRecord } from "@/lib/types";

type Props = {
  records: ExerciseRecord[];
  /** At least two trained workouts — a second session of something is possible. */
  hasHistory: boolean;
};

export function RecordsList({ records, hasHistory }: Props) {
  if (records.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {hasHistory
          ? "In den letzten 30 Tagen kein neuer Bestwert."
          : "Ab der zweiten Session einer Übung erscheinen hier deine Bestwerte."}
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-1">
      {records.map((record) => (
        <li key={record.exerciseId}>
          <Link
            href={`/dashboard/exercises/${record.exerciseId}`}
            className="-mx-2 flex items-baseline justify-between gap-3 rounded-lg px-2 py-1 hover:bg-muted"
          >
            <div className="min-w-0">
              <p className="truncate">{record.exerciseName}</p>
              <p className="text-sm text-muted-foreground">{recordLabel(record)}</p>
            </div>
            <div className="shrink-0 text-right tabular-nums">
              <p className="font-semibold">{formatLift(record.weightKg, record.reps)}</p>
              <p className="text-sm text-muted-foreground">{formatPerformedOn(record.performedOn)}</p>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
