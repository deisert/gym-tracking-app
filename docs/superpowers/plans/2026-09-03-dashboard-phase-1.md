# Dashboard Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fill the `/dashboard` tab, a placeholder since PR #11, with six blocks of trackable progress — this week, Rhythmus, a 12-week calendar, new records, your exercises, all-time totals — with no chart library.

**Architecture:** Postgres does the aggregation: three views and two functions, all invoker-rights so RLS still applies. A server-only data layer reads them in four parallel queries. Pure functions in `src/lib/` do the week bucketing, heatmap levels and record picking, and are the only unit-tested code. The route stays a server component rendering plain markup — nothing on this screen is interactive in v1, so there is no client component.

**Tech Stack:** Next.js 16.3.1 / React 19 App Router, TypeScript, Tailwind v4, Supabase (`@supabase/ssr`, Postgres 15+), Vitest 1 (`environment: "node"`, pure-function tests only — no DOM harness exists in this repo).

**Spec:** [docs/superpowers/specs/2026-09-03-dashboard-design.md](../specs/2026-09-03-dashboard-design.md) — **§10 (2026-09-23) wins where it differs from §2/§9.**
**Related:** [total-volume evaluation](../specs/2026-09-03-total-volume-evaluation.md) — why aggregation moves into Postgres here. [Monorepo plan](2026-09-15-monorepo-and-pwa.md) — runs *after* this one (spec §10.1).

## Global Constraints

- **Every view is `with (security_invoker = on)` and every function is `security invoker`.** A default view runs as its owner and serves every user everyone else's rows, straight past the RLS policies in `20260817000001_init.sql`. A missing `security_invoker` is a data leak, not a bug. Task 1's check script proves it.
- **One Supabase project, no staging instance** (spec §10.9). Applying the migration for staging applies it to production. It must stay purely additive — no `alter`/`drop` of existing objects.
- **Fixed decisions (spec §9 + §10), not open choices:**
  - six blocks, in spec order;
  - three record kinds — Gewicht / e1RM / Wiederholungen — strictly greater only; the first session of an exercise is never a record; Wiederholungs-PR at exactly the same weight;
  - streak threshold `2` workouts per week, week starts Monday;
  - records window 30 days;
  - **no week-over-week delta** anywhere;
  - „Deine Übungen“: top 5 by sessions in the last 12 weeks, all-time best set, **plain rows, no links**;
  - a workout with zero sets does not count as trained.
