-- Per-workout switch for the rest timer (docs/superpowers/plans/2026-10-29-rest-timer.md).
--
-- Additive with a default, so it is safe to apply while the old code is live
-- (staging and production share this database). The existing `own workouts`
-- policy already covers the new column.

alter table workouts
  add column rest_timer_enabled boolean not null default false;

comment on column workouts.rest_timer_enabled is
  'Whether saving a new set in this workout starts the rest countdown. Off by default.';
