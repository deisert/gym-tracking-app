# Workout-Löschen + leichteres Schließen offener Swipe-Rows (Implementation Plan)

> **For agentic workers:** Steps use checkbox (`- [ ]`) syntax for tracking. Implement task-by-task, in order — Tasks 1–3 are prerequisites for Tasks 5–6.

**Status:** planned, not implemented. Awaiting the decision in "Open questions" §A before Task 6.

**Goal:** Two connected changes to the existing swipe-to-delete system:
1. A whole workout can be deleted with the same gesture as sets and exercises.
2. An open (swiped-but-not-deleted) row can be closed again without fighting the UI — today it can only be closed by a rightward drag that *starts* on a non-interactive pixel, which on a set row barely exists.

**Architecture:** Everything builds on the primitives from `2026-08-20-swipe-to-delete.md` (`swipe-gesture.ts` → `use-swipe-to-delete.ts` → `SwipeableRow` + `SwipeGroupProvider`). No new dependency. The gesture math stays pure and unit-tested; the DOM wiring stays untested (this repo has no DOM harness — see the earlier spec §6) and is verified by the manual QA checklist in Task 8.

**Companions:** [swipe-to-delete spec](../specs/2026-08-20-swipe-to-delete-design.md), `DESIGN_SYSTEM.md` §6 (Motion) / §8 (Accessibility), `CONCEPT.md`.

---

## Global Constraints

- No new npm dependency — Pointer Events + CSS transforms only.
- Existing gesture constants stay: reveal width 88px, commit threshold 200px, 180ms `ease-out`, `transition: none` under `prefers-reduced-motion: reduce`.
- Sprache: Deutsch, informelles "du". Delete label stays "Löschen"; `aria-label` names the target ("Workout vom 1. Sep löschen").
- Every delete path stays keyboard-operable without a gesture (WCAG 2.5.1): the revealed button is a real `<button>` in tab order.
- Only the pure functions in `src/lib/swipe-gesture.ts` get unit tests. Do not invent a DOM/React test harness for this plan.
- German failure copy on every server action, rendered next to the row that failed — never a silent drop.

---

## Part A — Why closing an open row is currently frickelig

Three separate causes, all fixable in the shared primitives:

1. **The grab surface is almost nonexistent.** `useSwipeToDelete.onPointerDown` returns early when the pointer lands on an `INPUT`/`TEXTAREA`/`BUTTON`/`SELECT` (`src/lib/use-swipe-to-delete.ts:58`). That rule is right for a *closed* row (typing must work), but it also applies while the row is open — and a `SetRow` is two large inputs, a `W` button and a status button, so the only draggable pixels are the index number and the `×` glyph. Hence "man kann bei den Sets nicht über den Inputs swipen".
2. **A tap on an open row does nothing.** `endDrag` resolves the row's *position*, not the user's intent: with no movement `dragX` is still `-88`, which is `≥ revealWidth / 2`, so the outcome is `"open"` and the row stays put. On iOS a tap anywhere on an open row closes it.
3. **Nothing else closes it.** Exclusivity ("one open at a time") only exists *inside* one `SwipeGroupProvider`, and there is one provider per `ExerciseCard` header and one per `SetList`. So an open exercise header stays open while you type in a set of the same card, and vice versa.

The fixes are Tasks 1–3.

---

## Part B — What deleting a workout needs