- **Volume counts every set, warm-ups included; records count working sets only** (`is_warmup = false`). Deliberately opposite, both documented. Do not „harmonise“ them.
- **Records are derived on every read, never stored.** Backdating is a feature.
- **Dates are `"YYYY-MM-DD"` strings end to end.** `today` comes from `todayInAppTimezone()` — never `new Date()` on the server, which runs in UTC on Vercel.
- **`Number(...)` every `numeric`/`bigint` column** from PostgREST — they can arrive as strings, and a string `volume_kg` concatenates instead of summing.
- Sprache: Deutsch, informelles „du“. Reuse `formatWeight`, `formatPerformedOn`, `formatKilos`, `formatVolume` — never reformat numbers or dates by hand.
- Dark-only palette, tokens from `globals.css`. Heatmap = `--muted` plus four lime steps (`DESIGN_SYSTEM.md` §2). No colour-only information (§8).
- No new npm dependency. The heatmap is a `<div>` grid — not an image, not an SVG.
- Next 16: before writing route code, skim `node_modules/next/dist/docs/01-app/` for the App Router page conventions (`AGENTS.md`). The page follows the exact pattern of `src/app/page.tsx`.
- **Branching (`AGENTS.md`):** feature branch `claude/dashboard-phase-1` off `staging`, PR against `staging`. Before the PR: `npm run lint && npm run test && npm run build`. Never commit the unrelated local change to `AGENTS.md` — stage files by name.

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/<version>_dashboard_views.sql` | Create: 3 views + 2 functions + grants |
| `supabase/checks/dashboard_views.sql` | Create: self-aborting fixture check (correctness + leak) |
| `src/lib/dates.ts` (+ test) | Modify: `addDays`, `mondayOf` |
| `src/lib/workout-summary.ts` (+ test) | Modify: `formatMovedWeight` (kg → t past 10.000) |
| `src/lib/types.ts` | Modify: dashboard row types |
| `src/lib/dashboard-weeks.ts` (+ test) | Create: this week, streak, average, totals |
| `src/lib/dashboard-heatmap.ts` (+ test) | Create: 12 × 7 cells, levels, labels |
| `src/lib/records.ts` (+ test) | Create: one record per exercise, lift formatting |
| `src/lib/data/dashboard.ts` | Create: the four queries |
| `src/components/dashboard/*.tsx` | Create: `section`, `stat-tiles`, `streak-line`, `week-heatmap`, `records-list`, `exercise-list`, `totals-row` |
| `src/app/dashboard/page.tsx` | Modify: placeholder → server component |
| `docs/superpowers/plans/2026-09-15-monorepo-and-pwa.md` | Modify: note the new modules and test count |

---

### Task 1: Migration, fixture check, apply

**Files:**
- Create: `supabase/migrations/20260923120000_dashboard_views.sql` (version renamed in Step 5 if the recorded one differs)
- Create: `supabase/checks/dashboard_views.sql`

**Interfaces:**
- Produces (SQL, consumed by Task 6):
  - `v_workout_stats(workout_id, user_id, performed_on, set_count, volume_kg)`
  - `v_weekly_stats(user_id, week_start, workout_count, set_count, volume_kg)`
  - `v_working_sets(user_id, workout_id, performed_on, workout_created_at, exercise_id, exercise_name, weight_kg, reps, e1rm_kg)`
  - `exercise_records(p_since date) → (exercise_id, exercise_name, kind, performed_on, weight_kg, reps, e1rm_kg)`
  - `top_exercises(p_since date, p_limit int) → (exercise_id, exercise_name, session_count, best_weight_kg, best_reps, best_performed_on)`

- [ ] **Step 1: Branch off staging**

```bash
git fetch origin
git switch -c claude/dashboard-phase-1 origin/staging
```

- [ ] **Step 2: Write the migration**

`supabase/migrations/20260923120000_dashboard_views.sql`:

```sql
-- Dashboard aggregates (docs/superpowers/specs/2026-09-03-dashboard-design.md §7, §10).
--
-- Every view here is `security_invoker = on`, and every function `security
-- invoker`. That is not optional: a default view runs as its owner and would
-- serve every user everyone else's rows, straight past the RLS policies in
-- 20260817000001_init.sql. supabase/checks/dashboard_views.sql proves it.
--
-- Two rules are deliberately opposite, and both intended
-- (2026-09-03-total-volume-evaluation.md §5):
--   * volume counts EVERY set, warm-ups included — it is load moved;
--   * records count working sets only — a warm-up is not a performance.
--
-- Records are derived here on every read, never stored: backdating is a
-- feature, and a stored "current PR" would be wrong the moment an older,
-- heavier session is entered.
--
-- Purely additive. There is one database for staging and production, so this
-- lands on production the moment it is applied.

-- One row per workout. Left joins on purpose: a workout with no exercises or
-- no sets still appears, with zeroes.
create view v_workout_stats with (security_invoker = on) as
  select w.id as workout_id,
         w.user_id,
         w.performed_on,
         count(s.id) as set_count,
         coalesce(sum(s.weight_kg * s.reps), 0) as volume_kg
    from workouts w
    left join workout_exercises we on we.workout_id = w.id
    left join sets s on s.workout_exercise_id = we.id
   group by w.id;

-- One row per Monday-start week that had training in it. A workout without a
-- single set was started, not trained: it neither counts here nor keeps a
-- streak alive. `::timestamp` pins date_trunc to the timezone-free overload.
create view v_weekly_stats with (security_invoker = on) as
  select user_id,
         date_trunc('week', performed_on::timestamp)::date as week_start,
         count(*) as workout_count,
         sum(set_count) as set_count,
         sum(volume_kg) as volume_kg
    from v_workout_stats
   where set_count > 0
   group by user_id, date_trunc('week', performed_on::timestamp);

-- Record candidates: working sets only, e1RM (Epley, CONCEPT.md §2.9)
-- precomputed. `30.0`, not `30`: integer division would make every e1RM equal
-- the weight.
create view v_working_sets with (security_invoker = on) as
  select w.user_id,
         w.id as workout_id,
         w.performed_on,
         w.created_at as workout_created_at,
         we.exercise_id,
         e.name as exercise_name,
         s.weight_kg,
         s.reps,
         round(s.weight_kg * (1 + s.reps / 30.0), 1) as e1rm_kg
    from sets s
    join workout_exercises we on we.id = s.workout_exercise_id
    join workouts w on w.id = we.workout_id
    join exercises e on e.id = we.exercise_id
   where s.is_warmup = false;

-- The newest record of each kind per exercise, achieved on or after p_since.
-- Up to three rows per exercise; the app shows one line per exercise.
--
--   weight  heaviest working set, beating every earlier session
--   e1rm    best Epley estimate, beating every earlier session
--   reps    most reps at a weight, beating every earlier session AT THAT WEIGHT
--
-- Rules enforced here rather than in the app:
--   * strictly greater — matching an old best is not a new one;
--   * the first session of an exercise is never a record: its "before" window
--     is empty, the comparison is null, and the row drops out;
--   * a reps record needs an earlier session at exactly that weight;
--   * bodyweight (0 kg) can only produce a reps record, because 0 never beats 0.
-- "Earlier" = ordered by performed_on, then workout created_at, then id, so two
-- sessions on the same day still have an order.
create function exercise_records(p_since date)
returns table (
  exercise_id uuid,
  exercise_name text,
  kind text,
  performed_on date,
  weight_kg numeric,
  reps int,
  e1rm_kg numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with session_tops as (
    select ws.exercise_id, ws.exercise_name, ws.workout_id, ws.performed_on,
           ws.workout_created_at,
           max(ws.weight_kg) as top_weight,
           max(ws.e1rm_kg) as top_e1rm
      from v_working_sets ws
     group by ws.exercise_id, ws.exercise_name, ws.workout_id, ws.performed_on,
              ws.workout_created_at
  ),
  session_bests as (
    select st.*,
           max(st.top_weight) over earlier as best_weight_before,
           max(st.top_e1rm) over earlier as best_e1rm_before
      from session_tops st
    window earlier as (
      partition by st.exercise_id
      order by st.performed_on, st.workout_created_at, st.workout_id
      rows between unbounded preceding and 1 preceding
    )
  ),
  weight_records as (
    select distinct on (sb.exercise_id)
           sb.exercise_id, sb.exercise_name, 'weight'::text as kind, sb.performed_on,
           sb.workout_created_at, top_set.weight_kg, top_set.reps, top_set.e1rm_kg
      from session_bests sb
      cross join lateral (
        select ws.weight_kg, ws.reps, ws.e1rm_kg
          from v_working_sets ws
         where ws.workout_id = sb.workout_id
           and ws.exercise_id = sb.exercise_id
           and ws.weight_kg = sb.top_weight
         order by ws.reps desc
         limit 1
      ) top_set
     where sb.top_weight > sb.best_weight_before
       and sb.performed_on >= p_since
     order by sb.exercise_id, sb.performed_on desc, sb.workout_created_at desc
  ),
  e1rm_records as (
    select distinct on (sb.exercise_id)
           sb.exercise_id, sb.exercise_name, 'e1rm'::text as kind, sb.performed_on,
           sb.workout_created_at, top_set.weight_kg, top_set.reps, top_set.e1rm_kg
      from session_bests sb
      cross join lateral (
        select ws.weight_kg, ws.reps, ws.e1rm_kg
          from v_working_sets ws
         where ws.workout_id = sb.workout_id
           and ws.exercise_id = sb.exercise_id
           and ws.e1rm_kg = sb.top_e1rm
         order by ws.weight_kg desc
         limit 1
      ) top_set
     where sb.top_e1rm > sb.best_e1rm_before
       and sb.performed_on >= p_since
     order by sb.exercise_id, sb.performed_on desc, sb.workout_created_at desc
  ),
  weight_sessions as (
    select ws.exercise_id, ws.exercise_name, ws.workout_id, ws.performed_on,
           ws.workout_created_at, ws.weight_kg,
           max(ws.reps) as top_reps
      from v_working_sets ws
     group by ws.exercise_id, ws.exercise_name, ws.workout_id, ws.performed_on,
              ws.workout_created_at, ws.weight_kg
  ),
  reps_records as (
    select distinct on (rb.exercise_id)
           rb.exercise_id, rb.exercise_name, 'reps'::text as kind, rb.performed_on,
           rb.workout_created_at, rb.weight_kg, rb.top_reps as reps,
           round(rb.weight_kg * (1 + rb.top_reps / 30.0), 1) as e1rm_kg
      from (
        select wsn.*,
               max(wsn.top_reps) over (
                 partition by wsn.exercise_id, wsn.weight_kg
                 order by wsn.performed_on, wsn.workout_created_at, wsn.workout_id
                 rows between unbounded preceding and 1 preceding
               ) as best_reps_before
          from weight_sessions wsn
      ) rb
     where rb.top_reps > rb.best_reps_before
       and rb.performed_on >= p_since
     order by rb.exercise_id, rb.performed_on desc, rb.workout_created_at desc,
              rb.weight_kg desc
  )
  select r.exercise_id, r.exercise_name, r.kind, r.performed_on,
         r.weight_kg, r.reps, r.e1rm_kg
    from (
      select * from weight_records
      union all
      select * from e1rm_records
      union all
      select * from reps_records
    ) r;
$$;

-- The most-trained exercises since p_since, each with its ALL-TIME best
-- working set: highest e1RM, then heaviest, then most reps (which is what
-- decides between bodyweight sets), then newest.
create function top_exercises(p_since date, p_limit int)
returns table (
  exercise_id uuid,
  exercise_name text,
  session_count bigint,
  best_weight_kg numeric,
  best_reps int,
  best_performed_on date
)
language sql
stable
security invoker
set search_path = public
as $$
  with frequent as (
    select ws.exercise_id, count(distinct ws.workout_id) as session_count
      from v_working_sets ws
     where ws.performed_on >= p_since
     group by ws.exercise_id
  ),
  best as (
    select distinct on (ws.exercise_id)
           ws.exercise_id, ws.exercise_name, ws.weight_kg, ws.reps, ws.e1rm_kg,
           ws.performed_on
      from v_working_sets ws
      join frequent f on f.exercise_id = ws.exercise_id
     order by ws.exercise_id, ws.e1rm_kg desc, ws.weight_kg desc, ws.reps desc,
              ws.performed_on desc
  )
  select b.exercise_id, b.exercise_name, f.session_count,
         b.weight_kg, b.reps, b.performed_on
    from best b
    join frequent f on f.exercise_id = b.exercise_id
   order by f.session_count desc, b.exercise_name
   limit p_limit;
$$;

-- Supabase's default privileges hand every new object in `public` to anon as
-- well. RLS would return nothing to anon anyway, but nothing here is meant for
-- a logged-out caller, and the views are read-only by intent.
revoke all on v_workout_stats, v_weekly_stats, v_working_sets from anon, authenticated;
grant select on v_workout_stats, v_weekly_stats, v_working_sets to authenticated;

revoke execute on function exercise_records(date), top_exercises(date, int) from public, anon;
grant execute on function exercise_records(date), top_exercises(date, int) to authenticated;
```

- [ ] **Step 3: Write the fixture check**

`supabase/checks/dashboard_views.sql` — not in `supabase/tests/`, which `supabase test db` reserves for pgTAP:

```sql
-- Dashboard views: correctness and tenancy check against the real database.
--
-- There is one Supabase project (no staging instance, no local Docker), so this
-- runs where the production rows live — and therefore ALWAYS aborts: its last
-- statement raises, which rolls back every fixture row it inserted.
--
--   Pass:  ERROR: DASHBOARD_CHECKS_PASSED
--   Fail:  ERROR: FAIL ...   (or any other error)
--
-- Run as ONE statement: Supabase SQL editor, or the MCP `execute_sql` tool.
-- Fixtures are dated 2001 so no real week, day or record collides with them.

do $$
declare
  me constant uuid := '4458ae8e-cf70-4ba5-8416-e9e7983cf181';
  stranger constant uuid := '00000000-0000-0000-0000-000000000001';
  ex_bench uuid;
  ex_pullup uuid;
  ex_new uuid;
  w1 uuid;
  w2 uuid;
  w3 uuid;
  w_empty uuid;
  we uuid;
  n bigint;
  r record;
begin
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims',
    json_build_object('sub', me, 'role', 'authenticated')::text, true);

  insert into exercises (user_id, name) values (me, 'zz_check_bench') returning id into ex_bench;
  insert into exercises (user_id, name) values (me, 'zz_check_pullup') returning id into ex_pullup;
  insert into exercises (user_id, name) values (me, 'zz_check_new') returning id into ex_new;

  insert into workouts (user_id, performed_on) values (me, '2001-01-03') returning id into w1;      -- Wed
  insert into workouts (user_id, performed_on) values (me, '2001-02-07') returning id into w2;      -- Wed
  insert into workouts (user_id, performed_on) values (me, '2001-02-14') returning id into w3;      -- Wed
  insert into workouts (user_id, performed_on) values (me, '2001-02-12') returning id into w_empty; -- Mon

  -- W1. The 100 kg warm-up must never become the bar a record has to beat.
  insert into workout_exercises (workout_id, exercise_id) values (w1, ex_bench) returning id into we;
  insert into sets (workout_exercise_id, position, weight_kg, reps, is_warmup)
    values (we, 0, 100, 1, true), (we, 1, 80, 5, false), (we, 2, 80, 5, false);
  insert into workout_exercises (workout_id, exercise_id) values (w1, ex_pullup) returning id into we;
  insert into sets (workout_exercise_id, position, weight_kg, reps) values (we, 0, 0, 8);

  -- W2. Bench: weight PR (85 > 80). Pull-up: reps PR at 0 kg (10 > 8).
  insert into workout_exercises (workout_id, exercise_id) values (w2, ex_bench) returning id into we;
  insert into sets (workout_exercise_id, position, weight_kg, reps) values (we, 0, 85, 3), (we, 1, 80, 8);
  insert into workout_exercises (workout_id, exercise_id) values (w2, ex_pullup) returning id into we;
  insert into sets (workout_exercise_id, position, weight_kg, reps) values (we, 0, 0, 10);

  -- W3. Bench: ties 85 (no record), beats e1RM and reps at 80 kg.
  --     Pull-up: ties 10 (no record). New exercise: first session (no record).
  insert into workout_exercises (workout_id, exercise_id) values (w3, ex_bench) returning id into we;
  insert into sets (workout_exercise_id, position, weight_kg, reps) values (we, 0, 85, 3), (we, 1, 80, 10);
  insert into workout_exercises (workout_id, exercise_id) values (w3, ex_pullup) returning id into we;
  insert into sets (workout_exercise_id, position, weight_kg, reps) values (we, 0, 0, 10);
  insert into workout_exercises (workout_id, exercise_id) values (w3, ex_new) returning id into we;
  insert into sets (workout_exercise_id, position, weight_kg, reps) values (we, 0, 50, 5);

  -- w_empty: started, never trained — an exercise, no set.
  insert into workout_exercises (workout_id, exercise_id) values (w_empty, ex_bench);

  -- v_workout_stats: warm-ups count toward volume. 100×1 + 2×80×5 + 0×8 = 900.
  select set_count, volume_kg into r from v_workout_stats where workout_id = w1;
  if r.set_count is distinct from 4::bigint or r.volume_kg is distinct from 900::numeric then
    raise exception 'FAIL v_workout_stats w1: % sets, % kg (want 4, 900)', r.set_count, r.volume_kg;
  end if;
  select set_count, volume_kg into r from v_workout_stats where workout_id = w_empty;
  if r.set_count is distinct from 0::bigint or r.volume_kg is distinct from 0::numeric then
    raise exception 'FAIL v_workout_stats w_empty: % sets, % kg (want 0, 0)', r.set_count, r.volume_kg;
  end if;

  -- v_weekly_stats: week of Mon 12 Feb holds w3 (trained) and w_empty (not).
  -- 85×3 + 80×10 + 0×10 + 50×5 = 255 + 800 + 0 + 250 = 1305.
  select workout_count, set_count, volume_kg into r from v_weekly_stats where week_start = '2001-02-12';
  if r.workout_count is distinct from 1::bigint or r.set_count is distinct from 4::numeric
     or r.volume_kg is distinct from 1305::numeric then
    raise exception 'FAIL v_weekly_stats 2001-02-12: % workouts, % sets, % kg (want 1, 4, 1305)',
      r.workout_count, r.set_count, r.volume_kg;
  end if;
  select count(*) into n from v_weekly_stats where week_start = '2001-01-01';
  if n <> 1 then raise exception 'FAIL v_weekly_stats: W1 must fall in the week of Mon 2001-01-01'; end if;

  -- exercise_records: exactly four, none from a first session, none from a warm-up.
  select count(*) into n from exercise_records('2001-02-01') where exercise_name like 'zz_check_%';
  if n <> 4 then raise exception 'FAIL exercise_records: % rows (want 4)', n; end if;

  select * into r from exercise_records('2001-02-01') where exercise_id = ex_bench and kind = 'weight';
  if r.performed_on is distinct from '2001-02-07'::date or r.weight_kg is distinct from 85::numeric
     or r.reps is distinct from 3 then
    raise exception 'FAIL bench weight record: % % × % (want 2001-02-07 85 × 3)', r.performed_on, r.weight_kg, r.reps;
  end if;

  select * into r from exercise_records('2001-02-01') where exercise_id = ex_bench and kind = 'e1rm';
  if r.performed_on is distinct from '2001-02-14'::date or r.weight_kg is distinct from 80::numeric
     or r.reps is distinct from 10 or r.e1rm_kg is distinct from 106.7::numeric then
    raise exception 'FAIL bench e1rm record: % % × % = % (want 2001-02-14 80 × 10 = 106.7)',
      r.performed_on, r.weight_kg, r.reps, r.e1rm_kg;
  end if;

  select * into r from exercise_records('2001-02-01') where exercise_id = ex_bench and kind = 'reps';
  if r.performed_on is distinct from '2001-02-14'::date or r.weight_kg is distinct from 80::numeric
     or r.reps is distinct from 10 then
    raise exception 'FAIL bench reps record: % % × % (want 2001-02-14 80 × 10)', r.performed_on, r.weight_kg, r.reps;
  end if;

  select * into r from exercise_records('2001-02-01') where exercise_id = ex_pullup;
  if r.kind is distinct from 'reps' or r.performed_on is distinct from '2001-02-07'::date
     or r.weight_kg is distinct from 0::numeric or r.reps is distinct from 10 then
    raise exception 'FAIL pull-up record: % % % × % (want reps 2001-02-07 0 × 10)', r.kind, r.performed_on, r.weight_kg, r.reps;
  end if;

  -- The window cuts by date: from 10 Feb only bench e1rm + reps (14 Feb) remain.
  select count(*) into n from exercise_records('2001-02-10') where exercise_name like 'zz_check_%';
  if n <> 2 then raise exception 'FAIL exercise_records window: % rows (want 2)', n; end if;

  -- top_exercises: sessions with working sets only, all-time best by e1RM.
  select * into r from top_exercises('2001-01-01', 1000) where exercise_id = ex_bench;
  if r.session_count is distinct from 3::bigint or r.best_weight_kg is distinct from 80::numeric
     or r.best_reps is distinct from 10 or r.best_performed_on is distinct from '2001-02-14'::date then
    raise exception 'FAIL top_exercises bench: % sessions, best % × % on % (want 3, 80 × 10, 2001-02-14)',
      r.session_count, r.best_weight_kg, r.best_reps, r.best_performed_on;
  end if;
  select * into r from top_exercises('2001-01-01', 1000) where exercise_id = ex_pullup;
  if r.best_weight_kg is distinct from 0::numeric or r.best_reps is distinct from 10
     or r.best_performed_on is distinct from '2001-02-14'::date then
    raise exception 'FAIL top_exercises pull-up: best % × % on % (want 0 × 10, 2001-02-14)',
      r.best_weight_kg, r.best_reps, r.best_performed_on;
  end if;

  -- Tenancy: a different authenticated user sees nothing through anything.
  perform set_config('request.jwt.claims',
    json_build_object('sub', stranger, 'role', 'authenticated')::text, true);
  select count(*) into n from v_workout_stats;
  if n <> 0 then raise exception 'FAIL LEAK v_workout_stats: stranger sees % rows', n; end if;
  select count(*) into n from v_weekly_stats;
  if n <> 0 then raise exception 'FAIL LEAK v_weekly_stats: stranger sees % rows', n; end if;
  select count(*) into n from v_working_sets;
  if n <> 0 then raise exception 'FAIL LEAK v_working_sets: stranger sees % rows', n; end if;
  select count(*) into n from exercise_records('1900-01-01');
  if n <> 0 then raise exception 'FAIL LEAK exercise_records: stranger sees % rows', n; end if;
  select count(*) into n from top_exercises('1900-01-01', 1000);
  if n <> 0 then raise exception 'FAIL LEAK top_exercises: stranger sees % rows', n; end if;

  -- The option itself, in case a later migration recreates a view without it.
  select count(*) into n
    from pg_class c
   where c.relname in ('v_workout_stats', 'v_weekly_stats', 'v_working_sets')
     and exists (select 1 from unnest(c.reloptions) o
                  where o in ('security_invoker=on', 'security_invoker=true', 'security_invoker=1'));
  if n <> 3 then raise exception 'FAIL security_invoker is missing on % view(s)', 3 - n; end if;

  -- anon: no privilege at all. The inner block's own rollback also restores the role.
  begin
    execute 'set local role anon';
    perform count(*) from v_weekly_stats;
    raise exception 'FAIL anon can read v_weekly_stats';
  exception when insufficient_privilege then
    null;
  end;

  raise exception 'DASHBOARD_CHECKS_PASSED';
end $$;
```

- [ ] **Step 4: Apply the migration — ask Dominik first**

This writes to the production database (spec §10.9). Ask in chat, wait for an explicit yes. Then apply the file's contents with the Supabase MCP `apply_migration` tool, name `dashboard_views`. If the MCP is not authorised in this session, Dominik pastes the file into the Supabase SQL editor instead.

- [ ] **Step 5: Align the migration version**

`apply_migration` records its own timestamp. Read it with `list_migrations` and rename the file to match, exactly as commit `26f1bc5` did for the last migration. The file is not committed yet, so a plain `mv` (not `git mv`):

```bash
mv supabase/migrations/20260923120000_dashboard_views.sql supabase/migrations/<recorded_version>_dashboard_views.sql
```

- [ ] **Step 6: Run the check — ask Dominik first**

The check inserts fixture rows into the production database, then rolls them back. Ask before running it. Run `supabase/checks/dashboard_views.sql` via MCP `execute_sql` (or the SQL editor).
Expected: `ERROR: DASHBOARD_CHECKS_PASSED`. Any `FAIL …` → fix the migration with a *new* forward migration (the old one is already applied), then run the check again.

Afterwards, confirm nothing stuck:

```sql
select count(*) from exercises where name like 'zz_check_%';  -- expect 0
```

Also run `get_advisors` (security) and confirm no new lint for these five objects.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/*_dashboard_views.sql supabase/checks/dashboard_views.sql
git commit -m "feat(db): dashboard views and record functions, invoker-rights"
```

---

### Task 2: Date and weight helpers, dashboard types

**Files:**
- Modify: `src/lib/dates.ts`, `src/lib/dates.test.ts`
- Modify: `src/lib/workout-summary.ts`, `src/lib/workout-summary.test.ts`
- Modify: `src/lib/types.ts`

**Interfaces:**
- Produces:
  - `addDays(isoDate: string, days: number): string`
  - `mondayOf(isoDate: string): string`
  - `formatMovedWeight(kg: number): string`
  - types `WeekStat`, `DayStat`, `RecordKind`, `ExerciseRecord`, `TopExercise`, `DashboardData`

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/dates.test.ts` and extend its import to `import { addDays, formatPerformedOn, localDateString, mondayOf, startOfWeekMonday } from "@/lib/dates";`:

```ts
describe("addDays", () => {
  it("moves forward and backward across month and year boundaries", () => {
    expect(addDays("2026-09-23", 1)).toBe("2026-09-24");
    expect(addDays("2026-08-31", 1)).toBe("2026-09-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("2027-01-01", -1)).toBe("2026-12-31");
  });

  it("is not shifted by the daylight-saving switch", () => {
    expect(addDays("2026-03-29", 1)).toBe("2026-03-30"); // EU clocks go forward on 29 Mar
    expect(addDays("2026-10-25", 1)).toBe("2026-10-26"); // and back on 25 Oct
  });

  it("spans whole weeks", () => {
    expect(addDays("2026-09-21", -77)).toBe("2026-07-06");
  });
});

describe("mondayOf", () => {
  it("keeps a Monday and walks back from any other day", () => {
    expect(mondayOf("2026-09-21")).toBe("2026-09-21"); // Monday
    expect(mondayOf("2026-09-23")).toBe("2026-09-21"); // Wednesday
    expect(mondayOf("2026-08-23")).toBe("2026-08-17"); // Sunday
    expect(mondayOf("2026-09-02")).toBe("2026-08-31"); // across a month
  });

  it("agrees with startOfWeekMonday for every day of a month", () => {
    for (let day = 1; day <= 31; day++) {
      const iso = `2026-08-${String(day).padStart(2, "0")}`;
      expect(mondayOf(iso)).toBe(startOfWeekMonday(new Date(2026, 7, day)));
    }
  });
});
```

Append to `src/lib/workout-summary.test.ts` and add `formatMovedWeight` to its import:

```ts
describe("formatMovedWeight", () => {
  it("stays in kilos below 10.000", () => {
    expect(formatMovedWeight(9999)).toBe("9.999 kg");
    expect(formatMovedWeight(0)).toBe("0 kg");
  });

  it("switches to tonnes with one decimal from 10.000", () => {
    expect(formatMovedWeight(10000)).toBe("10 t");
    expect(formatMovedWeight(12480)).toBe("12,5 t");
  });

  it("drops the decimal from 100 t", () => {
    expect(formatMovedWeight(214380)).toBe("214 t");
    expect(formatMovedWeight(1234567)).toBe("1.235 t");
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run src/lib/dates.test.ts src/lib/workout-summary.test.ts`
Expected: FAIL — `addDays`, `mondayOf`, `formatMovedWeight` are not exported.

- [ ] **Step 3: Implement**

Append to `src/lib/dates.ts`:

```ts
/**
 * "2026-09-23" moved by `days` calendar days. Date-only in, date-only out:
 * UTC here is not a timezone choice but the absence of one, so no DST switch
 * can land the result on the wrong day.
 */
