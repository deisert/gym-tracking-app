-- Exercise detail views: correctness and tenancy check against the real database.
--
-- Same mechanics as dashboard_views.sql: there is one Supabase project, so this
-- runs where the production rows live and ALWAYS aborts — its last statement
-- raises, which rolls back every fixture row it inserted.
--
--   Pass:  ERROR: EXERCISE_DETAIL_CHECKS_PASSED
--   Fail:  ERROR: FAIL ...   (or any other error)
--
-- Run as ONE statement: Supabase SQL editor, or the MCP `execute_sql` tool.
-- Fixtures are dated 2001 so nothing collides with real history.

do $$
declare
  me constant uuid := '4458ae8e-cf70-4ba5-8416-e9e7983cf181';
  stranger constant uuid := '00000000-0000-0000-0000-000000000001';
  ex_bench uuid;
  ex_never uuid;
  w1 uuid;
  w2 uuid;
  w_warmup uuid;
  we uuid;
  n bigint;
  r record;
begin
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims',
    json_build_object('sub', me, 'role', 'authenticated')::text, true);

  insert into exercises (user_id, name) values (me, 'zz_check_detail_bench') returning id into ex_bench;
  insert into exercises (user_id, name) values (me, 'zz_check_detail_never') returning id into ex_never;

  insert into workouts (user_id, performed_on) values (me, '2001-03-01') returning id into w1;
  insert into workouts (user_id, performed_on) values (me, '2001-03-08') returning id into w2;
  insert into workouts (user_id, performed_on) values (me, '2001-03-15') returning id into w_warmup;

  -- W1: a warm-up, a working set with unclean reps, a dropset.
  insert into workout_exercises (workout_id, exercise_id, note, attributes)
    values (w1, ex_bench, 'S2: langsam', '{"grip": "eng"}') returning id into we;
  insert into sets (workout_exercise_id, position, weight_kg, reps, is_warmup, unclean_reps, is_dropset)
    values (we, 0, 40, 10, true, 0, false),
           (we, 1, 80, 10, false, 2, false),
           (we, 2, 60, 8, false, 0, true);

  -- W2: the same exercise twice in one workout — still one session.
  insert into workout_exercises (workout_id, exercise_id, position) values (w2, ex_bench, 0) returning id into we;
  insert into sets (workout_exercise_id, position, weight_kg, reps) values (we, 0, 85, 5);
  insert into workout_exercises (workout_id, exercise_id, position) values (w2, ex_bench, 1) returning id into we;
  insert into sets (workout_exercise_id, position, weight_kg, reps) values (we, 0, 70, 12);

  -- w_warmup: only a warm-up — appears in v_exercise_sets, is not a session.
  insert into workout_exercises (workout_id, exercise_id) values (w_warmup, ex_bench) returning id into we;
  insert into sets (workout_exercise_id, position, weight_kg, reps, is_warmup) values (we, 0, 40, 10, true);

  -- v_exercise_sets: every set, warm-ups included.
  select count(*) into n from v_exercise_sets where exercise_id = ex_bench;
  if n <> 6 then raise exception 'FAIL v_exercise_sets: % rows (want 6)', n; end if;

  -- Epley and volume with the dashboard's exact expressions. 80 × 10 → 106.7, 800.
  select * into r from v_exercise_sets where exercise_id = ex_bench and workout_id = w1 and position = 1;
  if r.e1rm_kg is distinct from 106.7::numeric or r.volume_kg is distinct from 800::numeric
     or r.unclean_reps is distinct from 2 or r.note is distinct from 'S2: langsam'
     or r.attributes is distinct from '{"grip": "eng"}'::jsonb then
    raise exception 'FAIL v_exercise_sets W1 set: e1rm %, volume %, unclean %, note %, attributes %',
      r.e1rm_kg, r.volume_kg, r.unclean_reps, r.note, r.attributes;
  end if;

  -- Agrees with v_working_sets row for row on e1RM.
  select count(*) into n
    from v_exercise_sets es
    join v_working_sets ws
      on ws.workout_id = es.workout_id and ws.exercise_id = es.exercise_id
     and ws.weight_kg = es.weight_kg and ws.reps = es.reps
   where es.exercise_id = ex_bench and not es.is_warmup and ws.e1rm_kg <> es.e1rm_kg;
  if n <> 0 then raise exception 'FAIL e1rm differs from v_working_sets on % row(s)', n; end if;

  -- v_exercise_overview: two sessions (W1, W2), the warm-up-only workout is not one.
  select * into r from v_exercise_overview where exercise_id = ex_bench;
  if r.session_count is distinct from 2::bigint or r.first_performed_on is distinct from '2001-03-01'::date
     or r.last_performed_on is distinct from '2001-03-08'::date or r.name is distinct from 'zz_check_detail_bench' then
    raise exception 'FAIL v_exercise_overview bench: % sessions, % → % (want 2, 2001-03-01 → 2001-03-08)',
      r.session_count, r.first_performed_on, r.last_performed_on;
  end if;

  -- Same session count as top_exercises().
  select session_count into n from top_exercises('2001-01-01', 1000) where exercise_id = ex_bench;
  if n is distinct from 2::bigint then raise exception 'FAIL top_exercises disagrees: % sessions', n; end if;

  -- An exercise never trained has no overview row.
  select count(*) into n from v_exercise_overview where exercise_id = ex_never;
  if n <> 0 then raise exception 'FAIL v_exercise_overview lists an untrained exercise'; end if;

  -- Tenancy: a different authenticated user sees nothing.
  perform set_config('request.jwt.claims',
    json_build_object('sub', stranger, 'role', 'authenticated')::text, true);
  select count(*) into n from v_exercise_sets;
  if n <> 0 then raise exception 'FAIL LEAK v_exercise_sets: stranger sees % rows', n; end if;
  select count(*) into n from v_exercise_overview;
  if n <> 0 then raise exception 'FAIL LEAK v_exercise_overview: stranger sees % rows', n; end if;

  -- The option itself, in case a later migration recreates a view without it.
  select count(*) into n
    from pg_class c
   where c.relname in ('v_exercise_sets', 'v_exercise_overview')
     and exists (select 1 from unnest(c.reloptions) o
                  where o in ('security_invoker=on', 'security_invoker=true', 'security_invoker=1'));
  if n <> 2 then raise exception 'FAIL security_invoker is missing on % view(s)', 2 - n; end if;

  -- anon: no privilege at all.
  begin
    execute 'set local role anon';
    perform count(*) from v_exercise_sets;
    raise exception 'FAIL anon can read v_exercise_sets';
  exception when insufficient_privilege then
    null;
  end;

  raise exception 'EXERCISE_DETAIL_CHECKS_PASSED';
end $$;
