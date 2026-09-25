-- Unclean reps and dropsets on a set
-- (docs/superpowers/specs/2026-09-24-notes-import-design.md §3).
--
-- `reps` keeps meaning CLEAN reps, so every existing reader — the dashboard
-- views, records, e1RM, volume — stays correct without a change. Reps done
-- with sloppy form or partial range live beside it, never inside it.
--
-- `is_dropset` follows the `is_warmup` idiom instead of replacing both with a
-- set-type enum: `is_warmup` is read in ~30 places, the dashboard views among
-- them, and an enum buys nothing today. A set cannot be both.
--
-- Additive with defaults: the deployed app never names these columns, so this
-- is safe to apply while the old code is live (staging and production share
-- this database).

alter table sets
  add column unclean_reps int not null default 0 check (unclean_reps >= 0),
  add column is_dropset boolean not null default false,
  add constraint sets_warmup_xor_dropset check (not (is_warmup and is_dropset));

comment on column sets.unclean_reps is
  'Extra reps with unclean form or partial range, done after `reps` clean ones. Counted by no metric.';
comment on column sets.is_dropset is
  'A lighter continuation straight after the previous set.';
