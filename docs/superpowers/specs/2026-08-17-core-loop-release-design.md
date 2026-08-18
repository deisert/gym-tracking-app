# GymTrack — Production Release & Core-Loop Prototype (Design Spec)

**Date:** 2026-08-17
**Status:** approved by Dominik, ready for implementation planning
**Companions:** `CONCEPT.md` (product + data model), `DESIGN_SYSTEM.md` (visual language), `FEATURE_BACKLOG.md` (v2+), `docs/superpowers/plans/2026-08-17-prototype-foundation.md` (the plan this one continues)

---

## 1. Goal

Put GymTrack on a production URL and make the core workout workflow clickable there: start a workout, pick an exercise, log sets, see last session's numbers while logging. Everything ships with real persistence under RLS — no mock data, no throwaway UI.

Success means Dominik can open the production URL on his phone in the gym, log a real session one-handed, and on the next session see his previous numbers pre-filled.

## 2. Current state

Foundation plan Tasks 1–6 are done and committed on `staging`:

- Next.js 16.3.1 (App Router, TypeScript, Tailwind v4) with `src/` layout and `@/*` alias
- shadcn/ui with the GymTrack dark token set in `globals.css`, Inter via `next/font`
- `@supabase/ssr` browser + server clients, `src/middleware.ts` gating every route behind `/login`
- Migration `20260817000001_init.sql` applied to the live project: `profiles`, `exercises`, `workouts`, `workout_exercises`, `sets`, all with RLS; `superset_group` safeguard column present
- Seeded profile + 5 exercises for the single test user; public signup disabled
- Password login, protected home showing the display name, logout

Foundation plan Tasks 7–8 are **not** done: no Vercel project exists, and `main` still contains only `CONCEPT.md` and `FEATURE_BACKLOG.md`.

## 3. Scope

**In:**

- Vercel project, environment variables, staging preview → production deploy chain, verified on a phone
- Today screen with "Workout starten"
- Workout log screen: editable header (date, category, note), ordered exercise cards, set rows with immediate save
- Exercise picker as a bottom sheet: search, recently-used first, inline create
- Ghost values: last session's sets shown as placeholders plus a summary line
- History list linking back into the log screen
- Vitest, with tests covering the pure set/format/validation logic

**Out (deferred, unchanged from `CONCEPT.md` §3 phasing):** dashboard and charts, effort slider, variation attribute chips, exercise library management (rename/archive), workout templates, notes-file import, PWA/offline queue, kg/lb toggle.

Exercises can only be created inline from the picker in this release. Nothing deletes an exercise — the library screen that would archive them comes later.

## 4. Release cut

Two releases onto the same production URL.

### Release 1 — `v0.1-foundation`

Content: what is already on `staging` (login + protected home). No new feature code.

Purpose: prove the deployment chain in isolation. Environment variables, Supabase reachability from Vercel's runtime, and middleware behaviour on Vercel's edge are all unverified today. Finding a problem there while the app is four files big is much cheaper than finding it mixed into feature bugs.

Steps: create the Vercel project against `deisert/gym-tracking-app` → set env vars for all environments → push `staging`, verify the preview → merge `staging` → `main` fast-forward → verify production on the phone → tag.

### Release 2 — `v0.2-core-loop`

Content: the clickable workflow. Same chain: build on `staging`, verify the preview, fast-forward `main`, verify on the phone, tag.

`main` is never committed to directly; it only ever fast-forwards from `staging`.

## 5. Screens and routing

| Route | Purpose |
|---|---|
| `/` — Heute | "Workout starten" as the single primary action, this week's workout count, the last few workouts as a list |
| `/workout/[id]` | The core screen (see §6) |
| `/history` — Verlauf | Reverse-chronological workout list, links into `/workout/[id]` |
| `/login` | Unchanged |

Navigation is a bottom tab bar with **two** tabs — Heute · Verlauf. `DESIGN_SYSTEM.md` §4 specifies three; the Dashboard tab is added when the dashboard exists.

The exercise picker is not a route. It is a shadcn `Drawer` opened from the log screen: autofocused search field, recently-used exercises first, and a final row that creates the typed name inline ("＋ 'Kurzhantel Rudern' anlegen").

All screens keep the single-column, `max-w-md`-centred mobile layout already used by `/login`.

## 6. The workout log screen

Structure, top to bottom:

1. **Header** — date, category, note. Collapsed to a single summary line by default; expanding reveals the three editable fields. Editing saves on blur. Backdating is possible here (`CONCEPT.md` §2.4).
2. **Exercise cards** — one per `workout_exercise`, in `position` order. Each card: exercise name, the last-session summary line, the set rows, "Satz hinzufügen", and an overflow action to remove the exercise from the workout.
3. **"Übung hinzufügen"** — primary action, opens the picker.

**Set row** is the component built first (`DESIGN_SYSTEM.md` §9.4). Layout: `#  |  weight  |  ×  |  reps  |  warm-up toggle`. Numeric inputs with `inputmode="decimal"` / `"numeric"`, tabular numerals, lime focus ring. A new row's placeholder follows the precedence in §8.

