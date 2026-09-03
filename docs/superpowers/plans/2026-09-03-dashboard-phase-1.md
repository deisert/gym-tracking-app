# Dashboard Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fill the `/dashboard` tab, a placeholder empty state since PR #11, with six blocks of trackable progress: this week, streak, a 12-week calendar, new records, your exercises, and all-time totals — with no chart library.

**Architecture:** Postgres does the aggregation (four objects, all `security_invoker = on`), a server-only data layer reads them in 3–4 queries, pure functions in `src/lib/` do the bucketing and record maths, and the route is a server component rendering plain markup. No client component is needed for any block: nothing on this screen is interactive in v1.

**Tech Stack:** Next.js 16 / React 19 App Router, TypeScript, Tailwind v4, Supabase (`@supabase/ssr`), Vitest (`environment: "node"`, pure-function tests only — no DOM harness exists in this repo).

**Spec:** [docs/superpowers/specs/2026-09-03-dashboard-design.md](../specs/2026-09-03-dashboard-design.md)
**Related:** [total-volume evaluation](../specs/2026-09-03-total-volume-evaluation.md) — §7 is why aggregation moves into Postgres here.

## Global Constraints

- **Every view and function is `security_invoker = on`.** A default view runs as its owner and serves every user everyone else's rows, straight past the RLS policies in `20260817000001_init.sql`. This is the single most dangerous line in the plan — a missing `security_invoker` is a data leak, not a bug.
- Decisions from the spec §9 are fixed inputs, not open choices: six blocks, three record types (Gewicht / e1RM / Wiederholungen), streak threshold ≥ 2 workouts per week, week starts Monday, records window 30 days.
- **Warm-ups never count toward a record** (`is_warmup = false`), while volume counts every set — the two rules are deliberately opposite and both already documented. Do not "harmonise" them.
- **Records are always derived, never stored.** Backdating is a feature and the notes import will insert years at once.
- Sprache: Deutsch, informelles "du". Zahlen: `80 × 8`, Gewicht mit Komma (`82,5 kg`), Datum kurz (`12. Aug`) — reuse `formatWeight` and `formatPerformedOn` rather than reformatting by hand.
- Dark-only palette, tokens from `globals.css`. Tap targets ≥ 44px (`min-h-12`), no colour-only information (`DESIGN_SYSTEM.md` §8).
- No new npm dependency. Recharts arrives in phase 2, not here.
- The heatmap is a `<div>` grid, not an image and not an SVG.
- Every block renders something honest when it has no data — see Task 7. A block that would show a misleading zero or a "+100 %" against nothing must render its empty state instead.

---

### Task 1: Migration — the four Postgres objects

**Files:**
- Create: `supabase/migrations/20260903000001_dashboard_views.sql`

**Interfaces:** Produces `v_workout_stats`, `v_working_sets`, `v_user_totals` and `exercise_records()`, all consumed by Task 5's data layer.

- [ ] **Step 1: `v_workout_stats` — one row per workout**

```sql
create view v_workout_stats with (security_invoker = on) as
  select w.id as workout_id, w.user_id, w.performed_on, w.category,
         count(s.id) as set_count,
         coalesce(sum(s.weight_kg * s.reps), 0) as volume_kg
    from workouts w
    left join workout_exercises we on we.workout_id = w.id
    left join sets s on s.workout_exercise_id = we.id
   group by w.id;
```

`left join` twice on purpose: a workout with no exercises still has to appear, with zeroes. It is a real row in the calendar.

- [ ] **Step 2: `v_working_sets` — record candidates, with e1RM precomputed**

```sql
create view v_working_sets with (security_invoker = on) as
  select w.user_id, w.id as workout_id, w.performed_on,
         we.exercise_id, e.name as exercise_name,
         s.weight_kg, s.reps,
         round(s.weight_kg * (1 + s.reps / 30.0), 1) as e1rm_kg
    from sets s
    join workout_exercises we on we.id = s.workout_exercise_id
    join workouts w on w.id = we.workout_id
    join exercises e on e.id = we.exercise_id
   where s.is_warmup = false;
```

