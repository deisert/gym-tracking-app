# GymTrack — Concept & Build Spec (v1)

A mobile-optimized web app to track gym workouts, hosted on Vercel, backed by Supabase (Postgres + Auth). Single-user-focused but multi-tenant-safe via Row Level Security. This document is the source of truth for the Claude Code prototype.

---

## 1. Product summary

- Replace the current notes-file tracking with structured logging.
- Core loop: start a workout → pick exercises from your personal library → log sets (weight × reps) → see how you compare to last time → review progress on a dashboard.
- Mobile-first web (no native app). Must be fast to use one-handed, mid-workout, with sweaty thumbs.
- Later: import the existing notes file to backfill history.

## 2. User flow — critique & improvements

Your proposed flow: create workout (date, notes, category) → add exercises → each exercise has a note + n sets with weight → separately create/name exercises → dashboard for progress → when starting a new workout, quickly pick existing exercises and compare.

That flow is sound. Here is what I'd challenge and change:

### 2.1 A set needs reps, not just weight (decided: weight + reps)
Weight alone makes progress uncomparable (80kg×5 ≠ 80kg×12). Each set = **weight + reps**, optional warm-up flag. This unlocks volume and estimated-1RM trends on the dashboard.

### 2.2 Effort tracking (decided: per-exercise, not per-set)
Per-set RPE is too much friction. Instead: an optional **effort slider (1–5)** + note field **per exercise instance**, filled at the end of the exercise. Label the slider with feelings, not numbers ("easy … all-out"), store as integer.

### 2.3 Comparison belongs in the logging screen, not only the dashboard
Your flow says "later see how I was performing in comparison." That's too late — the moment you need last session's numbers is **while logging**. Improvement: when you add an exercise to a workout, immediately show its last performance (date + sets) and **pre-fill ghost values** (last weight/reps as placeholders) for each new set. One tap confirms "same as last time," typing overrides. This is the single most important UX feature.

### 2.4 "Create workout" ceremony is friction — make it log-first
Don't force date/category/notes upfront. **"Start workout" is one tap**: date defaults to now, category and notes are editable anytime (also afterwards, from the couch). No start/stop state machine in v1 — a workout is just a dated container that's always editable. Backdating must be possible (needed for notes import and forgotten sessions).

### 2.5 Exercise identity is the thing that breaks comparisons — protect it
- Free-text names create duplicates ("Bench Press" vs "bench press") that silently split your history. Improvement: exercise picker with **search + autocomplete against your library, "recently used" sorted first**; creating a new exercise happens inline from the same search field ("No match → create 'X'").
- **Never hard-delete exercises** — archive them, or history dies with them. Renaming is safe (history follows the id).
- Variations (grip, incline, etc.) must **not** fork the exercise history. They're stored as attributes on the logged instance and act as an optional **filter** on the dashboard, not as separate exercises. Rule of thumb: different movement = new exercise (incline vs flat bench); same movement, different detail = variation attribute (wide vs narrow grip).

### 2.6 Variation attributes: define per exercise, select via dropdown
Your dropdown idea, generalized: each exercise can define its own attribute options (e.g. Lat Pulldown → grip: wide/narrow/neutral). Stored as JSON on the exercise ("what's selectable") and JSON on the logged instance ("what was chosen"). No extra tables, fully flexible, v1-cheap.

### 2.7 Workout categorization: keep it to one field
One **category** (free text with suggestions from your own past values: Push, Pull, Legs, …). No tag system in v1. Category powers the frequency view ("2× Push, 1× Legs this week"). Templates (start "Push Day" pre-filled) are explicitly **v2**, but the category field is the hook they'll attach to.

### 2.8 Gym reality: connectivity & interruptions
Gym basements have bad reception. Full offline/PWA sync is out of scope for v1, but: **save every set immediately on entry** (no "save workout" button at the end), optimistic UI with retry on failure. Never lose a logged set to a tab refresh.

### 2.9 Frequency is a goal — the dashboard must show it
Your project goal mentions tracking visit frequency. Dashboard gets two halves:
1. **Consistency**: calendar heatmap of workout days, workouts/week, streak.
2. **Progress per exercise**: pick an exercise → chart of top-set weight, estimated 1RM (Epley: `weight × (1 + reps/30)`), and total volume over time; table of best sets.

## 3. V1 scope

**In:** Email/password auth (Supabase), workout CRUD, exercise library CRUD (archive not delete), set logging with ghost values, per-exercise effort + note, variation attributes, dashboard (frequency + per-exercise progress), mobile-first UI.

**Out (v2+):** workout templates/routines, notes-file import (build as a script once schema is stable), rest timer, PWA/offline sync, body weight tracking, social/sharing, supersets as a first-class concept (ordering + notes cover it in v1).

## 4. Data model (Supabase / Postgres)

```
auth.users (Supabase-managed)
   │
   ├── profiles          1:1   display name, unit preference
   ├── exercises         1:n   personal exercise library
   └── workouts          1:n   dated container
          └── workout_exercises   n:m resolution, ordered, holds note/effort/variation
                 └── sets         weight × reps, ordered
```

