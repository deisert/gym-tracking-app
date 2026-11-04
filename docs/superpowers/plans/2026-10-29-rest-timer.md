# Rest Timer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An optional per-workout rest timer: a chip under the date switches it on/off, and once on, saving a new set starts a countdown bar at the bottom of the screen.

**Architecture:** A new boolean column `workouts.rest_timer_enabled` stores the switch per workout. Pure countdown math lives in `@gymtrack/core`. One client context (`RestTimerProvider`) holds `enabled` and `endsAt` (a timestamp, never a tick counter), a chip toggles it, a fixed bar renders the countdown, and `SetList` calls `start()` when a *new* set is saved successfully.

**Tech Stack:** Next.js 16 / React 19 server actions, Supabase (Postgres), Zod, Tailwind v4, Vitest (`environment: "node"`, pure-function tests only — no DOM harness exists in this repo).

**Spec:** None written — agreed in chat on 2026-10-29 (mockup variant A, bar at the bottom). The agreed behaviour is the Global Constraints below.

## Global Constraints

- Setting is **per workout**, stored with the workout, default **off** (`default false`, so existing workouts and the live app are unaffected).
- Chip sits directly under the date title, visible without opening "Bearbeiten". Label: `⏱ Pause: an · 2:00` when on, `⏱ Pause: aus` when off. Toggle works at any time during the workout.
- Timer starts only when a **new** set is saved successfully (first `addSet` success of a row). Editing an existing set (weight, reps, warm-up toggle) never starts or restarts it. Warm-up sets count as sets. Saving the next new set restarts from full duration.
- Duration is fixed `REST_TIMER_SECONDS = 120`; no setting for it in this version. `+15 s` button adds `REST_EXTEND_SECONDS = 15`. `Skip` ends the countdown.
- At 0:00: `navigator.vibrate?.([200, 100, 200])`, then the bar disappears. Turning the switch off hides the bar immediately.
- Bar: `fixed`, above the bottom tab bar (tabs are `min-h-14` + `env(safe-area-inset-bottom)`), dark pill like the mockup, remaining time large, buttons ≥ 48px (`min-h-12`). While visible, a spacer of the same height keeps the last set row from being covered.
- Not in this version: timer surviving a reload, per-exercise durations, sound, lock-screen notification.
- German UI copy, informal "du". Server-action result shape is `ActionResult<T>` from `apps/web/src/app/workout/actions.ts`.
- `AGENTS.md`: this Next.js has breaking changes — skim the relevant guide in `node_modules/next/dist/docs/` before touching server-action or client-component code.
- Work on a new branch off `main` (`claude/rest-timer`). Commit style: `feat(workout): …`.

## Review Focus

Failure modes the feature implies but the unit tests cannot reach (no DOM harness), each pinned by a manual check in Task 4:

1. Editing an existing set (including the warm-up toggle) must not start or restart the timer.
2. A set whose save fails (validation or transient) must not start the timer; a row deleted while its first save is in flight must not either.
3. Switching off while running removes the bar at once; switching on alone does not start a countdown.
4. If saving the switch to the server fails, the chip reverts and shows the error.
5. Phone locked or tab in background: remaining time must come from `endsAt - Date.now()`, so it is right on return (pinned by a unit test in Task 1).

---

### Task 1: Countdown math in core

**Files:**
- Create: `packages/core/src/rest-timer.ts`
- Test: `packages/core/src/rest-timer.test.ts`
- Modify: `packages/core/src/index.ts` (add `export * from "./rest-timer";`)

**Interfaces:**
- Produces: `REST_TIMER_SECONDS: 120`, `REST_EXTEND_SECONDS: 15`, `restRemainingSeconds(endsAt: number, now: number): number` (whole seconds, rounded **up**, never below 0), `formatRestTime(seconds: number): string` (`m:ss`, negative or non-finite → `"0:00"`). Timestamps are epoch milliseconds.