Epley per `CONCEPT.md` §2.9. `30.0` — not `30` — or integer division silently makes every e1RM equal the weight.

- [ ] **Step 3: `v_user_totals` — the odometer**

```sql
create view v_user_totals with (security_invoker = on) as
  select user_id,
         count(*) as workout_count,
         coalesce(sum(set_count), 0) as set_count,
         coalesce(sum(volume_kg), 0) as volume_kg
    from v_workout_stats
   group by user_id;
```

- [ ] **Step 4: `exercise_records()` — one row per exercise, three PRs each**

A `sql` function (invoker rights by default, so the view's RLS still applies) returning per exercise: `times_performed`, and for each of the three metrics the value and the date it was achieved. Use one pass with window functions rather than three `distinct on` views.

Two rules the SQL itself must enforce:
- **An exercise with only one session returns no records** — otherwise every new exercise fires three PRs at once.
- A **Wiederholungs-PR only counts at a weight lifted before**; most reps at a brand-new lighter weight is not a record.

- [ ] **Step 5: grants and a leak check**

```sql
grant select on v_workout_stats, v_working_sets, v_user_totals to authenticated;
```

Then verify with two different users: each must see only their own rows through every view. Do not skip this — `security_invoker` is exactly the kind of thing that looks fine until it isn't.

---

### Task 2: Week bucketing and streak maths

**Files:**
- Create: `src/lib/dashboard-weeks.ts`
- Test: `src/lib/dashboard-weeks.test.ts`

**Interfaces:** Produces `bucketByWeek(rows, weeks, today)`, `currentStreak(weeks, threshold)`, `weeklyAverage(weeks)`, `formatDelta(current, previous)` — consumed by Tasks 5 and 6.

- [ ] **Step 1: Write the failing tests**

Cover, at minimum:
- `bucketByWeek` returns exactly `weeks` buckets, newest last, including **empty weeks** — a gap is data, and dropping it silently shortens the calendar.
- Week boundaries come from `startOfWeekMonday`; a Sunday workout belongs to the week that started six days earlier.
- `currentStreak` counts back from the most recent **completed** week, so a streak does not appear broken on a Tuesday just because this week is still in progress.
- `currentStreak` with threshold 2: `[3,2,2,1,4]` → 3.
- `formatDelta(x, null)` returns `null` — no previous week means no comparison, never "+100 %".
- `formatDelta` renders German: `+18 %`, `−12 %`, `±0 %`.

- [ ] **Step 2: Implement to green.** Pure functions, no Date-now inside them — `today` is a parameter so the tests are not clock-dependent (same discipline as `todayInAppTimezone`).

---

### Task 3: Heatmap levels

**Files:**
- Create: `src/lib/dashboard-heatmap.ts`
- Test: `src/lib/dashboard-heatmap.test.ts`

**Interfaces:** Produces `heatmapCells(days, weeks, today)` returning 7 × `weeks` cells of `{ date, level: 0..4, setCount, volumeKg }` for Task 6.

- [ ] **Step 1: Write the failing tests**

- A day with no sets is level 0.
- **A day with sets is never level 0**, even at 0 kg — a pull-up day is a training day, and the calendar is the one place that must never call it a rest day. This is the single most important test in the file.
- Levels 1–4 scale against the user's own maximum day inside the window, so the calendar re-scales as they get stronger instead of saturating.
- Exactly `7 × weeks` cells, ordered Monday-first per column, ending on the current week.

- [ ] **Step 2: Implement to green.**

---

### Task 4: Record formatting

**Files:**
- Create: `src/lib/records.ts`
- Test: `src/lib/records.test.ts`

**Interfaces:** Produces `RecordEntry`, `recentRecords(rows, since)`, `formatRecordValue(entry)` — consumed by Task 6.

- [ ] **Step 1: Write the failing tests**

- Only records achieved within the window are returned, newest first.
- Each of the three kinds formats correctly: `85 kg × 5` / `140 kg × 3` with `bester e1RM · 154 kg` / `12 Wdh.`
- Weight uses `formatWeight` (German comma), date uses `formatPerformedOn`.
- Two records on the same day for the same exercise both survive — they are different claims.

- [ ] **Step 2: Implement to green.**

---

### Task 5: Data layer

**Files:**
- Create: `src/lib/data/dashboard.ts`
- Modify: `src/lib/types.ts` (add the dashboard row types)

**Interfaces:** Produces `getDashboardData(today)` returning `{ weeks, days, records, exercises, totals }` for Task 6.

- [ ] **Step 1: Query the four objects**

Follow the existing data-layer conventions exactly: `import "server-only"`, `createServerSupabase`, `console.error` with context on failure, and **`Number(...)` every `numeric` column** — PostgREST hands `numeric` back as a string, which is why `weight_kg` is converted everywhere else in this codebase. A string `volume_kg` would concatenate instead of summing and produce a spectacular odometer.

- [ ] **Step 2: Keep it at 3–4 queries, run in parallel** with `Promise.all`, scoped by date where possible (`v_workout_stats` only needs the last 12 weeks; only `v_user_totals` and `exercise_records()` span all time).

- [ ] **Step 3: Degrade per block, not per page.** A failed records query returns an empty list and the rest of the dashboard still renders. One broken block must never blank the tab.

---

### Task 6: The six blocks

**Files:**
- Modify: `src/app/dashboard/page.tsx` (exists as a placeholder; becomes a server component)
- Create: `src/components/dashboard/` — `stat-tiles.tsx`, `streak-line.tsx`, `week-heatmap.tsx`, `records-list.tsx`, `exercise-list.tsx`, `totals-row.tsx`

**Interfaces:** Consumes Task 5's `getDashboardData`; all components are server components taking plain props.

- [ ] **Step 1: Nothing to do in the navigation.** PR #11 already added the Dashboard tab and merged Today into Verlauf, so the bar is `Verlauf · Dashboard` and `src/app/dashboard/page.tsx` exists. Do not add a tab; replace the placeholder page, and keep its empty-state copy for Task 7 Step 2 — it is already the wording `DESIGN_SYSTEM.md` §5 asks for.

- [ ] **Step 2: Build the blocks in the spec's order** — §2.1 through §2.6. Reuse the visual vocabulary that already exists: card surfaces, `tabular-nums` on every figure, section labels in the `text-xs uppercase tracking-wide text-muted-foreground` pattern from the home page.

- [ ] **Step 3: Heatmap accessibility.** The grid is `role="img"` with an `aria-label` summarising the window ("29 Trainingstage in 12 Wochen"); each cell carries a `title`. A legend (`weniger` → `mehr`) is required — the ramp means nothing without it.

- [ ] **Step 4: Exercise rows are links** to `/exercise/[id]` from the start, even though that route lands in phase 2. Wire the href now; retrofitting links into a list is more churn than shipping them dead.

---

### Task 7: Empty states and the honesty pass

**Files:**
- Modify: the six components from Task 6

- [ ] **Step 1: One empty state per block, each naming what it takes**

| Block | Shows nothing when | Then says |
|---|---|---|
| Diese Woche | no workout this week | the tiles at 0, delta hidden |
| Serie | fewer than 2 completed weeks | hidden entirely |
| Raster | always renders | — it reads as a calendar when empty |
| Neue Rekorde | no PR in 30 days | „Ab der zweiten Session einer Übung erscheinen hier deine Bestwerte." |
| Deine Übungen | fewer than 3 workouts | hidden entirely |
| Seit Beginn | no workout at all | the whole-page empty state instead |

- [ ] **Step 2: Page-level empty state.** Zero workouts: one line of guidance plus the primary action, per `DESIGN_SYSTEM.md` §5 — not six empty blocks.

- [ ] **Step 3: Say the bodyweight caveat out loud.** If the week's volume is 0 while sets exist, the volume tile carries the same note the end-of-workout dialog already uses. Otherwise the number silently punishes a calisthenics week.

- [ ] **Step 4: Full verification.** `npm test`, `npm run lint`, `npm run build`, then open the tab against real data and check every figure against the log screen by hand. A dashboard that is merely plausible is worse than none — the numbers have to be *right*.
