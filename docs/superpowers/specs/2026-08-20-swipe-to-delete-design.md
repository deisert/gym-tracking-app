# Swipe-to-delete in the workout log (Design Spec)

**Date:** 2026-08-20
**Status:** approved by Dominik, ready for implementation planning
**Companions:** `DESIGN_SYSTEM.md` (visual language, §6 Motion / §8 Accessibility), this session's ADR-001 (animation/gesture library decision)

---

## 1. Goal

Replace the two explicit delete triggers in the workout/exercise detail view — the `×` button on each set row and the "Entfernen" button on each exercise card — with an Apple-style (iOS Mail/Reminders) swipe-to-delete gesture, while keeping the app fully keyboard-operable.

## 2. Decision carried over from ADR-001

**Option A: no new dependency.** A hand-rolled `SwipeableRow` component built on native Pointer Events + CSS transforms. No `framer-motion`/`motion`, `@use-gesture/react`, or `react-swipeable`. Rationale (full detail in the ADR): zero bundle cost matters for the app's basement-gym/offline-reliability goal (`FEATURE_BACKLOG.md`), the interaction is simple enough not to need a physics library, and `DESIGN_SYSTEM.md` §6 already specifies plain `ease-out` transitions with no spring/bounce language.

## 3. Scope

**In:**
- A reusable `SwipeableRow` component + `useSwipeToDelete` hook, used in two places: `SetRow` and `ExerciseCard`'s header.
- One-open-at-a-time exclusivity within a list of swipeable rows (opening one closes any other already open), via a small `SwipeGroupProvider` context.
- A keyboard-reachable equivalent: the swipe-revealed delete button is a real, focusable `<button>` in normal tab order; focusing it reveals it the same way a swipe does. This satisfies WCAG 2.5.1 (Pointer Gestures) — nothing becomes swipe-only.
- Respecting `prefers-reduced-motion`: no slide transition when the user has it set; the row still opens/closes/deletes, just without the animated slide.
- `touch-action: pan-y` on the draggable content so vertical page scrolling is never captured by the horizontal gesture (delegated to the browser/compositor, not hand-rolled axis detection).
- Never starting a drag capture from a pointer-down that landed on an `<input>`/`<textarea>`/`<button>`/`<select>` inside the row content, so `SetRow`'s weight/reps inputs keep native text-cursor and tap behaviour.

**Out (deferred, separate work):**
- Undo toast after deleting an exercise card. The ADR flagged this as worth having given the larger blast radius (deletes the exercise **and** all its sets), but it's a separate UI primitive (toast stack, timers) and out of scope for this plan. Deletion stays immediate/optimistic, matching the app's existing no-confirmation behaviour everywhere else.
- The Exercise Picker's `Dialog`-vs-`Drawer` gap (bottom-sheet swipe-to-dismiss). Pre-existing, unrelated to row deletion.
- Swipe navigation between workout days. Separate feature, needs prev/next-day data logic that doesn't exist yet.

## 4. Interaction spec

- **Reveal width:** 88px. The row can be dragged left up to this point before rubber-banding kicks in; past `open` threshold (half of reveal width) it snaps fully open on release.
- **Commit threshold:** 200px. Dragging (or flinging past) this distance and releasing commits the delete immediately, without needing a second tap — the full-swipe-through gesture, as in iOS Mail.
- **Rubber-band:** dragging past the reveal width still moves the row, but at 1/3 speed, so the gesture always visibly responds instead of hitting a hard wall.
- **Snap-back / open transition:** 180ms, `ease-out`, matching `DESIGN_SYSTEM.md` §6's 150–200ms window. Skipped entirely (`transition: none`) when `prefers-reduced-motion: reduce`.
- **Exclusivity:** only one row open at a time within the same `SwipeGroupProvider`. Opening a second row closes the first. Every usage — even `ExerciseCard`'s single header row — is wrapped in a provider, so `SwipeableRow` has one code path instead of a controlled/uncontrolled split.
- **Delete button:** real `<button>`, `min-h-12` (48px, ≥44px per §8), red (`--destructive`) background, visible German text label "Löschen" (never color-only, per §8). `aria-label` carries the specific target ("Satz 2 löschen", "Bankdrücken entfernen").
- **Keyboard path:** the delete button sits in normal DOM/tab order after the row's own interactive content. Focusing it (`onFocus`) opens the row exactly as a swipe would; blurring it (`onBlur`, unless something else keeps it open) closes it. Enter/Space activates delete as normal button behaviour — no gesture required.

## 5. Where it applies

- **`SetRow`** ([set-row.tsx](../../../src/components/workout/set-row.tsx)): replaces the trailing `×` button. Wraps the entire row content. `SwipeableRow`'s `id` is the row's existing stable `DraftRow.key` (not the array index, which shifts on delete).
- **`ExerciseCard`** ([exercise-card.tsx](../../../src/components/workout/exercise-card.tsx)): replaces the "Entfernen" button. Wraps only the header block (name + last-summary + error text) — not the whole card, so the gesture never has to compete with the set rows' own swipeable content nested inside the same card.

## 6. Non-goals / explicit judgment calls

- No axis-lock/`preventDefault` dance for scroll-vs-swipe disambiguation — `touch-action: pan-y` on the content div delegates that to the browser, which is simpler and more reliable than reimplementing it.
- No automated test for the Pointer-Events wiring itself (`useSwipeToDelete`, `SwipeableRow`) or for `usePrefersReducedMotion` — this repo's Vitest config runs in `environment: "node"` with no DOM/React-Testing-Library setup (confirmed: every existing `.test.ts` file tests pure functions only). Adding that harness is out of scope here. The pure math (`clampDragX`, `resolveSwipeOutcome`) that actually decides gesture outcomes is fully unit-tested; the DOM wiring is verified manually against a running preview.