```sql
-- Units: store weight in kg as numeric(6,2); display conversion is a UI concern.

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  unit text not null default 'kg' check (unit in ('kg','lb')),
  created_at timestamptz not null default now()
);

create table exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  note text,                          -- setup notes, e.g. "seat position 4"
  attribute_options jsonb not null default '{}'::jsonb,
    -- e.g. {"grip": ["wide","narrow","neutral"]}
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, name)              -- guard against duplicate names
);

create table workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  performed_on date not null default current_date,   -- backdatable
  category text,                      -- "Push", "Pull", ... suggested from history
  note text,
  created_at timestamptz not null default now()
);

create table workout_exercises (
  id uuid primary key default gen_random_uuid(),
  workout_id uuid not null references workouts(id) on delete cascade,
  exercise_id uuid not null references exercises(id) on delete restrict,
  position int not null default 0,    -- order within the workout
  note text,
  effort smallint check (effort between 1 and 5),
  attributes jsonb not null default '{}'::jsonb,     -- e.g. {"grip": "wide"}
  created_at timestamptz not null default now()
);

create table sets (
  id uuid primary key default gen_random_uuid(),
  workout_exercise_id uuid not null references workout_exercises(id) on delete cascade,
  position int not null default 0,
  weight_kg numeric(6,2) not null check (weight_kg >= 0),  -- 0 = bodyweight
  reps int not null check (reps > 0),
  is_warmup boolean not null default false,
  created_at timestamptz not null default now()
);

create index on workouts (user_id, performed_on desc);
create index on workout_exercises (workout_id, position);
create index on workout_exercises (exercise_id);
create index on sets (workout_exercise_id, position);
```

**Row Level Security** — enable on every table; policy pattern:
`profiles/exercises/workouts`: `user_id = auth.uid()` (profiles: `id = auth.uid()`) for select/insert/update/delete.
`workout_exercises`/`sets`: check ownership via join to parent (`exists (select 1 from workouts w where w.id = workout_id and w.user_id = auth.uid())`), same pattern one level deeper for sets.

**Key queries the model must serve** (sanity-checked against schema):
- Last performance of exercise X: latest `workout` (by `performed_on`) joining `workout_exercises.exercise_id = X`, with its sets → powers ghost values.
- Progress chart: per workout date, `max(weight_kg)` non-warmup set, `max(weight_kg*(1+reps/30.0))`, `sum(weight_kg*reps)` for exercise X.
- Frequency: `count(*) group by date_trunc('week', performed_on)` and per category.

## 5. Tech stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js (App Router, TypeScript) | Vercel-native, server components for dashboard queries |
| DB + Auth | Supabase (`@supabase/ssr`) | Relational fit, RLS, free tier, email/password + magic link |
| Styling | Tailwind CSS + shadcn/ui | Fast, good mobile primitives (Sheet, Drawer, Slider) |
| Charts | Recharts | Simple line/bar charts, good enough for v1 |
| Hosting | Vercel | Env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| Validation | Zod | Shared input validation for server actions |

Data mutations via **server actions**, one per operation (addSet, updateSet, …), each saving immediately (see 2.8). No separate API layer in v1.

## 6. Screens (mobile-first)

1. **Verlauf** (merges the former Today/Home and History screens) — "Start workout" button and this week's workouts/streak pinned at the top, followed by the reverse-chronological list of all workouts → tap into read/edit view (same component as the log screen). One screen, no separate landing page.
2. **Workout log** (the core screen) — workout header (date, category, note — collapsed by default); ordered exercise list; per exercise: sets as rows (weight, reps, warm-up toggle) with ghost values from last session and last-session summary line ("12 Aug: 80×8, 80×8, 82.5×6"); add-set duplicates the previous row; effort slider + note at the exercise bottom; "Add exercise" opens the picker.
3. **Exercise picker** — search field with autocomplete, recently-used first, inline create, archived hidden.
4. **Exercise library** — list, edit name/note/attribute options, archive.
5. **Dashboard** — consistency (heatmap, workouts/week, category split) + per-exercise progress (chart with metric toggle: top set / est. 1RM / volume; optional variation filter).
6. **Auth** — login/signup, minimal.

UI conventions: numeric keypad inputs (`inputmode="decimal"`), large tap targets, weight steps ±2.5 kg on steppers, everything editable after the fact.

## 7. Build plan for Claude Code

Phased so each phase is testable:

1. **Scaffold**: Next.js + Tailwind + shadcn/ui + Supabase clients (`@supabase/ssr` browser/server), auth pages, protected layout.
2. **Schema**: run the SQL above as a Supabase migration incl. RLS policies; seed a few exercises.
3. **Core loop**: exercise library CRUD → workout creation → log screen with set entry (server actions, save-on-entry) → exercise picker.
4. **Ghost values**: "last performance" query wired into the log screen.
5. **Dashboard**: frequency view, then per-exercise chart.
6. **Polish**: effort slider, variation dropdowns, history view, empty states.

Suggested kickoff prompt for Claude Code:

> Build phase 1+2 of the app described in CONCEPT.md: Next.js (App Router, TS) + Tailwind + shadcn/ui + Supabase auth via @supabase/ssr, plus the SQL migration from section 4 with RLS policies. Stop after auth works end-to-end and the migration applies cleanly.

Then iterate phase by phase, referencing section numbers of this doc.

## 8. Open questions (decide before/while building)

1. Magic-link login in addition to password? (Supabase gives it for free; nice on a phone.)
2. kg only for v1, or kg/lb toggle from the start? (Schema already stores kg canonically.)
3. Notes import (v2): share a sample of the notes file early — the parser design depends entirely on its format.
4. Bodyweight exercises: `weight_kg = 0` convention ok, or track added weight (dips + 10kg)? Current schema supports both; UI just needs a label.