export function addDays(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/**
 * The Monday of the week containing `isoDate` — the same week Postgres'
 * `date_trunc('week', …)` gives, so app and views bucket identically.
 */
export function mondayOf(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay(); // Sunday = 0
  return addDays(isoDate, -((weekday + 6) % 7));
}
```

Append to `src/lib/workout-summary.ts`:

```ts
const TONNES_FORMAT = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 });

/**
 * Lifetime totals: kilos below 10.000, tonnes above — "214 t" is a number you
 * feel, "214.380 kg" one you read twice. One decimal below 100 t, where it
 * still moves visibly; whole tonnes above.
 */
export function formatMovedWeight(kg: number): string {
  if (kg < 10_000) return formatVolume(kg);
  const tonnes = kg / 1000;
  const value = tonnes < 100 ? TONNES_FORMAT.format(tonnes) : VOLUME_FORMAT.format(Math.round(tonnes));
  return `${value} t`;
}
```

Append to `src/lib/types.ts`:

```ts
/** One Monday-start week from `v_weekly_stats`. Weeks without a trained workout have no row. */
export type WeekStat = {
  weekStart: string; // "YYYY-MM-DD", always a Monday
  workoutCount: number;
  setCount: number;
  volumeKg: number;
};

/** One calendar day with every workout on it summed — the heatmap's unit. */
export type DayStat = {
  date: string; // "YYYY-MM-DD"
  setCount: number;
  volumeKg: number;
};

