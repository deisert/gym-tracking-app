-- Precomputed "recently used" ordering for the exercise picker.
--
-- CONCEPT.md §2.5 asks for "recently used sorted first". Until now that
-- ordering was produced by reading the 200 newest `workout_exercises` rows on
-- every picker keystroke and aggregating them in JS. That query:
--
--   * has no index on `workout_exercises (created_at)`, so it scans a table
--     that grows with every logged exercise;
--   * carries the `own workout_exercises` policy, whose `exists (select 1 from
--     workouts ...)` is re-evaluated per row;
--   * silently lost the ordering past 200 rows, dropping older exercises back
--     to alphabetical.
--
-- And because `addSet`/`updateSet`/`deleteSet` revalidate the workout route,
-- it re-ran on every saved set, not only on a search.
--
-- 2026-09-03-total-volume-evaluation.md rejects denormalised columns added "in
-- anticipation" of a slow query, and names the risk as "the stored value
-- silently drifting from the rows it claims to summarize". Neither applies
-- here: this is the measured case that spec asks for, and a single
-- monotonically forward timestamp drives an ordering, not arithmetic. A wrong
-- value sorts one row oddly; it can never misreport a workout.

alter table exercises add column last_picked_at timestamptz;

comment on column exercises.last_picked_at is
  'When this exercise was last added to a workout; null = never picked. Distinct from created_at, which is when it entered the library.';

-- Backfill from exactly the rows the JS aggregation used to read.
update exercises e
set last_picked_at = picked.last_picked_at
from (
  select exercise_id, max(created_at) as last_picked_at
  from workout_exercises
  group by exercise_id
) picked
where picked.exercise_id = e.id;

create function touch_exercise_last_picked()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- The owner check is not redundant: the `own workout_exercises` policy only
  -- proves the *workout* belongs to the caller, never that the exercise does.
  -- Without it a crafted insert could bump the timestamp on a stranger's
  -- exercise. `security definer` is what makes the update land at all — under
  -- the caller's own RLS it would silently affect zero rows for anything the
  -- caller cannot see.
  update exercises
  set last_picked_at = now()
  where id = new.exercise_id
    and user_id = (select user_id from workouts where id = new.workout_id);
  return new;
end;
$$;

-- Insert only: the app never reassigns `workout_exercises.exercise_id`, and
-- `removeWorkoutExercise` deliberately does not roll the value back — "last
-- picked" is a historical fact, not a running count.
create trigger on_workout_exercise_added
  after insert on workout_exercises
  for each row execute function touch_exercise_last_picked();

-- A trigger function needs no EXECUTE grant: Postgres checks that privilege
-- when the trigger is created, never when it fires (verified against this
-- project — the trigger still fires after the revoke). Without this, Supabase's
-- default grants leave a `security definer` function callable by anon and
-- authenticated over `/rest/v1/rpc/touch_exercise_last_picked`, which the
-- database linter flags as lint 0028/0029.
revoke execute on function touch_exercise_last_picked() from anon, authenticated, public;