- **Data:** nothing. `workout_exercises.workout_id` is `on delete cascade` and `sets.workout_exercise_id` is `on delete cascade` (`supabase/migrations/20260817000001_init.sql:31-51`), so deleting the `workouts` row removes its exercises and sets. The `exercises` FK is `on delete restrict`, but that only guards deleting an *exercise*, not a workout — no migration needed.
- **Auth:** the `"own workouts"` RLS policy already covers `delete`; a foreign or missing id simply deletes 0 rows, which the action reports as a failure.
- **UI:** workouts are rendered as `<Link>` rows in two server components (`src/app/page.tsx` "Zuletzt", `src/app/history/page.tsx` "Verlauf"). `SwipeableRow` is a client component, so the list must move into one — Task 6.
- **New problem, not present for sets/exercises:** the row content is a *navigation link*. A swipe must not navigate, and a tap on an open row must close instead of navigating. That is Task 3, step 4.
- **Blast radius:** deleting one workout cascades every exercise and every set of that day. `DESIGN_SYSTEM.md` §1 principle 5 wants destructive actions recoverable, and the earlier spec deferred the undo toast. Mitigation without new UI: for workout rows only, disable the full-swipe-through commit, so a workout can never be deleted by a long flick — only by an explicit tap on the revealed "Löschen". This needs `commitThreshold` to become a prop (Task 3, step 5).

---

### Task 1: Extend the pure gesture math

**Files:**
- Modify: `src/lib/swipe-gesture.ts`
- Test: `src/lib/swipe-gesture.test.ts`

**Interfaces produced** (consumed by Task 2):
- `TAP_SLOP: number` — px of travel below which a gesture counts as a tap, not a drag (8).
- `CLOSE_THRESHOLD: number` — px of rightward travel that closes an already-open row (24).
- `isTap(travelPx: number): boolean`
- `resolveSwipeOutcome(dragX, revealWidth, commitThreshold, options?: { startedOpen?: boolean })`

- [ ] **Step 1: Write the failing tests**

```typescript
describe("isTap", () => {
  it("treats a still finger as a tap", () => expect(isTap(0)).toBe(true));
  it("treats jitter under the slop as a tap", () => expect(isTap(6)).toBe(true));
  it("treats real travel as a drag", () => expect(isTap(20)).toBe(false));
  it("ignores direction", () => expect(isTap(-6)).toBe(true));
});

describe("resolveSwipeOutcome with startedOpen", () => {
  it("closes on a short rightward drag from the open position", () => {
    // Open at -88, dragged 30px right -> -58. Today's rule would keep it open
    // (58 >= 44); intent says the user is closing it.
    expect(resolveSwipeOutcome(-58, 88, 200, { startedOpen: true })).toBe("closed");
  });
  it("keeps it open when the finger barely moved right", () => {
    expect(resolveSwipeOutcome(-78, 88, 200, { startedOpen: true })).toBe("open");
  });
  it("still commits a delete when swiped further left from open", () => {
    expect(resolveSwipeOutcome(-220, 88, 200, { startedOpen: true })).toBe("delete");
  });
  it("is unchanged for a closed row", () => {
    expect(resolveSwipeOutcome(-58, 88, 200)).toBe("open");
  });
});
```

- [ ] **Step 2: Implement**

`isTap(travel)` is `Math.abs(travel) < TAP_SLOP`. In `resolveSwipeOutcome`, when `options.startedOpen` is true and the delete threshold was *not* reached, close as soon as `revealWidth - distance >= CLOSE_THRESHOLD` (i.e. the finger travelled `CLOSE_THRESHOLD` back toward rest); otherwise fall through to today's rules. Keep the existing 3-argument call signature working — the options object must be optional.

- [ ] **Step 3: `npm test`** — all existing swipe tests must still pass untouched.

---

### Task 2: Teach the hook tap-to-close and drag detection

**Files:**
- Modify: `src/lib/use-swipe-to-delete.ts`

**Interfaces produced** (consumed by Task 3):
- `UseSwipeToDeleteResult.didDrag: () => boolean` — true when the gesture that just ended moved past `TAP_SLOP`. Used to swallow the click a swipe would otherwise fire on a `<Link>`.
- `rowHandlers` unchanged in shape, so they can be spread onto the scrim as well as the content.

