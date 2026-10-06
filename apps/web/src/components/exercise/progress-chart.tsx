"use client";

import { useState } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatPerformedOnInYear } from "@/lib/dates";
import {
  defaultRange,
  formatMonthTick,
  monthTicks,
  niceTicks,
  pointsInRange,
  type ChartMetric,
  type ChartPoint,
  type ChartRange,
} from "@/lib/exercise-detail";
import { formatLift } from "@/lib/records";
import { formatWeight } from "@/lib/sets";
import { usePrefersReducedMotion } from "@/lib/use-prefers-reduced-motion";
import { cn } from "@/lib/utils";
import { formatKilos, formatVolume } from "@/lib/workout-summary";

type MetricSpec = {
  label: string;
  /** Lines show a level, bars a quantity that starts at zero (spec §4.3). */
  form: "line" | "bar";
  color: string;
  value: (point: ChartPoint) => number;
  format: (value: number) => string;
  /** The tooltip's second line: what the headline value does not already say. */
  detail: (point: ChartPoint) => string;
  integer: boolean;
};

const METRICS: Record<ChartMetric, MetricSpec> = {
  e1rm: {
    label: "e1RM",
    form: "line",
    color: "var(--chart-2)",
    value: (p) => p.e1rmKg,
    format: (v) => `${formatWeight(v)} kg`,
    detail: (p) => `aus ${formatLift(p.topWeightKg, p.topReps)} · ${formatVolume(p.volumeKg)}`,
    integer: false,
  },
  top: {
    label: "Top-Satz",
    form: "line",
    color: "var(--chart-1)",
    value: (p) => p.topWeightKg,
    format: (v) => `${formatWeight(v)} kg`,
    detail: (p) => `× ${p.topReps} · e1RM ${formatWeight(p.e1rmKg)}`,
    integer: false,
  },
  volume: {
    label: "Volumen",
    form: "bar",
    color: "var(--chart-3)",
    value: (p) => p.volumeKg,
    format: formatVolume,
    detail: (p) => `Top-Satz ${formatLift(p.topWeightKg, p.topReps)}`,
    integer: false,
  },
  maxReps: {
    label: "Meiste Wdh.",
    form: "line",
    color: "var(--chart-2)",
    value: (p) => p.maxReps,
    format: (v) => `${v} Wdh.`,
    detail: (p) => `${p.totalReps} gesamt`,
    integer: true,
  },
  totalReps: {
    label: "Wdh. gesamt",
    form: "bar",
    color: "var(--chart-3)",
    value: (p) => p.totalReps,
    format: (v) => `${v} Wdh.`,
    detail: (p) => `beste Serie ${p.maxReps}`,
    integer: true,
  },
};

const RANGE_LABELS: Record<ChartRange, string> = { "3m": "3 M", "1y": "1 J", all: "Alles" };

const toMs = (iso: string) => {
  const [year, month, day] = iso.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
};

type Props = {
  points: ChartPoint[];
  ranges: ChartRange[];
  repsMode: boolean;
  /** The server's „today“ — never the browser clock, so server and client agree. */
  today: string;
};

/**
 * „Verlauf“: one point per session on a date axis (spec §4.3). The page's only
 * client component — the metric toggle and range chips are local state over
 * points the server already shaped.
 */