- [ ] **Step 1: Write the failing tests** in `rest-timer.test.ts`:
  - `restRemainingSeconds(now + 83_200, now)` → `84`; `restRemainingSeconds(now + 120_000, now)` → `120`; `restRemainingSeconds(now, now)` → `0`; `restRemainingSeconds(now - 5_000, now)` → `0`
  - background case: `restRemainingSeconds(start + 120_000, start + 90_000)` → `30` (no tick dependence)
  - `formatRestTime`: `120`→`"2:00"`, `84`→`"1:24"`, `5`→`"0:05"`, `0`→`"0:00"`, `600`→`"10:00"`, `-3`→`"0:00"`, `NaN`→`"0:00"`
- [ ] **Step 2: Run** `npm test --workspace packages/core -- rest-timer` — Expected: FAIL (module not found).
- [ ] **Step 3: Implement** the four exports in `rest-timer.ts`, plus the `index.ts` export line.
- [ ] **Step 4: Run** the same command — Expected: PASS.
- [ ] **Step 5: Commit** `feat(core): rest timer countdown helpers`.

---

### Task 2: Store the switch (column, data layer, server action)

**Files:**
- Create: `supabase/migrations/20261029000000_workout_rest_timer.sql`
- Modify: `packages/core/src/validation.ts`, `packages/core/src/validation.test.ts`, `packages/core/src/types.ts` (`WorkoutDetail`), `apps/web/src/lib/data/workouts.ts` (`RawWorkout`, select string, `getWorkoutDetail` return), `apps/web/src/app/workout/actions.ts`

**Interfaces:**
- Produces: `restTimerEnabledSchema` (core, `z.boolean()`), `WorkoutDetail.rest_timer_enabled: boolean`, server action `setRestTimerEnabled(workoutId: string, enabled: unknown): Promise<ActionResult<null>>` (invalid input → `kind: "validation"`; zero updated rows or db error → `SAVE_FAILED`, `kind: "transient"`; on success `revalidatePath(`/workout/${workoutId}`)`).

- [ ] **Step 1: Write the failing test** in `validation.test.ts`: `restTimerEnabledSchema` accepts `true`/`false`, rejects `"true"`, `1`, `null`, `undefined`.
- [ ] **Step 2: Run** `npm test --workspace packages/core -- validation` — Expected: FAIL.
- [ ] **Step 3: Implement** the schema in `validation.ts`.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Write the migration:** `alter table workouts add column rest_timer_enabled boolean not null default false;` plus a `comment on column`. Additive with a default, so it is safe while the old app is live (staging and production share this database — see the header of `20260924200000_sets_unclean_reps_dropset.sql`). No RLS change: the existing `own workouts` policy already covers the column.
- [ ] **Step 6: Wire the read path:** add `rest_timer_enabled` to `WorkoutDetail`, `RawWorkout`, the `select` in `getWorkoutDetail` and its returned object.
- [ ] **Step 7: Add `setRestTimerEnabled`** to `actions.ts`, modelled on `updateWorkoutMeta` (same `.update().eq("id", workoutId).select("id")` zero-rows check).
- [ ] **Step 8: Run** `npm run typecheck` — Expected: no errors. (`apps/web/src/app/workout/[id]/page.tsx` does not use the new field yet; that is Task 3.)
- [ ] **Step 9: Commit** `feat(workout): store the rest timer switch per workout`.
- [ ] **Step 10 (manual — Dominik):** apply the migration with `supabase db push` (the Supabase MCP `apply_migration` is blocked by the classifier). Tasks 3–4 can be written without it, but the manual check in Task 4 needs it.

---

### Task 3: Provider, chip and bar

**Files:**
- Create: `apps/web/src/components/workout/rest-timer.tsx`
- Modify: `apps/web/src/app/workout/[id]/page.tsx`

**Interfaces:**
- Consumes: `REST_TIMER_SECONDS`, `REST_EXTEND_SECONDS`, `restRemainingSeconds`, `formatRestTime` (Task 1); `setRestTimerEnabled`, `WorkoutDetail.rest_timer_enabled` (Task 2); `Button` from `@/components/ui/button`.
- Produces from `rest-timer.tsx`:
  - `RestTimerProvider({ workoutId: string; initialEnabled: boolean; children: ReactNode })`
  - `useRestTimer(): { enabled: boolean; error: string | null; setEnabled(next: boolean): void; start(): void; extend(): void; skip(): void }` — throws if used outside the provider (same pattern as `useActiveSet` in `set-list.tsx`). `start` is a no-op while disabled.
  - `RestTimerToggle()` — the chip.
  - `RestTimerBar()` — renders nothing while no countdown runs.