## 7. Architecture

Four layers, each independently understandable:

### `src/lib/sets.ts` — pure logic (no DB, no React)

This is the layer that gets tests.

```ts
type SetRecord = {
  id: string;
  position: number;
  weight_kg: number;
  reps: number;
  is_warmup: boolean;
};

type LastPerformance = {
  workoutId: string;
  performedOn: string;      // ISO date
  sets: SetRecord[];
} | null;

// Ghost value for the set at `position` — see §8 for the rule.
ghostForPosition(last: LastPerformance, position: number):
  { weight_kg: number; reps: number } | null

// "80 × 8 · 80 × 8 · 82,5 × 6" — warm-up sets excluded.
formatSetSummary(sets: SetRecord[]): string

// 82.5 -> "82,5", 80 -> "80" (German comma, no trailing zeros).
formatWeight(kg: number): string

// "2026-08-12" -> "12. Aug"
formatPerformedOn(isoDate: string): string

// Next free position given existing rows.
nextPosition(items: { position: number }[]): number
```

### `src/lib/validation.ts` — Zod schemas

Shared by server actions and form components. Bounds come from the schema in `CONCEPT.md` §4:

- `setInputSchema` — `weight_kg`: number, `>= 0`, `<= 9999.99` (the `numeric(6,2)` ceiling), at most 2 decimals; `reps`: integer, `1..1000`; `is_warmup`: boolean. `weight_kg = 0` is valid and means bodyweight.
- `exerciseNameSchema` — trimmed, 1–80 characters.
- `workoutMetaSchema` — `performed_on`: ISO date; `category`: nullable, ≤ 40 chars; `note`: nullable, ≤ 2000 chars.

### `src/lib/data/*.ts` — read access

Typed query functions over the server Supabase client. No UI knowledge, no mutations.

```ts
// src/lib/data/workouts.ts
getWorkoutDetail(workoutId: string): Promise<WorkoutDetail | null>
  // workout + its workout_exercises (ordered, with exercise name) + their sets (ordered)
listRecentWorkouts(limit: number): Promise<WorkoutSummary[]>
countWorkoutsThisWeek(weekStart: string): Promise<number>
  // weekStart is the caller's local Monday, for the same timezone reason as startWorkout

// src/lib/data/exercises.ts
searchExercises(query: string): Promise<ExerciseOption[]>
  // non-archived only; ordered by most recently used, then name
getLastPerformances(
  exerciseIds: string[],
  beforeDate: string,
  excludeWorkoutId: string
): Promise<Map<string, LastPerformance>>
```

`getLastPerformances` takes an array deliberately: the log screen needs the last performance for every exercise in the workout, and one query per exercise would be an N+1 on the slowest connection the app will ever see.

### `src/app/**/actions.ts` — server actions

One per operation, each validating with Zod, writing immediately, and calling `revalidatePath` for the affected route. No batching, no "save workout" button (`CONCEPT.md` §2.8).

```ts
startWorkout(localDate: string)            // redirects to /workout/[id]; never returns
updateWorkoutMeta(workoutId, meta)
addExerciseToWorkout(workoutId, exerciseId)
findOrCreateExercise(name)                 // idempotent, see below
addSet(workoutExerciseId, input)
updateSet(setId, input)
deleteSet(setId)
removeWorkoutExercise(workoutExerciseId)
deleteWorkout(workoutId)
```

Every action except `startWorkout` returns a discriminated result rather than throwing:

```ts
type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };
```

`findOrCreateExercise` is idempotent by design: the picker's inline-create row hits it with whatever the user typed, and a name that already exists resolves to the existing exercise instead of erroring. That makes the `unique (user_id, name)` constraint a non-event for the UI, and it is why the action is named for what it guarantees rather than for what it usually does.

`error` carries German user-facing copy. Unexpected exceptions are caught at the action boundary and returned as a generic message; they never reach the client as a stack trace.

### Client components

`SetRow` is the only substantial one. It holds the row's values with `useOptimistic` and fires `addSet`/`updateSet` inside `useTransition`:

- The typed number appears instantly.
- On success: 200 ms lime check pulse (`DESIGN_SYSTEM.md` §6).
- On failure: the value stays on screen with an amber dot, one automatic retry after 2 s, then a tappable retry. A set is never silently dropped.

The picker drawer and the collapsible workout header are the other client components; everything else stays a server component.

## 8. Ghost values

The rule, stated precisely because it is the fiddliest logic in the release:

> For the set at position *i* of the current exercise, the ghost value is the set at position *i* of that exercise's last performance. If the last performance has fewer sets than *i*, the ghost is its **last** set. If there is no last performance, there is no ghost.

"Last performance" means: the most recent `workout` by `performed_on` that (a) belongs to the user, (b) contains this exercise, (c) is not the current workout, and (d) is not later than the current workout's `performed_on` — so backdating a session does not show it numbers from the future.

