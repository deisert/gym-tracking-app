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
  ex_old uuid;
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
  insert into exercises (user_id, name) values (me, 'zz_check_old') returning id into ex_old;

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
  insert into workout_exercises (workout_id, exercise_id) values (w1, ex_old) returning id into we;
  insert into sets (workout_exercise_id, position, weight_kg, reps) values (we, 0, 60, 10);

  -- W2. Bench: weight PR (85 > 80). Pull-up: reps PR at 0 kg (10 > 8).
  insert into workout_exercises (workout_id, exercise_id) values (w2, ex_bench) returning id into we;
  insert into sets (workout_exercise_id, position, weight_kg, reps) values (we, 0, 85, 3), (we, 1, 80, 8);
  insert into workout_exercises (workout_id, exercise_id) values (w2, ex_pullup) returning id into we;
  insert into sets (workout_exercise_id, position, weight_kg, reps) values (we, 0, 0, 10);

  -- W3. Bench: ties 85 (no record), beats e1RM and reps at 80 kg.
  --     Pull-up: ties 10 (no record). New exercise: first session (no record).
  --     Old exercise: lighter than its W1 best (no record).
  insert into workout_exercises (workout_id, exercise_id) values (w3, ex_bench) returning id into we;
  insert into sets (workout_exercise_id, position, weight_kg, reps) values (we, 0, 85, 3), (we, 1, 80, 10);
  insert into workout_exercises (workout_id, exercise_id) values (w3, ex_pullup) returning id into we;
  insert into sets (workout_exercise_id, position, weight_kg, reps) values (we, 0, 0, 10);
  insert into workout_exercises (workout_id, exercise_id) values (w3, ex_new) returning id into we;
  insert into sets (workout_exercise_id, position, weight_kg, reps) values (we, 0, 50, 5);
  insert into workout_exercises (workout_id, exercise_id) values (w3, ex_old) returning id into we;
  insert into sets (workout_exercise_id, position, weight_kg, reps) values (we, 0, 50, 5);

  -- w_empty: started, never trained — an exercise, no set.
  insert into workout_exercises (workout_id, exercise_id) values (w_empty, ex_bench);

  -- v_workout_stats: warm-ups count toward volume. 100×1 + 2×80×5 + 0×8 + 60×10 = 1500.
  select set_count, volume_kg into r from v_workout_stats where workout_id = w1;
  if r.set_count is distinct from 5::bigint or r.volume_kg is distinct from 1500::numeric then
    raise exception 'FAIL v_workout_stats w1: % sets, % kg (want 5, 1500)', r.set_count, r.volume_kg;
  end if;
  select set_count, volume_kg into r from v_workout_stats where workout_id = w_empty;
  if r.set_count is distinct from 0::bigint or r.volume_kg is distinct from 0::numeric then
    raise exception 'FAIL v_workout_stats w_empty: % sets, % kg (want 0, 0)', r.set_count, r.volume_kg;
  end if;

  -- v_weekly_stats: week of Mon 12 Feb holds w3 (trained) and w_empty (not).
  -- 85×3 + 80×10 + 0×10 + 50×5 + 50×5 = 255 + 800 + 0 + 250 + 250 = 1555.
  select workout_count, set_count, volume_kg into r from v_weekly_stats where week_start = '2001-02-12';
  if r.workout_count is distinct from 1::bigint or r.set_count is distinct from 5::numeric
     or r.volume_kg is distinct from 1555::numeric then
    raise exception 'FAIL v_weekly_stats 2001-02-12: % workouts, % sets, % kg (want 1, 5, 1555)',
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

  -- The window only decides WHICH exercises are frequent; the best set stays all-time.
  -- From 10 Feb, zz_check_old has one session (50×5), but its best is W1's 60×10.
  select * into r from top_exercises('2001-02-10', 1000) where exercise_id = ex_old;
  if r.session_count is distinct from 1::bigint or r.best_weight_kg is distinct from 60::numeric
     or r.best_reps is distinct from 10 or r.best_performed_on is distinct from '2001-01-03'::date then
    raise exception 'FAIL top_exercises all-time best: % sessions, best % × % on % (want 1, 60 × 10, 2001-01-03)',
      r.session_count, r.best_weight_kg, r.best_reps, r.best_performed_on;
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