- [ ] **Step 1: Implement the provider.** State: `enabled`, `endsAt: number | null`, `error`. `setEnabled(next)` updates state at once, clears `endsAt` when `next` is false, then calls `setRestTimerEnabled` in a transition; on `!result.ok` it restores the previous value and stores `result.error` (cleared on the next successful toggle). `start()` sets `endsAt = Date.now() + REST_TIMER_SECONDS * 1000`; `extend()` adds `REST_EXTEND_SECONDS * 1000`; `skip()` clears `endsAt`. Keep `start`/`extend`/`skip` referentially stable where `SetList.commit` depends on them.
- [ ] **Step 2: Implement `RestTimerToggle`.** A `<button type="button" aria-pressed={enabled}>` pill, `min-h-11`, using the labels from Global Constraints; the error text renders below it in `text-sm text-destructive` like `WorkoutHeader`.
- [ ] **Step 3: Implement `RestTimerBar`.** While `endsAt` is set, tick every 250 ms into a local `now` state and show `formatRestTime(restRemainingSeconds(endsAt, now))` large with tabular numbers, plus `+15 s` and `Skip` buttons (`min-h-12`). When the remaining time reaches 0: vibrate and call `skip()`. Position: `fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-10`, inner `mx-auto max-w-md px-4`; render a spacer (`h-20`) in normal flow while visible. Put `role="timer"` on the time; visible text labels on both buttons.
- [ ] **Step 4: Wire `page.tsx`.** Wrap the page content in `RestTimerProvider` (`initialEnabled={workout.rest_timer_enabled}`), place `<RestTimerToggle />` directly under `<WorkoutHeader … />`, and `<RestTimerBar />` as the last child of `<main>`.
- [ ] **Step 5: Run** `npm run typecheck && npm run lint` — Expected: clean.
- [ ] **Step 6: Commit** `feat(workout): rest timer chip and countdown bar`.

---

### Task 4: Start on new set, verify, close the backlog item

**Files:**
- Modify: `apps/web/src/components/workout/set-list.tsx` (`commit`, around the `result.ok` branch, ~lines 297–327)
- Modify: `FEATURE_BACKLOG.md` (row 1 of the product table, row 3 of the priority table)

**Interfaces:**
- Consumes: `useRestTimer().start` (Task 3). `SetList` is only rendered by `exercise-card.tsx`, which sits inside the provider via `page.tsx`.

- [ ] **Step 1: In `commit`'s success handler**, call `restTimer.start()` only inside the `stillPresent` branch **and** only when `wasNewRow` is true. Add `restTimer.start` to the `useCallback` dependency list. Do not touch the `else if (wasNewRow)` orphan-cleanup branch (a deleted row must not start the timer) or the failure branch.
- [ ] **Step 2: Run** `npm run typecheck && npm run lint && npm test` — Expected: all green.
- [ ] **Step 3: Verify in the browser** (`preview_start` with `gymtrack-dev`, logged-in session; needs the migration from Task 2 Step 10). Check, and report each result:
  - New workout: chip reads `Pause: aus`; saving a set shows no bar (Review Focus 3).
  - Tap chip → `Pause: an · 2:00`, reload keeps it (stored). Save a new set → bar counts down from 2:00; `+15 s` adds 15 s; `Skip` hides it.
  - Save a second new set while running → restarts at 2:00.
  - Change the weight of an existing set and toggle its warm-up → bar does **not** appear or restart (Review Focus 1).
  - Enter an invalid set (reps `0`) → no bar (Review Focus 2).
  - Turn the chip off while the bar runs → bar gone at once (Review Focus 3).
  - In devtools, set the network offline and tap the chip → it reverts and shows the error (Review Focus 4).
  - Bar sits above the bottom tabs and does not cover the last "Satz hinzufügen" button; check at mobile width (375 px).
- [ ] **Step 4: Update `FEATURE_BACKLOG.md`:** strike through the rest-timer rows and mark them `✅ done 2026-10-29`, following the format of the notes-import row.
- [ ] **Step 5: Commit** `feat(workout): start the rest timer when a new set is saved`.