Position mapping counts **all** sets of the last performance, warm-ups included, so that row *i* on screen corresponds to row *i* last time. The summary line is the opposite: it lists working sets only, because that is what the comparison is about.

**Placeholder precedence for a new row**, in order: the ghost value for that position → the previous row's values in the current card (`CONCEPT.md` §6, "add-set duplicates the previous row") → empty. Only the first case renders the last-session date alongside it.

Ghosts render as placeholders in `--muted-foreground` and become `--foreground` once confirmed. A tap on the row's check turns them into real values in one action. Above the set rows sits the summary line: `12. Aug: 80 × 8 · 80 × 8 · 82,5 × 6`.

Ghost values are only observable from the second session with a given exercise onward. The acceptance checklist (§12) accounts for this by requiring two logged workouts.

## 9. Error handling and edge cases

| Case | Behaviour |
|---|---|
| Set save fails (network) | Value stays, amber dot, auto-retry once after 2 s, then manual retry. German copy: "Speichern fehlgeschlagen – wird automatisch wiederholt." |
| Inline-created exercise name already exists | `findOrCreateExercise` returns the existing exercise; the picker adds it as if it had been chosen from the list. No error surfaces. |
| Same exercise added twice to one workout | Allowed. Two cards, independent sets — supersets and repeats are real. |
| Workout with no exercises | Allowed. It is a dated container; the empty state offers "Übung hinzufügen". |
| `/workout/[id]` for a foreign or missing id | RLS returns nothing → `notFound()`. |
| Timezone | `startWorkout` receives the **browser's** local date. Postgres `current_date` is UTC, which would file a 23:30 CET session under the next day. The start button is a client component precisely to pass the local date. |

## 10. Testing

Vitest arrives in this release — the foundation plan deferred it to exactly this point, since this is the first code with logic worth testing.

- Setup: `vitest`, node environment, `@/*` alias mirrored from `tsconfig.json`, scripts `test` (run) and `test:watch`.
- TDD applies to `src/lib/sets.ts` and `src/lib/validation.ts`: tests first, covering the ghost-value rule in all four of its branches (exact position, fewer sets, no last performance, backdated workout), German number and date formatting, and the validation bounds including `weight_kg = 0` and the `numeric(6,2)` ceiling.
- Data functions and server actions are not unit-tested in this release — they are thin wrappers over Supabase, and testing them properly needs a test database that does not exist yet. They are covered by the acceptance checklist instead. This is a deliberate, stated gap, not an oversight.
- The UI is verified by the phone smoke checklist in §12.

## 11. Risks

| Risk | Mitigation |
|---|---|
| Vercel Deployment Protection blocks the preview URL on the phone | Explicit verification step in Release 1; if enabled, either disable it for previews or verify on production only. |
| Next.js 16.3.1 differs from training data (`AGENTS.md` warns explicitly) | Every implementation task instructs reading the relevant guide in `node_modules/next/dist/docs/` before writing code. Applies especially to server actions, `useOptimistic`, and middleware. |
| Env vars missing or wrong in Vercel → build succeeds, runtime 500s | Release 1 exists to catch exactly this, before feature code can be blamed. |
| Supabase free-tier projects pause after prolonged inactivity | Note only; a paused project shows as auth failures. Nothing to build. |
| `profiles` row missing → `.single()` throws on the home page | The seed created it. Any new user would need one; out of scope while signup is disabled. |
| RLS blocks inserts into `workout_exercises` / `sets` | The migration's `with check` clauses cover this; the acceptance checklist verifies a real insert rather than assuming. |

## 12. Acceptance criteria

### Release 1

1. `npm run build` on `staging` exits 0.
2. Preview deployment reaches READY; its URL redirects to `/login` when unauthenticated.
3. Production deployment reaches READY on the `.vercel.app` domain.
4. Dominik logs in **on his phone** against production and sees "Angemeldet als Dominik".
5. `git status` clean; `main` == `staging`; tag `v0.1-foundation` pushed.

### Release 2

1. `npm run test` and `npm run build` both exit 0 on `staging`.
2. On production, on the phone: "Workout starten" creates a workout dated today (local date, verified after 22:00 CET or with the device clock adjusted).
3. The picker finds a seeded exercise by typing a partial name; selecting it adds a card.
4. Entering weight and reps shows the value instantly; reloading the page shows it persisted.
5. Airplane mode mid-set: the value stays visible with an amber dot; reconnecting saves it.
6. A second workout with the same exercise shows the first session's numbers as placeholders and the summary line with the correct date.
7. Confirming a ghost value with one tap creates a real set with those numbers.
8. `/history` lists both workouts, newest first, and each opens its log screen with its data intact.
9. An anonymous REST probe against `/rest/v1/sets` still returns `[]`.
10. Tag `v0.2-core-loop` pushed.

## 13. Deliberately deferred

Dashboard and charts, effort slider and per-exercise notes, variation attribute chips, exercise library management, workout templates, notes-file import, PWA and offline queue, kg/lb toggle, magic-link login. All of these layer onto this release's schema and screens without restructuring — the data model in `CONCEPT.md` §4 already carries them.