- [ ] **Step 1:** Add a `travelRef` updated in `onPointerMove` (absolute distance from `startClientXRef`), reset to 0 in `onPointerDown`.
- [ ] **Step 2:** In `onPointerDown`, keep the `INTERACTIVE_TAGS` early return **only while the row is closed**. While `isOpen`, the scrim from Task 3 already covers the inputs, but keeping the guard would still block a drag started on the delete button's edge — gate it on `!isOpen`.
- [ ] **Step 3:** In `endDrag`, before resolving the outcome: if `isTap(travelRef.current)` and `isOpen` → `onOpenChange(false); setDragX(0); return;`. A tap on a *closed* row keeps today's behaviour (nothing happens, the underlying input/link handles it).
- [ ] **Step 4:** Pass `{ startedOpen }` to `resolveSwipeOutcome`, derived from `startDragXRef.current !== 0`.
- [ ] **Step 5:** Expose `didDrag: () => !isTap(travelRef.current)`. Do not reset `travelRef` in `endDrag` — the click event fires *after* pointerup and must still see the value; `onPointerDown` resets it for the next gesture.
- [ ] **Step 6:** `cancelDrag` stays as is (a cancelled gesture must never commit anything).

---

### Task 3: Make `SwipeableRow` closable and link-safe

**Files:**
- Modify: `src/components/ui/swipeable-row.tsx`

- [ ] **Step 1 — Scrim while open.** When `isOpen`, render a transparent `absolute inset-0` layer over the *content* div only (not over the delete button), spreading the same `rowHandlers`, with `touch-action: pan-y`, `aria-hidden`, no tab index. This is the single fix for cause A1 + A2: pointerdown always lands on the scrim, so the full row width becomes draggable and a tap closes the row instead of focusing an input underneath.
- [ ] **Step 2 — Close on outside pointerdown.** While `isOpen`, a `useEffect` adds a capture-phase `pointerdown` listener on `document` that calls `onOpenChange(false)` when `event.target` is not inside the row's wrapper (needs a `ref` on the wrapper div). Removes the listener on close/unmount. This fixes cause A3 across `SwipeGroupProvider` boundaries.
- [ ] **Step 3 — Escape closes.** Same effect, a `keydown` listener while open. Cheap desktop/keyboard parity.
- [ ] **Step 4 — Swallow the post-swipe click.** Put `onClickCapture` on the content wrapper: if `didDrag()`, `event.preventDefault()` + `event.stopPropagation()`. Without this, every swipe on a workout row navigates to that workout. Also set `draggable={false}` on link content (native anchor drag steals the pointer stream on desktop) and `[-webkit-touch-callout:none]` (iOS long-press link preview).
- [ ] **Step 5 — `commitThreshold` becomes an optional prop** (default `COMMIT_THRESHOLD = 200`), so Task 6 can pass `Number.POSITIVE_INFINITY` for workout rows and require an explicit tap on "Löschen" for the highest-blast-radius delete.
- [ ] **Step 6:** Verify the keyboard path is untouched: Tab reaches "Löschen", `onFocus` opens the row, the scrim (aria-hidden, not focusable) never takes focus, Enter deletes.

---

### Task 4: `deleteWorkout` server action

**Files:**
- Modify: `src/app/workout/actions.ts`

- [ ] **Step 1:** Add, next to `deleteSet`:

```typescript
export async function deleteWorkout(workoutId: string): Promise<ActionResult<null>> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("workouts")
    .delete()
    .eq("id", workoutId)
    .select("id");

  if (error || !data || data.length === 0) {
    return { ok: false, error: "Workout konnte nicht gelöscht werden.", kind: "transient" };
  }

  // Both lists render workouts; the dashboard also shows the weekly count.
  revalidatePath("/");
  revalidatePath("/history");
  return { ok: true, data: null };
}
```

- [ ] **Step 2:** No migration, no orphan cleanup — the cascades in `20260817000001_init.sql` cover `workout_exercises` and `sets`. Confirm by reading that file rather than trusting this line.

---

### Task 5: `WorkoutList` client component

**Files:**
- Create: `src/components/workout/workout-list.tsx`