export function ProgressChart({ points, ranges, repsMode, today }: Props) {
  const metrics: ChartMetric[] = repsMode ? ["maxReps", "totalReps"] : ["e1rm", "top", "volume"];
  const [metric, setMetric] = useState<ChartMetric>(metrics[0]);
  const [range, setRange] = useState<ChartRange>(defaultRange(ranges));
  const reducedMotion = usePrefersReducedMotion();

  const spec = METRICS[metric];
  const visible = pointsInRange(points, range, today);
  const data = visible.map((point) => ({ ...point, ts: toMs(point.date), value: spec.value(point) }));

  const first = visible[0].date;
  const last = visible[visible.length - 1].date;
  const ticks = monthTicks(first, last);
  const multiYear = first.slice(0, 4) !== last.slice(0, 4);

  // A line's level is the information; on a zero-based axis 85 → 108 kg is a
  // flat line. Bars are amounts and must start at zero (spec §4.3).
  // Lines show a level: on a zero-based axis 85 → 108 kg is a flat line. Bars
  // are amounts and start at zero (spec §4.3). Round steps either way.
  const values = data.map((point) => point.value);
  const yTicks = niceTicks(
    spec.form === "bar" ? 0 : Math.min(...values),
    Math.max(...values),
    4,
    spec.integer
  );

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SegmentedControl
          label="Kennzahl"
          options={metrics.map((m) => ({ value: m, label: METRICS[m].label }))}
          value={metric}
          onChange={setMetric}
        />
        {ranges.length > 1 && (
          <SegmentedControl
            label="Zeitraum"
            options={ranges.map((r) => ({ value: r, label: RANGE_LABELS[r] }))}
            value={range}
            onChange={setRange}
          />
        )}
      </div>

      <div className="mt-4 h-52" aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" strokeWidth={1} />
            <XAxis
              dataKey="ts"
              type="number"
              scale="time"
              domain={[toMs(first), toMs(last)]}
              ticks={ticks.map(toMs)}
              tickFormatter={(ms: number) =>
                formatMonthTick(new Date(ms).toISOString().slice(0, 10), multiYear)
              }
              tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
              tickLine={false}
              axisLine={{ stroke: "var(--border)" }}
              padding={{ left: 8, right: 8 }}
            />
            <YAxis
              domain={[yTicks[0], yTicks[yTicks.length - 1]]}
              ticks={yTicks}
              width={44}
              tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) => (v >= 1000 ? formatKilos(v) : formatWeight(v))}
            />
            <Tooltip
              cursor={spec.form === "line" ? { stroke: "var(--muted-foreground)", strokeWidth: 1 } : { fill: "var(--muted)" }}
              isAnimationActive={false}
              content={({ active, payload }) => {
                const point = active ? (payload?.[0]?.payload as (typeof data)[number] | undefined) : undefined;
                if (!point) return null;
                return (
                  <div className="rounded-lg border border-border bg-card px-3 py-2 text-sm shadow-sm">
                    <p className="text-muted-foreground">{formatPerformedOnInYear(point.date, today)}</p>
                    <p className="font-semibold tabular-nums">{spec.format(point.value)}</p>
                    <p className="text-muted-foreground tabular-nums">{spec.detail(point)}</p>
                  </div>
                );
              }}
            />
            {spec.form === "line" ? (
              <Line
                dataKey="value"
                type="linear"
                stroke={spec.color}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
                isAnimationActive={!reducedMotion}
                // No dots except the last point (DESIGN_SYSTEM.md §5).
                dot={(props: { cx?: number; cy?: number; index?: number }) =>
                  props.index === data.length - 1 ? (
                    <circle
                      key="last"
                      cx={props.cx}
                      cy={props.cy}
                      r={4}
                      fill={spec.color}
                      stroke="var(--card)"
                      strokeWidth={2}
                    />
                  ) : (
                    <g key={props.index} />
                  )
                }
                activeDot={{ r: 5, fill: spec.color, stroke: "var(--card)", strokeWidth: 2 }}
              />
            ) : (
              <Bar
                dataKey="value"
                fill={spec.color}
                barSize={data.length > 40 ? 3 : 6}
                radius={[2, 2, 0, 0]}
                isAnimationActive={!reducedMotion}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {metric === "e1rm" && (
        <p className="mt-2 text-sm text-muted-foreground">
          e1RM ist geschätzt aus Gewicht × Wiederholungen (Epley) — bei vielen Wiederholungen eher zu hoch.
        </p>
      )}

      {/* The chart is a picture; this is the same data for a screen reader (DESIGN_SYSTEM.md §8). */}
      <table className="sr-only">
        <caption>
          {spec.label} je Session, {RANGE_LABELS[range]}
        </caption>
        <thead>
          <tr>
            <th scope="col">Datum</th>
            <th scope="col">{spec.label}</th>
            <th scope="col">Top-Satz</th>
          </tr>
        </thead>
        <tbody>
          {/* Index keys: two workouts on one day share a date. */}
          {data.map((point, index) => (
            <tr key={index}>
              <td>{formatPerformedOnInYear(point.date, today)}</td>
              <td>{spec.format(point.value)}</td>
              <td>{formatLift(point.topWeightKg, point.topReps)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-xl bg-muted p-1">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
          className={cn(
            "min-h-11 rounded-lg px-3 text-sm font-medium transition-colors",
            option.value === value
              ? "bg-card text-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
