import {
  addDays,
  type DatedLift,
  daysBetween,
  type ExerciseSession,
  type ExerciseSetRow,
  formatMonthYear,
  formatPerformedOnInYear,
  formatSetSummary,
  type SetRecord,
} from "@gymtrack/core";

/**
 * The exercise detail page, shaped from one exercise's sets
 * (docs/superpowers/specs/2026-09-30-exercise-detail-page-design.md).
 *
 * Pure: no `server-only`, no I/O. e1RM and volume per set arrive from
 * Postgres (`v_exercise_sets`); this file only groups, takes maxima and sums,
 * so neither formula exists a second time in the app.
 */

/** Below this many sessions in range, a line is a claim of a trend, not one (spec §4.3). */
export const MIN_CHART_SESSIONS = 3;

/** With one session, „letzte“ and „beste“ are the same set (spec §4.2, §4.4). */
export const MIN_SESSIONS_FOR_BESTS = 2;

/** The session list shows this many until „Alle“ is asked for (spec §4.5). */
export const SESSIONS_SHOWN = 10;

/** „Wiederholungen je Gewicht“: weights used in this window come first, at most this many. */
export const RECENT_WEIGHT_DAYS = 183;
export const MAX_RECENT_WEIGHTS = 8;

const RANGE_DAYS = { "3m": 92, "1y": 365 } as const;

export type ChartRange = "3m" | "1y" | "all";
export type ChartMetric = "e1rm" | "top" | "volume" | "maxReps" | "totalReps";

/** One session as the chart sees it. All metrics travel, so the toggle needs no request. */
export type ChartPoint = {
  date: string;
  e1rmKg: number;
  topWeightKg: number;
  topReps: number;
  volumeKg: number;
  maxReps: number;
  totalReps: number;
};

function compareRows(a: ExerciseSetRow, b: ExerciseSetRow): number {
  return (
    a.performedOn.localeCompare(b.performedOn) ||
    a.workoutCreatedAt.localeCompare(b.workoutCreatedAt) ||
    a.workoutId.localeCompare(b.workoutId) ||
    a.workoutExercisePosition - b.workoutExercisePosition ||
    a.workoutExerciseId.localeCompare(b.workoutExerciseId) ||
    a.set.position - b.set.position
  );
}

function lift(row: ExerciseSetRow): DatedLift {
  return {
    workoutId: row.workoutId,
    weightKg: row.set.weight_kg,
    reps: row.set.reps,
    e1rmKg: row.e1rmKg,
    performedOn: row.performedOn,
  };
}

/**
 * Sets → sessions, oldest first. A session is one workout: the same exercise
 * logged twice in it is one session, the same grouping `exercise_records()`
 * uses. Session order matches it too: date, then workout creation, then id.
 */
export function groupSessions(rows: ExerciseSetRow[]): ExerciseSession[] {
  const byWorkout = new Map<string, ExerciseSetRow[]>();
  for (const row of [...rows].sort(compareRows)) {
    const group = byWorkout.get(row.workoutId);
    if (group) group.push(row);
    else byWorkout.set(row.workoutId, [row]);
  }

  return [...byWorkout.values()].map((group) => {
    const first = group[0];
    const working = group.filter((row) => !row.set.is_warmup);

    let top: ExerciseSetRow | null = null;
    let best: ExerciseSetRow | null = null;
    for (const row of working) {
      if (
        !top ||
        row.set.weight_kg > top.set.weight_kg ||
        (row.set.weight_kg === top.set.weight_kg && row.set.reps > top.set.reps)
      ) {
        top = row;
      }
      if (
        !best ||
        row.e1rmKg > best.e1rmKg ||
        (row.e1rmKg === best.e1rmKg && row.set.weight_kg > best.set.weight_kg)
      ) {
        best = row;
      }
    }

    const notes: string[] = [];
    const seenInstances = new Set<string>();
    let attributes: Record<string, string> = {};
    for (const row of group) {
      if (seenInstances.has(row.workoutExerciseId)) continue;
      seenInstances.add(row.workoutExerciseId);
      const note = row.note?.trim();
      if (note && !notes.includes(note)) notes.push(note);
      attributes = { ...attributes, ...row.attributes };
    }

    const volume = group.reduce((sum, row) => sum + row.volumeKg, 0);

    return {
      workoutId: first.workoutId,
      performedOn: first.performedOn,
      category: first.category,
      // Renumbered in logged order: two instances of the exercise each start
      // at position 0, and `formatSetSummary` sorts by position.
      sets: group.map((row, index) => ({ ...row.set, position: index })),
      notes,
      attributes,
      workingSetCount: working.length,
      warmupCount: group.length - working.length,
      uncleanReps: group.reduce((sum, row) => sum + row.set.unclean_reps, 0),
      dropsetCount: group.filter((row) => row.set.is_dropset).length,
      top: top && lift(top),
      bestE1rm: best && lift(best),
      // Postgres sums `numeric` exactly; JS sums floats. Round back to the
      // column's two decimals (volume evaluation §5.4).
      volumeKg: Math.round(volume * 100) / 100,
      maxReps: working.reduce((max, row) => Math.max(max, row.set.reps), 0),
      totalReps: working.reduce((sum, row) => sum + row.set.reps, 0),
    };
  });
}

