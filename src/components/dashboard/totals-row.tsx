import { formatMovedWeight } from "@/lib/workout-summary";

const COUNT_FORMAT = new Intl.NumberFormat("de-DE");

type Props = { totals: { workoutCount: number; setCount: number; volumeKg: number } };

/** „Seit Beginn“: the odometer. Never zero once anything is logged. */
export function TotalsRow({ totals }: Props) {
  const items = [
    { label: totals.workoutCount === 1 ? "Workout" : "Workouts", value: COUNT_FORMAT.format(totals.workoutCount) },
    { label: totals.setCount === 1 ? "Satz" : "Sätze", value: COUNT_FORMAT.format(totals.setCount) },
    { label: "bewegt", value: formatMovedWeight(totals.volumeKg) },
  ];

  return (
    <dl className="grid grid-cols-3 gap-3">
      {items.map((item) => (
        <div key={item.label} className="flex flex-col-reverse">
          <dt className="text-sm text-muted-foreground">{item.label}</dt>
          <dd className="text-2xl leading-tight font-bold tabular-nums">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
