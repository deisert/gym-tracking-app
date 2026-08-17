-- GymTrack initial schema (CONCEPT.md §4)
-- Units: weight stored in kg; display conversion is a UI concern.

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
  note text,
  attribute_options jsonb not null default '{}'::jsonb,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

create table workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  performed_on date not null default current_date,
  category text,
  note text,
  created_at timestamptz not null default now()
);

create table workout_exercises (
  id uuid primary key default gen_random_uuid(),
  workout_id uuid not null references workouts(id) on delete cascade,
  exercise_id uuid not null references exercises(id) on delete restrict,
  position int not null default 0,
  note text,
  effort smallint check (effort between 1 and 5),
  attributes jsonb not null default '{}'::jsonb,
  superset_group int,  -- v1 unused; safeguard for v2 supersets (FEATURE_BACKLOG.md)
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

-- Row Level Security (CONCEPT.md §4)
alter table profiles enable row level security;
alter table exercises enable row level security;
alter table workouts enable row level security;
alter table workout_exercises enable row level security;
alter table sets enable row level security;

create policy "own profile" on profiles
  for all using (id = auth.uid()) with check (id = auth.uid());

create policy "own exercises" on exercises
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "own workouts" on workouts
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "own workout_exercises" on workout_exercises
  for all
  using (exists (
    select 1 from workouts w
    where w.id = workout_id and w.user_id = auth.uid()))
  with check (exists (
    select 1 from workouts w
    where w.id = workout_id and w.user_id = auth.uid()));

create policy "own sets" on sets
  for all
  using (exists (
    select 1 from workout_exercises we
    join workouts w on w.id = we.workout_id
    where we.id = workout_exercise_id and w.user_id = auth.uid()))
  with check (exists (
    select 1 from workout_exercises we
    join workouts w on w.id = we.workout_id
    where we.id = workout_exercise_id and w.user_id = auth.uid()));
