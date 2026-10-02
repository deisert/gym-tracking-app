-- Exercise detail page (docs/superpowers/specs/2026-09-30-exercise-detail-page-design.md §7).
--
-- Same rules as 20260923200014_dashboard_views.sql, for the same reasons:
--   * every view is `security_invoker = on` — a default view runs as its owner
--     and would serve every user everyone else's rows past the RLS policies;
--   * Epley and volume are computed HERE, with exactly the expressions of
--     v_working_sets / v_workout_stats, so the app never carries a second copy
--     of either formula. The app only takes max and sum of these numbers.
--
-- Purely additive. There is one database for staging and production, so this
-- lands on production the moment it is applied.

-- Every set of every exercise — warm-ups and dropsets included, because the
-- page needs both: volume counts every set, bests count working sets only
-- (2026-09-03-total-volume-evaluation.md §5.1, dashboard spec §3.1). The app
-- filters by exercise_id; RLS on the underlying tables filters by owner.
create view v_exercise_sets with (security_invoker = on) as
  select w.user_id,
         we.exercise_id,
         w.id as workout_id,
         w.performed_on,
         w.created_at as workout_created_at,
         w.category,
         we.id as workout_exercise_id,
         we.position as exercise_position,
         we.note,
         we.attributes,
         s.id as set_id,
         s.position,
         s.weight_kg,
         s.reps,
         s.unclean_reps,
         s.is_warmup,
         s.is_dropset,
         s.weight_kg * s.reps as volume_kg,
         round(s.weight_kg * (1 + s.reps / 30.0), 1) as e1rm_kg
    from sets s
    join workout_exercises we on we.id = s.workout_exercise_id
    join workouts w on w.id = we.workout_id;

-- „Alle Übungen“: one row per exercise that has at least one working set.
-- A session is a workout with a working set of the exercise — the same count
-- top_exercises() uses, so both screens agree on „46 Sessions“.
create view v_exercise_overview with (security_invoker = on) as
  select e.id as exercise_id,
         e.user_id,
         e.name,
         e.is_archived,
         count(distinct ws.workout_id) as session_count,
         min(ws.performed_on) as first_performed_on,
         max(ws.performed_on) as last_performed_on
    from exercises e
    join v_working_sets ws on ws.exercise_id = e.id
   group by e.id;

-- Supabase's default privileges hand every new object in `public` to anon as
-- well. Nothing here is meant for a logged-out caller, and both are read-only.
revoke all on v_exercise_sets, v_exercise_overview from anon, authenticated;
grant select on v_exercise_sets, v_exercise_overview to authenticated;