export type RecordKind = "weight" | "e1rm" | "reps";

/** One row of `exercise_records()`: the newest record of one kind for one exercise. */
export type ExerciseRecord = {
  exerciseId: string;
  exerciseName: string;
  kind: RecordKind;
  performedOn: string;
  weightKg: number;
  reps: number;
  e1rmKg: number;
};

/** One row of `top_exercises()`: sessions in the window, best set of all time. */
export type TopExercise = {
  exerciseId: string;
  exerciseName: string;
  sessionCount: number;
  best: { weightKg: number; reps: number; performedOn: string };
};

/**
 * Everything the dashboard reads. `null` means that block's query FAILED —
 * which the page must not render as "no data".
 */
export type DashboardData = {
  weeks: WeekStat[] | null; // all time, oldest first
  days: DayStat[] | null; // one row per workout inside the heatmap window
  records: ExerciseRecord[] | null;
  exercises: TopExercise[] | null;
};
```

- [ ] **Step 4: Run to see them pass**

Run: `npx vitest run src/lib/dates.test.ts src/lib/workout-summary.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/dates.ts src/lib/dates.test.ts src/lib/workout-summary.ts src/lib/workout-summary.test.ts src/lib/types.ts
git commit -m "feat(lib): date arithmetic, tonnes formatting and dashboard types"
```

---

### Task 3: Week maths — this week, streak, average, totals

**Files:**
- Create: `src/lib/dashboard-weeks.ts`
- Test: `src/lib/dashboard-weeks.test.ts`

**Interfaces:**
- Consumes: `addDays`, `mondayOf` (Task 2), `WeekStat` (Task 2).
- Produces:
  - `STREAK_THRESHOLD = 2`, `AVERAGE_WINDOW_WEEKS = 8`
  - `thisWeek(weeks: WeekStat[], today: string): WeekStat`
  - `currentStreak(weeks: WeekStat[], today: string, threshold?: number): number`
  - `weeklyAverage(weeks: WeekStat[], today: string, window?: number): { average: number; weekCount: number } | null`
  - `formatAverage(value: number): string`
  - `sumTotals(weeks: WeekStat[]): { workoutCount: number; setCount: number; volumeKg: number }`

- [ ] **Step 1: Write the failing tests**

`src/lib/dashboard-weeks.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  currentStreak,
  formatAverage,
  sumTotals,
  thisWeek,
  weeklyAverage,
} from "@/lib/dashboard-weeks";
import type { WeekStat } from "@/lib/types";

// Wednesday. Its week starts Monday 2026-09-21; the last completed week is 2026-09-14.
const TODAY = "2026-09-23";

function week(weekStart: string, workoutCount: number): WeekStat {
  return { weekStart, workoutCount, setCount: workoutCount * 10, volumeKg: workoutCount * 1000 };
}

describe("thisWeek", () => {
  it("returns the row for the week containing today", () => {
    expect(thisWeek([week("2026-09-14", 3), week("2026-09-21", 2)], TODAY)).toEqual(
      week("2026-09-21", 2)
    );
  });

  it("returns zeros when nothing was trained this week — an empty week is a real week", () => {
    expect(thisWeek([week("2026-09-14", 3)], TODAY)).toEqual({
      weekStart: "2026-09-21",
      workoutCount: 0,
      setCount: 0,
      volumeKg: 0,
    });
  });
});

describe("currentStreak", () => {
  it("counts back from the last completed week until one falls short", () => {
    const weeks = [
      week("2026-08-17", 4),
      week("2026-08-24", 1),
      week("2026-08-31", 2),
      week("2026-09-07", 2),
      week("2026-09-14", 3),
    ];
    expect(currentStreak(weeks, TODAY)).toBe(3);
  });

  it("lets the running week extend the streak once it reaches the threshold", () => {
    expect(currentStreak([week("2026-09-07", 2), week("2026-09-14", 3), week("2026-09-21", 2)], TODAY)).toBe(3);
  });

  it("never lets the running week break it — on a Wednesday it has not happened yet", () => {
    expect(currentStreak([week("2026-09-07", 2), week("2026-09-14", 3), week("2026-09-21", 1)], TODAY)).toBe(2);
  });

  it("treats a week without a row as zero workouts", () => {
    expect(currentStreak([week("2026-08-31", 2), week("2026-09-14", 2)], TODAY)).toBe(1);
  });

  it("starts over when the last completed week fell short", () => {
    expect(currentStreak([week("2026-09-07", 3), week("2026-09-14", 1), week("2026-09-21", 2)], TODAY)).toBe(1);
  });

  it("is zero without history", () => {
    expect(currentStreak([], TODAY)).toBe(0);
  });

  it("takes the threshold as a parameter", () => {
    expect(currentStreak([week("2026-09-14", 1)], TODAY, 1)).toBe(1);
  });
});

describe("weeklyAverage", () => {
  it("is null without history", () => {
    expect(weeklyAverage([], TODAY)).toBeNull();
  });

  it("is null while the only training is in the running week", () => {
    expect(weeklyAverage([week("2026-09-21", 2)], TODAY)).toBeNull();
  });

  it("averages completed weeks since the first one, empty weeks included", () => {
    // 2026-08-31: 2, 2026-09-07: nothing, 2026-09-14: 3 → 5 / 3
    const result = weeklyAverage([week("2026-08-31", 2), week("2026-09-14", 3)], TODAY);
    expect(result?.weekCount).toBe(3);
    expect(result?.average).toBeCloseTo(5 / 3, 5);
  });

  it("looks back at most eight completed weeks", () => {
    // Eight weeks back from 2026-09-14 is 2026-07-27; January is outside.
    const result = weeklyAverage([week("2026-01-05", 1), week("2026-09-14", 4)], TODAY);
    expect(result).toEqual({ average: 0.5, weekCount: 8 });
  });

  it("leaves the running week out", () => {
    expect(weeklyAverage([week("2026-09-14", 2), week("2026-09-21", 5)], TODAY)).toEqual({
      average: 2,
      weekCount: 1,
    });
  });
});