- [ ] **Step 1:** `"use client"`. Props: `workouts: WorkoutSummary[]`. Renders one `SwipeGroupProvider` around a `<ul>`; each `<li>` is a `SwipeableRow` whose content is the existing link markup moved verbatim out of the two pages (`min-h-14 rounded-xl bg-card px-4`, date + category left, "N Übungen · M Sätze" right).
- [ ] **Step 2:** `id={workout.id}`, `deleteLabel={`Workout vom ${formatPerformedOn(workout.performed_on)} löschen`}`, `commitThreshold={Number.POSITIVE_INFINITY}` (see Part B, blast radius).
- [ ] **Step 3:** Optimistic removal, following `SetList.removeRow` rather than `ExerciseCard` (a 100-row history must not wait for a round trip): keep `removedIds: Set<string>` in state, hide the row immediately, and on failure put it back and render the German error beneath it. Guard against a double dispatch for the same id while one is in flight, as `ExerciseCard.remove` does.
- [ ] **Step 4:** `formatPerformedOn` lives in `src/lib/dates.ts` and is pure (no `server-only` import) — safe to use from the client.
- [ ] **Step 5:** Keep the empty-state copy where it is, in the pages (it differs: "Noch kein Workout geloggt. Starte dein erstes." vs. "Noch keine Workouts. Sobald du eins loggst, steht es hier.").

---

### Task 6: Wire the list into both pages

**Files:**
- Modify: `src/app/page.tsx`, `src/app/history/page.tsx`

- [ ] **Step 1:** Replace both inline `<ul>` blocks with `<WorkoutList workouts={…} />`. Both pages stay server components; only the list is a client island.
- [ ] **Step 2:** After a delete on `/`, the weekly counter card must be correct — `revalidatePath("/")` in Task 4 handles it; verify visually, since the optimistic hide is client-side and the counter is not.

---

### Task 7: Verification

- [ ] `npm test` (gesture math), `npm run lint`, `npm run build`.

---

### Task 8: Manual QA checklist (real phone, dark mode)

Closing:
- [ ] Swipe a set row open, tap over the weight input → row closes, input does **not** focus, no keyboard pops up.
- [ ] Swipe a set row open, then drag right starting *on* an input → row closes.
- [ ] Swipe an exercise header open, then tap into a set input of the same card → header closes, the tap does not reach the input (first tap closes, second tap types).
- [ ] Escape closes an open row.

Workout delete:
- [ ] Swipe a workout row in "Verlauf" → "Löschen" is revealed, no navigation happens.
- [ ] A long full swipe does **not** delete the workout (tap-only commit).
- [ ] Tap "Löschen" → row disappears; the workout is gone from `/` and `/history` after a reload; its sets are gone.
- [ ] A normal tap on a workout row still navigates.
- [ ] Offline (airplane mode): delete fails → the row comes back with "Workout konnte nicht gelöscht werden."

Accessibility / motion:
- [ ] `prefers-reduced-motion: reduce` → no slide, rows still open/close/delete.
- [ ] Keyboard only: Tab reaches "Löschen" on a workout row, the row opens on focus, Enter deletes, Tab away closes.

---

## Open questions

**A. Where does whole-workout delete live?** This plan puts it on the two list rows (`/` "Zuletzt" and `/history`). The alternative — or addition — is the workout detail page itself, where the swipe would sit on the `WorkoutHeader` and the action would need a `redirect("/")` after deleting the workout you are currently looking at. **Recommendation:** lists only for now; deleting the screen you are standing on is the more surprising interaction, and the lists are where you actually notice a workout you want gone.

**B. No undo.** Consistent with sets and exercises today, and the undo toast was already deferred by the 2026-08-20 spec. The tap-only commit (Task 3 step 5) is the cheap guard. If an undo toast is wanted, it is a separate piece of work and should cover all three delete types at once.

## Risks

- The scrim changes what a tap on an *open* row does everywhere, including the exercise header. That is the intended iOS behaviour, but it is a behaviour change to existing rows, not only to the new workout rows — worth one focused pass through the QA checklist.
- Click suppression after a swipe is timing-sensitive on iOS Safari (the synthetic click arrives after `pointerup`). If `onClickCapture` proves unreliable in the preview, the fallback is a short-lived `pointer-events: none` on the content immediately after a drag ends.
