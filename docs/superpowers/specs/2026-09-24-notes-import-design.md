# Notes-file import — backfilling two years of training history

**Date:** 2026-09-24
**Status:** decided 2026-09-24 in conversation; implementation plan to follow in
`docs/superpowers/plans/2026-09-24-notes-import.md`
**Companions:** `CONCEPT.md` §2.5–2.6 (variation attributes), `FEATURE_BACKLOG.md` #2
(notes-file import), `supabase/migrations/20260915203912_exercise_last_picked_at.sql`

---

## 1. Goal

Import the personal training log (`past-sets.md`, ~4,800 lines, ~150 workouts,
2024-04 → 2026-08-16) into the owner's account, so the history and dashboard carry two
years of data instead of five weeks.

The file is private and git-ignored. Nothing derived from its contents (preview, SQL) is
committed; only the parser, its rules and synthetic tests are.

Out of scope: entering unclean reps or dropsets in the logging UI (own follow-up),
cardio, the assisted-pull-up weight semantics (imported as written for now).

## 2. Source notation

| Notation | Meaning |
|---|---|
| `———` / `____` line | new workout |
| `05.11` | workout date, day.month, no year |
| name line | exercise; its sets follow on the next lines |
| `80/10` | 80 kg × 10 reps |
| `20/10-12` | rep range → mean |
| `80/10 _3`, `__3`, `+3`, `3halbe`, `(3-4 half)` | 10 clean + 3 unclean reps |
| `40/7-3` (only before `_` existed) | 7 clean + 3 unclean — second number smaller than first |
| `dropset`, `drop`, `drop set` | dropset |
| `warmup` | warm-up set |
| `L` / `R` | one side of a single-arm set |
| `each side` | weight is per side; applies to every set of that exercise |
| `?`, empty reps, weight only | reps unknown |

## 3. Data model

Additive migration, defaults keep all existing code valid:

```sql
alter table sets
  add column unclean_reps int not null default 0 check (unclean_reps >= 0),
  add column is_dropset boolean not null default false,
  add constraint sets_warmup_xor_dropset check (not (is_warmup and is_dropset));
```

- `reps` stays **clean reps only**. Dashboard records, e1RM and volume therefore need no
  change.
- `is_dropset` mirrors the existing `is_warmup` idiom instead of replacing it with a set-type
  enum: `is_warmup` has ~30 call sites including the dashboard views, and an enum would buy
  nothing today.

Staging and production share one Supabase project, so the migration is live in production
the moment it is applied. That is safe because it only adds defaulted columns.

## 4. App display

- The set list shows a muted **„+3“** after the reps when `unclean_reps > 0`, and a
  display-only **„Drop“** badge for dropsets, styled like the warm-up badge.
- Editing an imported set keeps both values: `updateSet` does not write the new columns.
- Data layer: `SET_COLUMNS`, both `sets ( … )` selects and `SetRecord` gain the two fields.
- Ghost values and dashboard: unchanged.

## 5. Parser

Pure functions in `src/lib/notes-import/`, Vitest-tested with synthetic lines; a runner
`scripts/notes-import.ts` (run via `tsx`) reads the real file and writes preview + SQL to a
path outside the repo.

### 5.1 Blocks and dates
- A workout starts at every separator line **and** at every date line (some dates follow
  each other without a separator).
- Year starts at 2024 and increments when the month wraps from December to January.
- Fixed date corrections live in the override table (three out-of-order dates; the two
  earliest entries are 2024).
- Undated workouts get the midpoint between their neighbours and the note
  „Datum geschätzt“, and are kept.
- Workouts without any set are dropped.
- Text lines between the date and the first exercise become `workouts.note`; the labels
  „Upper Body“, „Lower body workout“, „Pull day“, „Quick intense push“ become
  `workouts.category`.