describe("formatAverage", () => {
  it("always shows one German decimal", () => {
    expect(formatAverage(2.375)).toBe("2,4");
    expect(formatAverage(2)).toBe("2,0");
    expect(formatAverage(1.25)).toBe("1,3");
  });
});

describe("sumTotals", () => {
  it("adds every week", () => {
    expect(sumTotals([week("2026-09-07", 2), week("2026-09-14", 3)])).toEqual({
      workoutCount: 5,
      setCount: 50,
      volumeKg: 5000,
    });
  });

  it("is zero without history", () => {
    expect(sumTotals([])).toEqual({ workoutCount: 0, setCount: 0, volumeKg: 0 });
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run src/lib/dashboard-weeks.test.ts`
Expected: FAIL — cannot resolve `@/lib/dashboard-weeks`.

- [ ] **Step 3: Implement**

`src/lib/dashboard-weeks.ts`:

```ts
import { addDays, mondayOf } from "@/lib/dates";
import type { WeekStat } from "@/lib/types";

/**
 * A week counts toward the streak at this many workouts (spec §9.3). A user
 * setting in phase 3 (Frequenzziel); a named constant until then.
 */
export const STREAK_THRESHOLD = 2;

/** How many completed weeks the Ø line looks back. */
export const AVERAGE_WINDOW_WEEKS = 8;

function countsByWeek(weeks: WeekStat[]): Map<string, number> {
  return new Map(weeks.map((w) => [w.weekStart, w.workoutCount]));
}

function firstWeekOf(weeks: WeekStat[]): string | null {
  return weeks.reduce<string | null>(
    (first, w) => (first === null || w.weekStart < first ? w.weekStart : first),
    null
  );
}

/** The week containing `today`, or zeros — a week without training is still a week. */
export function thisWeek(weeks: WeekStat[], today: string): WeekStat {
  const weekStart = mondayOf(today);
  return (
    weeks.find((w) => w.weekStart === weekStart) ?? {
      weekStart,
      workoutCount: 0,
      setCount: 0,
      volumeKg: 0,
    }
  );
}

/**
 * Consecutive weeks at or above `threshold`, counted back from the last
 * COMPLETED week. The running week can extend the streak but never break it:
 * on a Wednesday it simply has not happened yet.
 */
export function currentStreak(
  weeks: WeekStat[],
  today: string,
  threshold = STREAK_THRESHOLD
): number {
  const first = firstWeekOf(weeks);
  if (first === null) return 0;

  const counts = countsByWeek(weeks);
  const current = mondayOf(today);
  let streak = 0;
  // Bounded by the first logged week, so a threshold of 0 cannot loop forever.
  for (
    let week = addDays(current, -7);
    week >= first && (counts.get(week) ?? 0) >= threshold;
    week = addDays(week, -7)
  ) {
    streak += 1;
  }
  if ((counts.get(current) ?? 0) >= threshold) streak += 1;
  return streak;
}

/**
 * Ø workouts per completed week over the last `window` weeks — or fewer when
 * the log is younger: dividing three weeks of training by eight would report a
 * slump that never happened. Empty weeks inside the span count as 0; that is
 * the honest part. `null` until one week is complete.
 */
export function weeklyAverage(
  weeks: WeekStat[],
  today: string,
  window = AVERAGE_WINDOW_WEEKS
): { average: number; weekCount: number } | null {
  const first = firstWeekOf(weeks);
  if (first === null) return null;

  const counts = countsByWeek(weeks);
  let total = 0;
  let weekCount = 0;
  for (
    let week = addDays(mondayOf(today), -7);
    weekCount < window && week >= first;
    week = addDays(week, -7)
  ) {
    total += counts.get(week) ?? 0;
    weekCount += 1;
  }
  return weekCount === 0 ? null : { average: total / weekCount, weekCount };
}

const AVERAGE_FORMAT = new Intl.NumberFormat("de-DE", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/** 2.375 -> "2,4". Always one decimal, so "2,0" does not read as a different kind of number. */
export function formatAverage(value: number): string {
  return AVERAGE_FORMAT.format(value);
}

/** The lifetime odometer: the sum of every week, so it needs no query of its own. */
export function sumTotals(weeks: WeekStat[]): {
  workoutCount: number;
  setCount: number;
  volumeKg: number;
} {
  return weeks.reduce(
    (total, w) => ({
      workoutCount: total.workoutCount + w.workoutCount,
      setCount: total.setCount + w.setCount,
      volumeKg: total.volumeKg + w.volumeKg,
    }),
    { workoutCount: 0, setCount: 0, volumeKg: 0 }
  );
}
```

- [ ] **Step 4: Run to see them pass**

Run: `npx vitest run src/lib/dashboard-weeks.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/dashboard-weeks.ts src/lib/dashboard-weeks.test.ts
git commit -m "feat(dashboard): week bucketing, streak and weekly average"
```

---

### Task 4: Heatmap cells

**Files:**
- Create: `src/lib/dashboard-heatmap.ts`
- Test: `src/lib/dashboard-heatmap.test.ts`

**Interfaces:**
- Consumes: `addDays`, `mondayOf`, `formatPerformedOn` (dates), `formatVolume` (workout-summary), `DayStat`.
- Produces:
  - `HEATMAP_WEEKS = 12`
  - `type HeatmapLevel = 0 | 1 | 2 | 3 | 4`
  - `type HeatmapCell = { date: string; level: HeatmapLevel; setCount: number; volumeKg: number; isFuture: boolean }`
  - `heatmapStart(today: string, weeks?: number): string`
  - `sumByDay(rows: DayStat[]): DayStat[]`
  - `heatmapColumns(days: DayStat[], today: string, weeks?: number): HeatmapCell[][]`
  - `cellLabel(cell: HeatmapCell): string`
  - `trainingDayCount(columns: HeatmapCell[][]): number`

- [ ] **Step 1: Write the failing tests**

`src/lib/dashboard-heatmap.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  cellLabel,
  heatmapColumns,
  heatmapStart,
  sumByDay,
  trainingDayCount,
} from "@/lib/dashboard-heatmap";
import type { DayStat } from "@/lib/types";

const TODAY = "2026-09-23"; // Wednesday

function day(date: string, setCount: number, volumeKg: number): DayStat {
  return { date, setCount, volumeKg };
}

function cellOn(days: DayStat[], date: string) {
  const cell = heatmapColumns(days, TODAY).flat().find((c) => c.date === date);
  if (!cell) throw new Error(`no cell for ${date}`);
  return cell;
}

describe("heatmapStart", () => {
  it("is the Monday eleven weeks before this week's Monday", () => {
    expect(heatmapStart(TODAY)).toBe("2026-07-06");
  });
});

describe("heatmapColumns", () => {
  it("is 12 columns of 7 days, oldest first, Monday on top, ending with this week", () => {
    const columns = heatmapColumns([], TODAY);
    expect(columns).toHaveLength(12);
    expect(columns.every((column) => column.length === 7)).toBe(true);
    expect(columns[0][0].date).toBe("2026-07-06");
    expect(columns[11][0].date).toBe("2026-09-21");
    expect(columns[11][6].date).toBe("2026-09-27");
  });

  it("marks the days after today as future", () => {
    const columns = heatmapColumns([], TODAY);
    expect(columns[11][2]).toMatchObject({ date: "2026-09-23", isFuture: false });
    expect(columns[11][3]).toMatchObject({ date: "2026-09-24", isFuture: true });
  });

  it("gives a day without sets level 0", () => {
    expect(cellOn([day("2026-09-02", 5, 4000)], "2026-09-01").level).toBe(0);
  });

  it("never gives a day with sets level 0, even at 0 kg — a pull-up day is a training day", () => {
    expect(cellOn([day("2026-09-01", 10, 0)], "2026-09-01").level).toBe(1);
    expect(cellOn([day("2026-09-01", 10, 0), day("2026-09-02", 5, 4000)], "2026-09-01").level).toBe(1);
  });

  it("scales levels 1–4 against the heaviest day in the window", () => {
    const days = [
      day("2026-09-01", 5, 4000),
      day("2026-09-02", 5, 3000),
      day("2026-09-03", 5, 2001),
      day("2026-09-07", 5, 2000),
      day("2026-09-08", 5, 1),
    ];
    expect(cellOn(days, "2026-09-01").level).toBe(4);
    expect(cellOn(days, "2026-09-02").level).toBe(3);
    expect(cellOn(days, "2026-09-03").level).toBe(3);
    expect(cellOn(days, "2026-09-07").level).toBe(2);
    expect(cellOn(days, "2026-09-08").level).toBe(1);
  });

  it("ignores days outside the window when scaling", () => {
    expect(cellOn([day("2026-06-01", 5, 10000), day("2026-09-01", 5, 4000)], "2026-09-01").level).toBe(4);
  });

  it("sums two workouts on the same day into one cell", () => {
    const cell = cellOn([day("2026-09-01", 5, 1000), day("2026-09-01", 3, 500)], "2026-09-01");
    expect(cell).toMatchObject({ setCount: 8, volumeKg: 1500 });
  });
});

describe("sumByDay", () => {
  it("merges rows with the same date and keeps the others", () => {
    expect(sumByDay([day("2026-09-01", 5, 1000), day("2026-09-02", 1, 10), day("2026-09-01", 3, 500)])).toEqual([
      day("2026-09-01", 8, 1500),
      day("2026-09-02", 1, 10),
    ]);
  });
});

describe("cellLabel", () => {
  it("names date, sets and volume for a training day", () => {
    expect(cellLabel({ date: "2026-09-01", level: 2, setCount: 8, volumeKg: 1500, isFuture: false })).toBe(
      "1. Sep · 8 Sätze · 1.500 kg"
    );
    expect(cellLabel({ date: "2026-09-01", level: 1, setCount: 1, volumeKg: 0, isFuture: false })).toBe(
      "1. Sep · 1 Satz · 0 kg"
    );
  });

  it("says so for a rest day", () => {
    expect(cellLabel({ date: "2026-09-01", level: 0, setCount: 0, volumeKg: 0, isFuture: false })).toBe(
      "1. Sep · kein Training"
    );
  });
});

describe("trainingDayCount", () => {
  it("counts past days with sets", () => {
    expect(trainingDayCount(heatmapColumns([day("2026-09-01", 5, 1000), day("2026-09-02", 1, 0)], TODAY))).toBe(2);
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run src/lib/dashboard-heatmap.test.ts`
Expected: FAIL — cannot resolve `@/lib/dashboard-heatmap`.

- [ ] **Step 3: Implement**

`src/lib/dashboard-heatmap.ts`:

```ts
import { addDays, formatPerformedOn, mondayOf } from "@/lib/dates";
import { formatVolume } from "@/lib/workout-summary";
import type { DayStat } from "@/lib/types";

export const HEATMAP_WEEKS = 12;

/** 0 = no sets; 1–4 = the four lime steps of DESIGN_SYSTEM.md §2. */
export type HeatmapLevel = 0 | 1 | 2 | 3 | 4;

export type HeatmapCell = {
  date: string;
  level: HeatmapLevel;
  setCount: number;
  volumeKg: number;
  isFuture: boolean;
};

/** The Monday the window opens on: `weeks - 1` weeks before this week's Monday. */
export function heatmapStart(today: string, weeks = HEATMAP_WEEKS): string {
  return addDays(mondayOf(today), -7 * (weeks - 1));
}

/** One row per workout in, one row per calendar day out. */
export function sumByDay(rows: DayStat[]): DayStat[] {
  const byDate = new Map<string, DayStat>();
  for (const row of rows) {
    const current = byDate.get(row.date);
    byDate.set(
      row.date,
      current
        ? {
            date: row.date,
            setCount: current.setCount + row.setCount,
            volumeKg: current.volumeKg + row.volumeKg,
          }
        : { ...row }
    );
  }
  return [...byDate.values()];
}

function levelFor(setCount: number, volumeKg: number, maxVolumeKg: number): HeatmapLevel {
  if (setCount === 0) return 0;
  // A day with sets is a training day even at 0 kg: the calendar must never
  // call a pull-up day a rest day.
  if (maxVolumeKg === 0) return 1;
  return Math.max(1, Math.ceil((volumeKg / maxVolumeKg) * 4)) as HeatmapLevel;
}

/**
 * `weeks` columns of 7 cells, oldest column first, Monday on top. Levels scale
 * against the heaviest day inside the window, so the calendar re-scales as the
 * lifts grow instead of saturating.
 */
export function heatmapColumns(
  days: DayStat[],
  today: string,
  weeks = HEATMAP_WEEKS
): HeatmapCell[][] {
  const start = heatmapStart(today, weeks);
  const byDate = new Map(sumByDay(days).map((d) => [d.date, d]));

  let maxVolumeKg = 0;
  for (const d of byDate.values()) {
    if (d.date >= start && d.date <= today) maxVolumeKg = Math.max(maxVolumeKg, d.volumeKg);
  }

  const columns: HeatmapCell[][] = [];
  for (let w = 0; w < weeks; w++) {
    const column: HeatmapCell[] = [];
    for (let d = 0; d < 7; d++) {
      const date = addDays(start, w * 7 + d);
      const setCount = byDate.get(date)?.setCount ?? 0;
      const volumeKg = byDate.get(date)?.volumeKg ?? 0;
      column.push({
        date,
        level: levelFor(setCount, volumeKg, maxVolumeKg),
        setCount,
        volumeKg,
        isFuture: date > today,
      });
    }
    columns.push(column);
  }
  return columns;
}

/** The per-cell `title`: "1. Sep · 8 Sätze · 1.500 kg" or "1. Sep · kein Training". */
export function cellLabel(cell: HeatmapCell): string {
  const date = formatPerformedOn(cell.date);
  if (cell.setCount === 0) return `${date} · kein Training`;
  const sets = `${cell.setCount} ${cell.setCount === 1 ? "Satz" : "Sätze"}`;
  return `${date} · ${sets} · ${formatVolume(cell.volumeKg)}`;
}

/** For the grid's aria-label: past days with at least one set. */
export function trainingDayCount(columns: HeatmapCell[][]): number {
  return columns.flat().filter((cell) => !cell.isFuture && cell.setCount > 0).length;
}
```

- [ ] **Step 4: Run to see them pass**

Run: `npx vitest run src/lib/dashboard-heatmap.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/dashboard-heatmap.ts src/lib/dashboard-heatmap.test.ts
git commit -m "feat(dashboard): 12-week heatmap cells and levels"
```

---

### Task 5: Record picking and lift formatting

**Files:**
- Create: `src/lib/records.ts`
- Test: `src/lib/records.test.ts`

**Interfaces:**
- Consumes: `formatWeight` (sets), `ExerciseRecord`, `RecordKind`.
- Produces:
  - `RECORDS_WINDOW_DAYS = 30`
  - `pickRecords(rows: ExerciseRecord[]): ExerciseRecord[]`
  - `formatLift(weightKg: number, reps: number): string`
  - `recordLabel(record: ExerciseRecord): string`

- [ ] **Step 1: Write the failing tests**

`src/lib/records.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { formatLift, pickRecords, recordLabel } from "@/lib/records";
import type { ExerciseRecord, RecordKind } from "@/lib/types";

function record(
  exerciseId: string,
  exerciseName: string,
  kind: RecordKind,
  performedOn: string,
  weightKg = 80,
  reps = 5,
  e1rmKg = 93.3
): ExerciseRecord {
  return { exerciseId, exerciseName, kind, performedOn, weightKg, reps, e1rmKg };
}

describe("pickRecords", () => {
  it("keeps one line per exercise: the newest record", () => {
    const picked = pickRecords([
      record("a", "Bankdrücken", "weight", "2026-09-10"),
      record("a", "Bankdrücken", "reps", "2026-09-20"),
    ]);
    expect(picked).toEqual([record("a", "Bankdrücken", "reps", "2026-09-20")]);
  });

  it("prefers the strongest claim when one session set several: Gewicht, e1RM, Wiederholungen", () => {
    const picked = pickRecords([
      record("a", "Bankdrücken", "reps", "2026-09-20"),
      record("a", "Bankdrücken", "e1rm", "2026-09-20"),
    ]);
    expect(picked.map((r) => r.kind)).toEqual(["e1rm"]);

    const withWeight = pickRecords([
      record("a", "Bankdrücken", "e1rm", "2026-09-20"),
      record("a", "Bankdrücken", "weight", "2026-09-20"),
    ]);
    expect(withWeight.map((r) => r.kind)).toEqual(["weight"]);
  });

  it("orders newest first, then by name", () => {
    const picked = pickRecords([
      record("b", "Klimmzüge", "reps", "2026-09-10"),
      record("c", "Kniebeuge", "weight", "2026-09-20"),
      record("a", "Bankdrücken", "weight", "2026-09-20"),
    ]);
    expect(picked.map((r) => r.exerciseName)).toEqual(["Bankdrücken", "Kniebeuge", "Klimmzüge"]);
  });

  it("returns nothing for nothing", () => {
    expect(pickRecords([])).toEqual([]);
  });
});

describe("formatLift", () => {
  it("writes weight × reps with the German comma", () => {
    expect(formatLift(85, 5)).toBe("85 kg × 5");
    expect(formatLift(82.5, 8)).toBe("82,5 kg × 8");
  });

  it("writes bodyweight as reps only — '0 kg × 12' reads like an error", () => {
    expect(formatLift(0, 12)).toBe("12 Wdh.");
  });
});

describe("recordLabel", () => {
  it("names each kind", () => {
    expect(recordLabel(record("a", "Bankdrücken", "weight", "2026-09-20"))).toBe("bester Satz");
    expect(recordLabel(record("a", "Kreuzheben", "e1rm", "2026-09-20", 140, 3, 153.6))).toBe(
      "bester e1RM 154 kg"
    );
    expect(recordLabel(record("a", "Klimmzüge", "reps", "2026-09-20", 0, 12, 0))).toBe("meiste Wdh.");
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run src/lib/records.test.ts`
Expected: FAIL — cannot resolve `@/lib/records`.

- [ ] **Step 3: Implement**

`src/lib/records.ts`:

```ts
import { formatWeight } from "@/lib/sets";
import type { ExerciseRecord, RecordKind } from "@/lib/types";

/** „Neue Rekorde“ looks back this many days, today included (spec §9.7). */
export const RECORDS_WINDOW_DAYS = 30;

/** Strongest claim first, for a session that set several records at once (spec §10.5). */
const KIND_PRIORITY: Record<RecordKind, number> = { weight: 0, e1rm: 1, reps: 2 };

/**
 * One line per exercise: its newest record, and when that session set several,
 * the strongest claim. `exercise_records()` returns up to three rows per
 * exercise, often for the same set — listing them all would crowd out every
 * other exercise.
 */
export function pickRecords(rows: ExerciseRecord[]): ExerciseRecord[] {
  const picked = new Map<string, ExerciseRecord>();
  for (const row of rows) {
    const current = picked.get(row.exerciseId);
    if (
      !current ||
      row.performedOn > current.performedOn ||
      (row.performedOn === current.performedOn &&
        KIND_PRIORITY[row.kind] < KIND_PRIORITY[current.kind])
    ) {
      picked.set(row.exerciseId, row);
    }
  }
  return [...picked.values()].sort(
    (a, b) =>
      b.performedOn.localeCompare(a.performedOn) ||
      a.exerciseName.localeCompare(b.exerciseName, "de")
  );
}

/** "85 kg × 5", or "12 Wdh." for bodyweight — "0 kg × 12" reads like an error. */
export function formatLift(weightKg: number, reps: number): string {
  return weightKg === 0 ? `${reps} Wdh.` : `${formatWeight(weightKg)} kg × ${reps}`;
}

/** What the record claims, under the exercise name. */
export function recordLabel(record: ExerciseRecord): string {
  switch (record.kind) {
    case "weight":
      return "bester Satz";
    case "e1rm":
      return `bester e1RM ${Math.round(record.e1rmKg)} kg`;
    case "reps":
      return "meiste Wdh.";
  }
}
```

- [ ] **Step 4: Run to see them pass**

Run: `npx vitest run src/lib/records.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/records.ts src/lib/records.test.ts
git commit -m "feat(dashboard): pick one record per exercise, format lifts"
```

---

### Task 6: Data layer

**Files:**
- Create: `src/lib/data/dashboard.ts`

**Interfaces:**
- Consumes: the five SQL objects (Task 1), `addDays` (Task 2), `heatmapStart` (Task 4), `RECORDS_WINDOW_DAYS` (Task 5), types (Task 2).
- Produces: `getDashboardData(today: string): Promise<DashboardData>`, `TOP_EXERCISE_COUNT = 5`.

No unit test: `server-only` code talking to Supabase, and this repo has no harness for it — same as `src/lib/data/workouts.ts`. It is verified against the real database in Task 8.

- [ ] **Step 1: Implement**

`src/lib/data/dashboard.ts`:

```ts
import "server-only";

import { heatmapStart } from "@/lib/dashboard-heatmap";
import { addDays } from "@/lib/dates";
import { RECORDS_WINDOW_DAYS } from "@/lib/records";
import { createServerSupabase } from "@/lib/supabase/server";
import type {
  DashboardData,
  DayStat,
  ExerciseRecord,
  RecordKind,
  TopExercise,
  WeekStat,
} from "@/lib/types";

/** „Deine Übungen“ shows this many (spec §10.6). */
export const TOP_EXERCISE_COUNT = 5;

/** PostgREST may hand `numeric` and `bigint` back as strings. */
type Num = number | string;

type RawWeek = { week_start: string; workout_count: Num; set_count: Num; volume_kg: Num };
type RawWorkoutStat = { performed_on: string; set_count: Num; volume_kg: Num };
type RawRecord = {
  exercise_id: string;
  exercise_name: string;
  kind: RecordKind;
  performed_on: string;
  weight_kg: Num;
  reps: number;
  e1rm_kg: Num;
};
type RawTopExercise = {
  exercise_id: string;
  exercise_name: string;
  session_count: Num;
  best_weight_kg: Num;
  best_reps: number;
  best_performed_on: string;
};

/**
 * Everything the dashboard shows, in four parallel queries — all aggregated in
 * Postgres (spec §7), all filtered to the caller by RLS through the
 * invoker-rights views.
 *
 * Each block degrades on its own: a failed query yields `null` for that block
 * and the rest of the page still renders. One broken block must never blank
 * the tab.
 */
export async function getDashboardData(today: string): Promise<DashboardData> {
  const supabase = await createServerSupabase();
  const windowStart = heatmapStart(today);
  const recordsSince = addDays(today, -(RECORDS_WINDOW_DAYS - 1));

  const [weeksResult, daysResult, recordsResult, exercisesResult] = await Promise.all([
    supabase
      .from("v_weekly_stats")
      .select("week_start, workout_count, set_count, volume_kg")
      .order("week_start"),
    supabase
      .from("v_workout_stats")
      .select("performed_on, set_count, volume_kg")
      .gte("performed_on", windowStart)
      .lte("performed_on", today),
    supabase.rpc("exercise_records", { p_since: recordsSince }),
    supabase.rpc("top_exercises", { p_since: windowStart, p_limit: TOP_EXERCISE_COUNT }),
  ]);

  if (weeksResult.error) {
    console.error("getDashboardData: failed to load weekly stats", weeksResult.error);
  }
  if (daysResult.error) {
    console.error("getDashboardData: failed to load workout stats", { windowStart }, daysResult.error);
  }
  if (recordsResult.error) {
    console.error("getDashboardData: failed to load records", { recordsSince }, recordsResult.error);
  }
  if (exercisesResult.error) {
    console.error("getDashboardData: failed to load top exercises", { windowStart }, exercisesResult.error);
  }

  const weeks: WeekStat[] | null = weeksResult.error
    ? null
    : ((weeksResult.data ?? []) as unknown as RawWeek[]).map((w) => ({
        weekStart: w.week_start,
        workoutCount: Number(w.workout_count),
        setCount: Number(w.set_count),
        volumeKg: Number(w.volume_kg),
      }));

  const days: DayStat[] | null = daysResult.error
    ? null
    : ((daysResult.data ?? []) as unknown as RawWorkoutStat[]).map((d) => ({
        date: d.performed_on,
        setCount: Number(d.set_count),
        volumeKg: Number(d.volume_kg),
      }));

  const records: ExerciseRecord[] | null = recordsResult.error
    ? null
    : ((recordsResult.data ?? []) as unknown as RawRecord[]).map((r) => ({
        exerciseId: r.exercise_id,
        exerciseName: r.exercise_name,
        kind: r.kind,
        performedOn: r.performed_on,
        weightKg: Number(r.weight_kg),
        reps: r.reps,
        e1rmKg: Number(r.e1rm_kg),
      }));

  const exercises: TopExercise[] | null = exercisesResult.error
    ? null
    : ((exercisesResult.data ?? []) as unknown as RawTopExercise[]).map((e) => ({
        exerciseId: e.exercise_id,
        exerciseName: e.exercise_name,
        sessionCount: Number(e.session_count),
        best: {
          weightKg: Number(e.best_weight_kg),
          reps: e.best_reps,
          performedOn: e.best_performed_on,
        },
      }));

  return { weeks, days, records, exercises };
}
```

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/data/dashboard.ts
git commit -m "feat(dashboard): data layer over the dashboard views"
```

---

### Task 7: The six blocks and the page

**Files:**
- Create: `src/components/dashboard/section.tsx`, `stat-tiles.tsx`, `streak-line.tsx`, `week-heatmap.tsx`, `records-list.tsx`, `exercise-list.tsx`, `totals-row.tsx`
- Modify: `src/app/dashboard/page.tsx`

**Interfaces:**
- Consumes: everything from Tasks 2–6. All components are server components with plain props — no `"use client"` anywhere in this task.

Visibility rules this task implements (spec §2 + §10):

| Block | Shown when | Otherwise |
|---|---|---|
| Diese Woche | always | — (zeros are honest here) |
| Rhythmus | ≥ 2 completed weeks since the first trained one | hidden |
| Letzte 12 Wochen | always | — reads as a calendar when empty |
| Neue Rekorde | always | empty text, two variants (see `RecordsList`) |
| Deine Übungen | ≥ 3 trained workouts | hidden |
| Seit Beginn | always | — |
| *whole page* | ≥ 1 trained workout | page-level empty state with the primary action |

Any block whose query failed (`null`) renders `BlockError` instead of its content — never a zero that looks like data.

- [ ] **Step 1: `section.tsx`**

```tsx
import type { ReactNode } from "react";

/** One dashboard block: the small uppercase label, then its content. */
export function DashboardSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

/** What a block says when its query failed — never a zero that looks like data. */
export function BlockError() {
  return <p className="text-sm text-muted-foreground">Konnte gerade nicht geladen werden.</p>;
}
```

- [ ] **Step 2: `stat-tiles.tsx`**

No delta against last week — spec §10.2.

```tsx
import { Card, CardContent } from "@/components/ui/card";
import type { WeekStat } from "@/lib/types";
import { formatKilos } from "@/lib/workout-summary";

/** „Diese Woche“: the two numbers the end-of-workout summary speaks in, one level up. */
export function StatTiles({ week }: { week: WeekStat }) {
  return (
    <>
      {/* One <dl> per card: a <dl> may only wrap its dt/dd pairs in a single
          <div>, and a Card is two. */}
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardContent className="px-4">
            <dl className="flex flex-col-reverse">
              <dt className="text-sm text-muted-foreground">
                {week.workoutCount === 1 ? "Workout" : "Workouts"}
              </dt>
              <dd className="text-3xl leading-tight font-bold tabular-nums">{week.workoutCount}</dd>
            </dl>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="px-4">
            <dl className="flex flex-col-reverse">
              <dt className="text-sm text-muted-foreground">kg bewegt</dt>
              <dd className="text-3xl leading-tight font-bold tabular-nums">
                {formatKilos(week.volumeKg)}
              </dd>
            </dl>
          </CardContent>
        </Card>
      </div>

      {/* Same note as the end-of-workout dialog: a pull-up week must not
          silently read as "0 kg" (spec §4). */}
      {week.setCount > 0 && week.volumeKg === 0 && (
        <p className="mt-2 text-sm text-muted-foreground">
          Körpergewichtssätze zählen mit 0 kg – dafür fehlt noch dein Körpergewicht.
        </p>
      )}
    </>
  );
}
```

- [ ] **Step 3: `streak-line.tsx`**

```tsx
import { formatAverage, STREAK_THRESHOLD } from "@/lib/dashboard-weeks";

/** Below this, a "streak" is just a week — shown only as the average (spec §10.8). */
const MIN_STREAK_SHOWN = 2;

type Props = {
  streak: number;
  average: { average: number; weekCount: number };
};

/** „Rhythmus“: the Ø line always, the streak only once there is one worth naming. */
export function StreakLine({ streak, average }: Props) {
  const span = average.weekCount === 1 ? "letzte Woche" : `letzte ${average.weekCount} Wochen`;
  return (
    <p className="text-sm tabular-nums">
      {streak >= MIN_STREAK_SHOWN && (
        <>
          <span className="font-semibold">{streak} Wochen in Folge</span> mit {STREAK_THRESHOLD}+
          Workouts ·{" "}
        </>
      )}
      Ø {formatAverage(average.average)} pro Woche{" "}
      <span className="text-muted-foreground">({span})</span>
    </p>
  );
}
```

- [ ] **Step 4: `week-heatmap.tsx`**

```tsx
import { cellLabel, trainingDayCount, type HeatmapCell, type HeatmapLevel } from "@/lib/dashboard-heatmap";
import { cn } from "@/lib/utils";

/** `--muted`, then lime in four steps (DESIGN_SYSTEM.md §2). */
const LEVEL_CLASS: Record<HeatmapLevel, string> = {
  0: "bg-muted",
  1: "bg-primary/25",
  2: "bg-primary/50",
  3: "bg-primary/75",
  4: "bg-primary",
};

const LEVELS: HeatmapLevel[] = [0, 1, 2, 3, 4];

/**
 * The 12-week calendar: one column per week, Monday on top. A plain div grid
 * (spec §2.3) — `role="img"` with a summary for screen readers, a `title` per
 * day, and a legend, because a colour ramp means nothing without one.
 */
export function WeekHeatmap({ columns }: { columns: HeatmapCell[][] }) {
  const trainingDays = trainingDayCount(columns);
  return (
    <div>
      <div
        role="img"
        aria-label={`${trainingDays} ${trainingDays === 1 ? "Trainingstag" : "Trainingstage"} in den letzten ${columns.length} Wochen`}
        className="grid auto-cols-fr grid-flow-col grid-rows-7 gap-1"
      >
        {columns.flat().map((cell) => (
          <div
            key={cell.date}
            title={cell.isFuture ? undefined : cellLabel(cell)}
            className={cn(
              "aspect-square rounded-sm",
              cell.isFuture ? "bg-transparent" : LEVEL_CLASS[cell.level]
            )}
          />
        ))}
      </div>

      <div
        aria-hidden="true"
        className="mt-2 flex items-center justify-end gap-1 text-xs text-muted-foreground"
      >
        <span className="mr-1">weniger</span>
        {LEVELS.map((level) => (
          <span key={level} className={cn("size-3 rounded-sm", LEVEL_CLASS[level])} />
        ))}
        <span className="ml-1">mehr</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: `records-list.tsx`**

Two empty texts: the spec's copy is only true while no exercise has a second session yet. With history, "no record in 30 days" is the honest line — and neutral, per `DESIGN_SYSTEM.md` §7.

```tsx
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
    <ul className="flex flex-col gap-3">
      {records.map((record) => (
        <li key={record.exerciseId} className="flex items-baseline justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate">{record.exerciseName}</p>
            <p className="text-sm text-muted-foreground">{recordLabel(record)}</p>
          </div>
          <div className="shrink-0 text-right tabular-nums">
            <p className="font-semibold">{formatLift(record.weightKg, record.reps)}</p>
            <p className="text-sm text-muted-foreground">{formatPerformedOn(record.performedOn)}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 6: `exercise-list.tsx`**

Plain rows, no links (spec §10.6).

```tsx
import { formatPerformedOn } from "@/lib/dates";
import { HEATMAP_WEEKS } from "@/lib/dashboard-heatmap";
import { formatLift } from "@/lib/records";
import type { TopExercise } from "@/lib/types";

/** „Deine Übungen“. Rows become links once the exercise page exists (phase 2). */
export function ExerciseList({ exercises }: { exercises: TopExercise[] }) {
  if (exercises.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        In den letzten {HEATMAP_WEEKS} Wochen noch keine Arbeitssätze.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {exercises.map((exercise) => (
        <li key={exercise.exerciseId} className="flex items-baseline justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate">{exercise.exerciseName}</p>
            <p className="text-sm text-muted-foreground tabular-nums">
              {exercise.sessionCount}× in {HEATMAP_WEEKS} Wochen
            </p>
          </div>
          <div className="shrink-0 text-right tabular-nums">
            <p className="font-semibold">{formatLift(exercise.best.weightKg, exercise.best.reps)}</p>
            <p className="text-sm text-muted-foreground">
              Bestwert · {formatPerformedOn(exercise.best.performedOn)}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 7: `totals-row.tsx`**

```tsx
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
```

- [ ] **Step 8: `src/app/dashboard/page.tsx` — replace the placeholder**

```tsx
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
```

- [ ] **Step 9: Full local gate**

Run: `npm run lint && npm run test && npm run build`
Expected: lint clean, every vitest file passing (97 before this plan plus the new ones), build route table still lists `/dashboard` as `ƒ (Dynamic)`.

- [ ] **Step 10: Commit**

```bash
git add src/components/dashboard src/app/dashboard/page.tsx
git commit -m "feat(dashboard): six blocks — week, Rhythmus, heatmap, records, exercises, totals"
```

---

### Task 8: Verify against real data, update the monorepo plan, open the PR

**Files:**
- Modify: `docs/superpowers/plans/2026-09-15-monorepo-and-pwa.md`

- [ ] **Step 1: Look at it**

Start the dev server with `preview_start` (add a `.claude/launch.json` entry `npm run dev`, port 3000, if none exists). The test user's password is known only to Dominik: ask him to log in inside the preview pane, then open `/dashboard`. Check:
- no console or server errors (`read_console_messages`, `preview_logs`);
- phone width (`resize_window` preset `mobile`): the heatmap fits without horizontal scroll, and future days of this week are blank;
- a screenshot for the PR.

- [ ] **Step 2: Check every figure by hand**

A dashboard that is merely plausible is worse than none. Run this read-only query (MCP `execute_sql`) and compare it with „Seit Beginn“ and „Diese Woche“:

```sql
-- Raw truth, bypassing the views: trained workouts, sets, volume — all time and this week.
with per_workout as (
  select w.id, w.performed_on, count(s.id) as sets, coalesce(sum(s.weight_kg * s.reps), 0) as volume
    from workouts w
    left join workout_exercises we on we.workout_id = w.id
    left join sets s on s.workout_exercise_id = we.id
   where w.user_id = '4458ae8e-cf70-4ba5-8416-e9e7983cf181'
   group by w.id
)
select 'all time' as span, count(*) filter (where sets > 0) as workouts, sum(sets) as sets, sum(volume) as volume
  from per_workout
union all
select 'this week', count(*) filter (where sets > 0), coalesce(sum(sets), 0), coalesce(sum(volume), 0)
  from per_workout
 where performed_on >= date_trunc('week', (now() at time zone 'Europe/Berlin')::date::timestamp)::date;
```

Then open one exercise from „Neue Rekorde“ on the log screen and confirm the record against its sessions. Note any mismatch in the PR, and do not open the PR until it is explained.

- [ ] **Step 3: Update the monorepo plan**

In `docs/superpowers/plans/2026-09-15-monorepo-and-pwa.md`:
- In **Global Constraints**, replace the "97 tests in 6 files" figure with the count `npm run test` reports now (tests and files), and add the date: "measured after the dashboard landed, 2026-09-xx".
- Add a note at the head of **Task 2**:

```markdown
> **Since 2026-09-23 (dashboard phase 1):** `src/lib/dashboard-weeks.ts`,
> `dashboard-heatmap.ts`, `records.ts` and `src/lib/data/dashboard.ts` stay in
> `apps/web` — the dashboard is not in the native v1 scope (spec D7). They import
> `@/lib/dates`, `@/lib/sets`, `@/lib/types` and `@/lib/workout-summary`, which
> this task moves to `@gymtrack/core`, so the import rewiring must include them.
> `dates.ts` gained `addDays`/`mondayOf` and `workout-summary.ts` gained
> `formatMovedWeight`; both move with their modules.
```

```bash
git add docs/superpowers/plans/2026-09-15-monorepo-and-pwa.md
git commit -m "docs: point the monorepo plan at the dashboard modules"
```

- [ ] **Step 4: Push and open the PR against `staging`**

```bash
git push -u origin claude/dashboard-phase-1
gh pr create --base staging --title "Dashboard phase 1: six blocks, Postgres aggregation" --body "<summary, the check-script result, the hand-check from Step 2, the screenshot>"
```

The migration is already live (Task 1, one database), so staging can deploy straight away. Merging is Dominik's.
