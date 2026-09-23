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