/** Sessions with at least one working set — what every number on the page counts (spec §5). */
export function trainedSessions(sessions: ExerciseSession[]): ExerciseSession[] {
  return sessions.filter((session) => session.workingSetCount > 0);
}

/**
 * Bodyweight exercise: every working set weighs 0 kg. Weight, e1RM and volume
 * would all read 0, so the page speaks in reps instead (spec §6). A mixed
 * exercise — dips, some with +10 kg — stays in weight mode.
 */
export function isRepsMode(trained: ExerciseSession[]): boolean {
  return trained.length > 0 && trained.every((session) => session.top?.weightKg === 0);
}

export type Bests = {
  e1rm: DatedLift | null;
  heaviest: DatedLift | null;
  mostReps: DatedLift | null;
};

/**
 * All-time bests, each dated to the FIRST session that reached it: strictly
 * greater, everywhere (dashboard spec §10.4). With that rule each best is
 * exactly the newest record event `exercise_records()` would name for it.
 */
export function computeBests(trained: ExerciseSession[]): Bests {
  let e1rm: DatedLift | null = null;
  let heaviest: DatedLift | null = null;
  let mostReps: DatedLift | null = null;

  for (const session of trained) {
    if (session.bestE1rm && (!e1rm || session.bestE1rm.e1rmKg > e1rm.e1rmKg)) {
      e1rm = session.bestE1rm;
    }
    if (session.top && (!heaviest || session.top.weightKg > heaviest.weightKg)) {
      heaviest = session.top;
    }
    if (session.top && (!mostReps || session.maxReps > mostReps.reps)) {
      const set = session.sets.find((s) => !s.is_warmup && s.reps === session.maxReps)!;
      mostReps = {
        workoutId: session.workoutId,
        weightKg: set.weight_kg,
        reps: set.reps,
        e1rmKg: 0,
        performedOn: session.performedOn,
      };
    }
  }

  return { e1rm, heaviest, mostReps };
}

export type RepRow = {
  weightKg: number;
  reps: number;
  /** When `reps` was first reached at this weight. */
  performedOn: string;
  /** When this weight was last used at all. */
  lastUsedOn: string;
};

/**
 * „Wiederholungen je Gewicht“: the most clean reps ever done at exactly each
 * working weight — the Wiederholungs-PR rule (dashboard spec §10.3) spread
 * over every weight. Heaviest first. `recent` holds the weights used in the
 * last `RECENT_WEIGHT_DAYS`, at most `MAX_RECENT_WEIGHTS`; `rest` the others.
 * Nothing recent (a long break) means everything is `recent`, so the table
 * never opens empty.
 */
export function repTable(
  trained: ExerciseSession[],
  today: string
): { recent: RepRow[]; rest: RepRow[] } {
  const byWeight = new Map<number, RepRow>();
  for (const session of trained) {
    for (const set of session.sets) {
      if (set.is_warmup) continue;
      const row = byWeight.get(set.weight_kg);
      if (!row) {
        byWeight.set(set.weight_kg, {
          weightKg: set.weight_kg,
          reps: set.reps,
          performedOn: session.performedOn,
          lastUsedOn: session.performedOn,
        });
        continue;
      }
      if (set.reps > row.reps) {
        row.reps = set.reps;
        row.performedOn = session.performedOn;
      }
      row.lastUsedOn = session.performedOn;
    }
  }

  const rows = [...byWeight.values()].sort((a, b) => b.weightKg - a.weightKg);
  const since = addDays(today, -RECENT_WEIGHT_DAYS);
  const recentAll = rows.filter((row) => row.lastUsedOn >= since);
  if (recentAll.length === 0) return { recent: rows, rest: [] };

  const recent = recentAll.slice(0, MAX_RECENT_WEIGHTS);
  return { recent, rest: rows.filter((row) => !recent.includes(row)) };
}

export function chartPoints(trained: ExerciseSession[]): ChartPoint[] {
  return trained.map((session) => ({
    date: session.performedOn,
    e1rmKg: session.bestE1rm!.e1rmKg,
    topWeightKg: session.top!.weightKg,
    topReps: session.top!.reps,
    volumeKg: session.volumeKg,
    maxReps: session.maxReps,
    totalReps: session.totalReps,
  }));
}

export function pointsInRange(points: ChartPoint[], range: ChartRange, today: string): ChartPoint[] {
  if (range === "all") return points;
  const since = addDays(today, -RANGE_DAYS[range]);
  return points.filter((point) => point.date >= since);
}

/**
 * The range chips worth showing: `all` once there is a chart at all, a shorter
 * range only if it holds enough sessions for a chart AND drops some — a chip
 * that shows the same points as „Alles“ is noise (spec §4.3).
 */
export function availableRanges(points: ChartPoint[], today: string): ChartRange[] {
  if (points.length < MIN_CHART_SESSIONS) return [];
  const shorter = (["3m", "1y"] as const).filter((range) => {
    const count = pointsInRange(points, range, today).length;
    return count >= MIN_CHART_SESSIONS && count < points.length;
  });
  return [...shorter, "all"];
}