### 5.2 Sets
- Ranges → mean, **rounded down** (`8-9` → 8).
- Half reps: `82.5/11.5` → 11 clean + 1 unclean.
- Unclean markers per §2 → `unclean_reps`.
- `L`/`R` sets stay separate sets.
- Sets without known reps are **dropped** (no schema change for nullable reps).
- Bodyweight exercises (leg raises) → 0 kg; `straight` reps are clean, `bent` reps unclean.
- Annotations (`80%`, `slow`, `ca.`, `short rope`, …) → `workout_exercises.note`, prefixed
  with the set number („S2: 90%“).
- Cable weights are normalised to the exact three-decimal stack value (21.8/21.85 → 21.875,
  29.3/29.325/29.35/29.4 → 29.375, …).
- Summed weights are added (`18.75+ 0.625` → 19.375; `25+15+10` → 50).
- Weight is taken **as written** (no bar weight added).

### 5.3 Per-side weights
Exercises noted with `each side` store the **per-side** weight: `85/12 42.5 each side` →
42.5, `60/10 (30 each)` → 30. Otherwise the same machine's chart jumps between 25 and 60.

### 5.4 Overrides
Typos and one-off shapes (`408` → 40/8, `5010`, `87/5/7_3`, `40//10`, `22.5:8`, reversed
`10x40 warmup`, a set split across two lines, the trap-bar block, the grip change inside
one exercise, notes that start with a digit) are listed **by line number** in
`overrides.ts`, so every correction is reviewable.

### 5.5 Exercise mapping
A table maps every raw name (≈110 variants) to ≈35 canonical exercises, reusing the 21
names that already exist in the account **verbatim**. Grip and handle variants become
`attributes` (e.g. `{grip: "wide"}`), per `CONCEPT.md` §2.5. Weight-dependent rules, judged
by the heaviest set of that exercise in that workout:

| Raw name | Rule |
|---|---|
| Incline bench (no suffix) | ≤ 30 kg → dumbbell („Incline bench press“), ≥ 40 kg → barbell (new exercise) |
| Ab crunches | ≥ 80 kg → „Ab crunches machine“, else „Ab crunches freeweight“ |
| Bicep curls | ≥ 45 kg → „Bicep curls machine“, 18–25 kg → tower, else free weight |
| Tri press / overhead | ≥ 80 kg → tri press machine, else „Tri overhead pull“ |
| Row machine with `each side` | plate-loaded row machine (separate from the stack row machine) |
| „lateral“ on rows/pulldowns | means single-arm |
| „Lat pulldown“ with tricep-range weights | tricep pushdown |

### 5.6 Safety net
Every line must end up as exactly one of: workout/exercise/set, note, override, or an
explicit drop with a reason. Any unclassified line blocks SQL generation.

## 6. Import run

1. Apply the migration.
2. Generate the **preview** (local HTML, outside the repo): mapping table, all workouts,
   every corrected or dropped line, totals. The owner approves it.
3. Generate SQL: one transaction, owner's `user_id`; exercises upserted by name;
   `workout_exercises.created_at` set to the workout date.
4. **Dry run**: execute with `ROLLBACK`, compare counts against the preview.
5. **Real run** with `COMMIT`, via the Supabase connection (no service-role key on disk).
6. Recompute `exercises.last_picked_at` from `max(workout_exercises.created_at)`. The
   insert trigger would otherwise stamp every imported exercise as picked „now“ and push
   it to the top of the exercise picker.
7. Verify: SQL counts, then the app locally (history, a workout with „+3“/„Drop“,
   dashboard).

**Rollback:** existing app data starts 2026-08-19, the notes end 2026-08-16. Deleting the
owner's workouts on or before 2026-08-16 plus imported exercises that are no longer
referenced restores the prior state. That script is prepared before step 5.

Imported workouts appear in production immediately; „+3“/„Drop“ appear there once the
display code is released. The data is correct in between.

## 7. Testing

- Vitest, synthetic fixtures only (the real file is git-ignored): set grammar, range and
  half-rep rounding, unclean markers, dates and year rollover, block splitting, mapping
  rules, weight normalisation.
- The runner asserts full line coverage on the real file (§5.6).
- `npm run lint && npm run test && npm run build` before the PR against `staging`.