/** `1y` when the history is longer than a year and the year holds a chart; else „Alles“. */
export function defaultRange(ranges: ChartRange[]): ChartRange {
  return ranges.includes("1y") ? "1y" : "all";
}

const ATTRIBUTE_KEYS: Record<string, string> = { grip: "Griff" };

/** The notes import's grip values (import spec §5.5), in the app's language. */
const ATTRIBUTE_VALUES: Record<string, string> = {
  wide: "weit",
  narrow: "eng",
  neutral: "neutral",
  lateral: "einarmig",
  triangle: "Dreieck",
  bent: "gebogene Stange",
  straight: "gerade Stange",
};

/** {grip: "narrow"} → "Griff: eng". Unknown keys and values pass through as stored. */
export function formatAttributes(attributes: Record<string, string>): string | null {
  const parts = Object.entries(attributes)
    .filter(([, value]) => typeof value === "string" && value.trim() !== "")
    .map(([key, value]) => `${ATTRIBUTE_KEYS[key] ?? key}: ${ATTRIBUTE_VALUES[value] ?? value}`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** What a session carries beyond its sets: „+3 unsauber · Dropset · Griff: eng“, or null. */
export function formatSessionExtras(session: ExerciseSession): string | null {
  const parts: string[] = [];
  if (session.uncleanReps > 0) parts.push(`+${session.uncleanReps} unsauber`);
  if (session.dropsetCount === 1) parts.push("Dropset");
  if (session.dropsetCount > 1) parts.push(`${session.dropsetCount} Dropsets`);
  const attributes = formatAttributes(session.attributes);
  if (attributes) parts.push(attributes);
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** "heute", "gestern", "vor 5 Tagen" — past two months a date reads better than a count. */
export function formatLastTrained(lastOn: string, today: string): string {
  const days = daysBetween(lastOn, today);
  if (days <= 0) return "heute";
  if (days === 1) return "gestern";
  if (days < 60) return `vor ${days} Tagen`;
  return `am ${formatPerformedOnInYear(lastOn, today)}`;
}

/** Working sets as `SetRecord`s, for `formatSetSummary` — the log screen's own notation. */
export function workingSets(session: ExerciseSession): SetRecord[] {
  return session.sets.filter((set) => !set.is_warmup);
}

/**
 * X-axis ticks for a date axis: first days of months inside [from, to], thinned
 * evenly to at most `maxTicks` so labels never collide at phone width. A range
 * inside one month gets its first day as the only tick.
 */
export function monthTicks(from: string, to: string, maxTicks = 4): string[] {
  const starts: string[] = [];
  let [year, month] = from.split("-").map(Number);
  for (;;) {
    const start = `${year}-${String(month).padStart(2, "0")}-01`;
    if (start > to) break;
    if (start >= from) starts.push(start);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  if (starts.length === 0) return [from];
  const step = Math.ceil(starts.length / maxTicks);
  return starts.filter((_, index) => index % step === 0);
}

/** "Sep", or "Sep 25" once the axis spans more than one calendar year. */
export function formatMonthTick(isoDate: string, multiYear: boolean): string {
  const label = formatMonthYear(isoDate);
  return multiYear ? label.replace(/ \d\d(\d\d)$/, " $1") : label.replace(/ \d{4}$/, "");
}

/**
 * Round y-axis ticks: a step of 1, 2, 2.5 or 5 × 10ⁿ giving at most `count`
 * intervals over [min, max] (`integer` for counts). Lines pass their own min (the axis need not start
 * at zero), bars pass 0. Returns the ticks; the first and last are the domain.
 */
export function niceTicks(min: number, max: number, count = 4, integer = false): number[] {
  if (max <= min) {
    const step = max > 0 ? niceStep(max / count, integer) : 1;
    min = Math.max(0, min - step);
    max = max + step;
  }
  const step = niceStep((max - min) / count, integer);
  const start = Math.floor(min / step) * step;
  const ticks: number[] = [];
  for (let tick = start; tick < max + step; tick += step) {
    ticks.push(Math.round(tick * 100) / 100);
    if (tick >= max) break;
  }
  return ticks;
}

/** `integer`: counts (reps) never get a 2,5 step or a fraction. */
function niceStep(raw: number, integer: boolean): number {
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const factors = integer ? [1, 2, 5, 10] : [1, 2, 2.5, 5, 10];
  const step = factors.find((m) => m * magnitude >= raw)! * magnitude;
  return integer ? Math.max(1, Math.round(step)) : step;
}

/**
 * A session's working sets in the log screen's notation („80 × 8 · 82,5 × 6“),
 * or „8 · 7 Wdh.“ when all of them are bodyweight — „0 × 8“ reads like an
 * error (same rule as `formatLift`). Empty for a warm-up-only session.
 */
export function formatSessionSets(session: ExerciseSession): string {
  const sets = workingSets(session);
  if (sets.length > 0 && sets.every((set) => set.weight_kg === 0)) {
    return `${sets.map((set) => set.reps).join(" · ")} Wdh.`;
  }
  return formatSetSummary(sets);
}
