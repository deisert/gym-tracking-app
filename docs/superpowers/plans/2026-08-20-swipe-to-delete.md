# Swipe-to-delete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `×` delete button on set rows and the "Entfernen" button on exercise cards with an Apple-style swipe-to-delete gesture, built with zero new dependencies.

**Architecture:** A pure-function gesture math module (`swipe-gesture.ts`) feeds a Pointer-Events React hook (`use-swipe-to-delete.ts`), which a presentational wrapper component (`SwipeableRow`, with a small `SwipeGroupProvider` context for one-open-at-a-time exclusivity) turns into a drop-in replacement for the two existing delete buttons. Both delete call sites (`deleteSet`, `removeWorkoutExercise` server actions) are unchanged — this is a UI-layer-only change.

**Tech Stack:** Next.js 16 / React 19, TypeScript, Tailwind v4, native Pointer Events API, Vitest (`environment: "node"`, pure-function tests only — no DOM test harness exists in this repo).

**Spec:** [docs/superpowers/specs/2026-08-20-swipe-to-delete-design.md](../specs/2026-08-20-swipe-to-delete-design.md)

## Global Constraints

- No new npm dependency — Pointer Events + CSS transforms only (spec §2).
- Reveal width 88px, commit threshold 200px, 180ms `ease-out` snap, `transition: none` under `prefers-reduced-motion: reduce` (spec §4).
- Delete button ≥44px hit target (use `min-h-12` = 48px, matching the rest of the codebase's convention), red background **and** visible German text label "Löschen" — never color alone (`DESIGN_SYSTEM.md` §8).
- The delete button must be reachable and operable without a gesture: real focusable `<button>`, opens the row on focus, activates on Enter/Space (WCAG 2.5.1; spec §4).
- Never start a drag capture from a pointer-down on an `<input>`/`<textarea>`/`<button>`/`<select>` inside the row content (spec §3).
- `touch-action: pan-y` on the draggable content — no hand-rolled scroll-vs-swipe axis detection (spec §6).
- Sprache: Deutsch, informelles "du" — delete label is "Löschen"; `aria-label`s follow the existing per-row copy pattern (`Satz ${index + 1} löschen`).
- No automated test for the Pointer-Events hook or the component — only the pure gesture-math functions get unit tests (spec §6). Don't invent a DOM test harness for this plan.

---

### Task 1: Pure swipe-gesture math

**Files:**
- Create: `src/lib/swipe-gesture.ts`
- Test: `src/lib/swipe-gesture.test.ts`

**Interfaces:**
- Produces: `clampDragX(rawDeltaX: number, maxDrag: number): number`, `resolveSwipeOutcome(dragX: number, revealWidth: number, commitThreshold: number): "closed" | "open" | "delete"` — both consumed by Task 3's hook.

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/swipe-gesture.test.ts
import { describe, expect, it } from "vitest";
import { clampDragX, resolveSwipeOutcome } from "@/lib/swipe-gesture";

describe("clampDragX", () => {
  it("passes through a small leftward drag unchanged", () => {
    expect(clampDragX(-30, 88)).toBe(-30);
  });

  it("never allows a positive (rightward) offset", () => {
    expect(clampDragX(20, 88)).toBe(0);
  });

  it("clamps exactly at maxDrag", () => {
    expect(clampDragX(-88, 88)).toBe(-88);
  });

  it("rubber-bands past maxDrag instead of hard-stopping", () => {
    // 30px past the max becomes only 10px of extra travel (÷3).
    expect(clampDragX(-118, 88)).toBeCloseTo(-98, 5);
  });
});

describe("resolveSwipeOutcome", () => {
  it("stays closed under half the reveal width", () => {
    expect(resolveSwipeOutcome(-30, 88, 200)).toBe("closed");
  });

  it("opens past half the reveal width", () => {
    expect(resolveSwipeOutcome(-50, 88, 200)).toBe("open");
  });

  it("treats exactly half the reveal width as open", () => {
    expect(resolveSwipeOutcome(-44, 88, 200)).toBe("open");
  });

  it("commits a delete past the commit threshold", () => {
    expect(resolveSwipeOutcome(-210, 88, 200)).toBe("delete");
  });

  it("treats exactly the commit threshold as a delete", () => {
    expect(resolveSwipeOutcome(-200, 88, 200)).toBe("delete");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/swipe-gesture.test.ts`
Expected: FAIL — `Cannot find module '@/lib/swipe-gesture'` (or similar; the file doesn't exist yet).

- [ ] **Step 3: Write the minimal implementation**

```typescript
// src/lib/swipe-gesture.ts

/**
 * Converts a raw horizontal pointer delta into the row's translateX.
 *
 * Clamped to [-maxDrag, 0]: the row can never be dragged to the right of its
 * resting position, and past `maxDrag` further movement adds only a third
 * of the extra distance (rubber-banding) so the row still visibly responds
 * instead of hitting a hard wall.
 */
export function clampDragX(rawDeltaX: number, maxDrag: number): number {
  const proposed = Math.min(0, rawDeltaX);
  if (proposed >= -maxDrag) return proposed;
  const overshoot = -proposed - maxDrag;
  return -(maxDrag + overshoot / 3);
}

export type SwipeOutcome = "closed" | "open" | "delete";

/**
 * Where a row settles once the pointer is released.
 *
 * - Past `commitThreshold`: the swipe committed a delete (full swipe-through,
 *   like iOS Mail) — no second tap needed.
 * - Past half of `revealWidth`: snaps open, delete button stays visible.
 * - Otherwise: snaps back closed.
 */
export function resolveSwipeOutcome(
  dragX: number,
  revealWidth: number,
  commitThreshold: number
): SwipeOutcome {
  const distance = -dragX;
  if (distance >= commitThreshold) return "delete";
  if (distance >= revealWidth / 2) return "open";
  return "closed";
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/swipe-gesture.test.ts`
Expected: PASS (9 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/swipe-gesture.ts src/lib/swipe-gesture.test.ts
git commit -m "feat: add pure swipe-gesture math for swipe-to-delete"
```

---

### Task 2: `usePrefersReducedMotion` hook

**Files:**
- Create: `src/lib/use-prefers-reduced-motion.ts`

**Interfaces:**
- Produces: `usePrefersReducedMotion(): boolean` — consumed by Task 4's `SwipeableRow`.

No automated test: this hook only touches `window.matchMedia`, which doesn't exist in this repo's Vitest `environment: "node"` (see Global Constraints). Verified manually in Task 7.

- [ ] **Step 1: Write the hook**

```typescript
// src/lib/use-prefers-reduced-motion.ts
"use client";

import { useEffect, useState } from "react";

/**
 * Mirrors the `prefers-reduced-motion` media query.
 *
 * Starts `false` (SSR-safe — `window` doesn't exist on the server) and
 * corrects itself on mount, then stays in sync if the OS setting changes
 * while the page is open.
 */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(query.matches);

    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return reduced;
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors from this file.

- [ ] **Step 3: Commit**

```bash
git add src/lib/use-prefers-reduced-motion.ts
git commit -m "feat: add usePrefersReducedMotion hook"
```

---

### Task 3: `useSwipeToDelete` hook

**Files:**
- Create: `src/lib/use-swipe-to-delete.ts`

**Interfaces:**
- Consumes: `clampDragX`, `resolveSwipeOutcome` from `src/lib/swipe-gesture.ts` (Task 1).
- Produces: `useSwipeToDelete(options: UseSwipeToDeleteOptions): UseSwipeToDeleteResult`, where
  ```typescript
  type UseSwipeToDeleteOptions = {
    onDelete: () => void;
    revealWidth: number;
    commitThreshold: number;
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
  };
  type UseSwipeToDeleteResult = {
    dragX: number;
    isDragging: boolean;
    rowHandlers: {
      onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
      onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
      onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void;
      onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => void;
    };
  };
  ```
  Consumed by Task 4's `SwipeableRow`.

No automated test — DOM/Pointer-Events wiring, verified manually in Task 7 (see Global Constraints).

- [ ] **Step 1: Write the hook**

```typescript
// src/lib/use-swipe-to-delete.ts
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { clampDragX, resolveSwipeOutcome } from "@/lib/swipe-gesture";

export type UseSwipeToDeleteOptions = {
  onDelete: () => void;
  /** px the row settles at once opened; also the delete button's width. */
  revealWidth: number;
  /** px of leftward travel that commits a delete on release. */
  commitThreshold: number;
  /** True once open, whether by swipe, by full-swipe-adjacent tap, or by keyboard focus. */
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
};

export type UseSwipeToDeleteResult = {
  dragX: number;
  isDragging: boolean;
  rowHandlers: {
    onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
    onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
    onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void;
    onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => void;
  };
};

const INTERACTIVE_TAGS = new Set(["INPUT", "TEXTAREA", "BUTTON", "SELECT"]);

export function useSwipeToDelete({
  onDelete,
  revealWidth,
  commitThreshold,
  isOpen,
  onOpenChange,
}: UseSwipeToDeleteOptions): UseSwipeToDeleteResult {
  const [dragX, setDragX] = useState(isOpen ? -revealWidth : 0);
  const [isDragging, setIsDragging] = useState(false);
  const pointerIdRef = useRef<number | null>(null);
  const startClientXRef = useRef(0);
  const startDragXRef = useRef(0);

  // An external open/close — keyboard focus on the delete button, or another
  // row in the same group opening — moves this row even with no pointer down.
  useEffect(() => {
    if (pointerIdRef.current !== null) return;
    setDragX(isOpen ? -revealWidth : 0);
  }, [isOpen, revealWidth]);

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (INTERACTIVE_TAGS.has((event.target as HTMLElement).tagName)) return;
      pointerIdRef.current = event.pointerId;
      startClientXRef.current = event.clientX;
      startDragXRef.current = dragX;
      setIsDragging(true);
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [dragX]
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (pointerIdRef.current !== event.pointerId) return;
      const rawDeltaX = startDragXRef.current + (event.clientX - startClientXRef.current);
      setDragX(clampDragX(rawDeltaX, revealWidth));
    },
    [revealWidth]
  );

  const endDrag = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (pointerIdRef.current !== event.pointerId) return;
      pointerIdRef.current = null;
      setIsDragging(false);

      const outcome = resolveSwipeOutcome(dragX, revealWidth, commitThreshold);
      if (outcome === "delete") {
        onDelete();
        return;
      }
      const nextOpen = outcome === "open";
      onOpenChange(nextOpen);
      setDragX(nextOpen ? -revealWidth : 0);
    },
    [dragX, revealWidth, commitThreshold, onDelete, onOpenChange]
  );

  return {
    dragX,
    isDragging,
    rowHandlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
    },
  };
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors from this file.

- [ ] **Step 3: Commit**

```bash
git add src/lib/use-swipe-to-delete.ts
git commit -m "feat: add useSwipeToDelete pointer-events hook"
```

---

### Task 4: `SwipeableRow` component + `SwipeGroupProvider`

**Files:**
- Create: `src/components/ui/swipeable-row.tsx`

**Interfaces:**
- Consumes: `useSwipeToDelete` (Task 3), `usePrefersReducedMotion` (Task 2), `cn` from `@/lib/utils`.
- Produces:
  - `SwipeGroupProvider({ children }: { children: ReactNode })` — wraps a list of `SwipeableRow`s so only one is open at a time. Every `SwipeableRow` usage must be inside one, even a lone row.
  - `SwipeableRow({ id, deleteLabel, onDelete, children, className? }: Props)` where `id: string` is unique within the enclosing provider, `deleteLabel: string` is the button's `aria-label`, `onDelete: () => void` fires on full swipe-through or on tapping the revealed button.
  - Both consumed by Task 5 (`SetRow`/`SetList`) and Task 6 (`ExerciseCard`).

No automated test — presentational component wrapping untested DOM wiring, verified manually in Task 7 (see Global Constraints).

- [ ] **Step 1: Write the component**

```typescript
// src/components/ui/swipeable-row.tsx
"use client";

import { createContext, useCallback, useContext, useState } from "react";
import type { ReactNode } from "react";
import { useSwipeToDelete } from "@/lib/use-swipe-to-delete";
import { usePrefersReducedMotion } from "@/lib/use-prefers-reduced-motion";
import { cn } from "@/lib/utils";

const REVEAL_WIDTH = 88;
const COMMIT_THRESHOLD = 200;

type SwipeGroupContextValue = {
  openId: string | null;
  setOpenId: (id: string | null) => void;
};

const SwipeGroupContext = createContext<SwipeGroupContextValue | null>(null);

/**
 * Groups `SwipeableRow`s so opening one closes any other already open — the
 * iOS Mail/Reminders behaviour. Wrap even a single row in this: it keeps
 * `SwipeableRow` to one code path instead of a controlled/uncontrolled split.
 */
export function SwipeGroupProvider({ children }: { children: ReactNode }) {
  const [openId, setOpenId] = useState<string | null>(null);
  return (
    <SwipeGroupContext.Provider value={{ openId, setOpenId }}>
      {children}
    </SwipeGroupContext.Provider>
  );
}

function useSwipeGroup(id: string) {
  const group = useContext(SwipeGroupContext);
  if (!group) {
    throw new Error("SwipeableRow must be rendered inside a SwipeGroupProvider");
  }
  const isOpen = group.openId === id;
  const onOpenChange = useCallback(
    (open: boolean) => group.setOpenId(open ? id : null),
    [group, id]
  );
  return { isOpen, onOpenChange };
}

type Props = {
  /** Unique within the enclosing SwipeGroupProvider. */
  id: string;
  deleteLabel: string;
  onDelete: () => void;
  children: ReactNode;
  className?: string;
};

/**
 * Wraps `children` with an iOS-style swipe-to-delete gesture. Swiping left
 * reveals a "Löschen" button (or a full swipe-through commits the delete
 * directly); the same button is a normal focusable element, reachable and
 * operable without ever performing the gesture (WCAG 2.5.1).
 */
export function SwipeableRow({ id, deleteLabel, onDelete, children, className }: Props) {
  const { isOpen, onOpenChange } = useSwipeGroup(id);
  const prefersReducedMotion = usePrefersReducedMotion();
  const { dragX, isDragging, rowHandlers } = useSwipeToDelete({
    onDelete,
    revealWidth: REVEAL_WIDTH,
    commitThreshold: COMMIT_THRESHOLD,
    isOpen,
    onOpenChange,
  });

  return (
    <div className={cn("relative overflow-hidden rounded-xl", className)}>
      <div
        className="flex"
        style={{
          width: `calc(100% + ${REVEAL_WIDTH}px)`,
          transform: `translateX(${dragX}px)`,
          transition:
            isDragging || prefersReducedMotion ? "none" : "transform 180ms ease-out",
        }}
      >
        <div {...rowHandlers} className="min-w-0 flex-1 touch-pan-y">
          {children}
        </div>

        <button
          type="button"
          onClick={onDelete}
          onFocus={() => onOpenChange(true)}
          onBlur={() => onOpenChange(false)}
          aria-label={deleteLabel}
          style={{ width: REVEAL_WIDTH }}
          className="min-h-12 shrink-0 rounded-xl bg-destructive text-sm font-medium text-destructive-foreground"
        >
          Löschen
        </button>
      </div>
    </div>
  );
}
```

Note on layout: the button lives right after the content in DOM order (so Tab reaches the row's own inputs before "Löschen" — the natural order) but is visually positioned first because the inner flex row is 88px wider than its clipped container; at rest the button sits just past the visible edge, `overflow-hidden` clips it, and dragging the row left slides the button into view without moving it itself.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors from this file.

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/swipeable-row.tsx
git commit -m "feat: add SwipeableRow component and SwipeGroupProvider"
```

---

### Task 5: Wire into `SetRow` and `SetList`

**Files:**
- Modify: `src/components/workout/set-row.tsx`
- Modify: `src/components/workout/set-list.tsx`

**Interfaces:**
- Consumes: `SwipeableRow`, `SwipeGroupProvider` from `src/components/ui/swipeable-row.tsx` (Task 4).
- `SetRow`'s `Props` gains `rowId: string` (the stable `DraftRow.key`, not the array index — the index shifts when an earlier row is deleted).

- [ ] **Step 1: Replace `set-row.tsx`'s delete button with `SwipeableRow`**

Replace the full contents of `src/components/workout/set-row.tsx` with:

```tsx
"use client";

import { cn } from "@/lib/utils";
import type { GhostValue } from "@/lib/sets";
import { formatWeight } from "@/lib/sets";
import { SwipeableRow } from "@/components/ui/swipeable-row";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

type Props = {
  rowId: string;
  index: number;
  weight: string;
  reps: string;
  isWarmup: boolean;
  ghost: GhostValue | null;
  status: SaveStatus;
  /** German failure copy from the server, rendered beneath the row. */
  error: string | null;
  /** False for a validation failure: the same input can never succeed. */
  canRetry: boolean;
  /** The row is untouched and has a ghost, so one tap can confirm it. */
  canConfirmGhost: boolean;
  /** The row has typed content that has never reached the server. */
  isUnsaved: boolean;
  onWeightChange: (value: string) => void;
  onRepsChange: (value: string) => void;
  onCommit: () => void;
  onToggleWarmup: () => void;
  onDelete: () => void;
  onRetry: () => void;
  onConfirmGhost: () => void;
};

export function SetRow({
  rowId,
  index,
  weight,
  reps,
  isWarmup,
  ghost,
  status,
  error,
  canRetry,
  canConfirmGhost,
  isUnsaved,
  onWeightChange,
  onRepsChange,
  onCommit,
  onToggleWarmup,
  onDelete,
  onRetry,
  onConfirmGhost,
}: Props) {
  const inputClass =
    "min-h-12 w-full rounded-xl bg-muted px-3 text-2xl font-semibold tabular-nums " +
    "text-center outline-none focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <SwipeableRow id={rowId} deleteLabel={`Satz ${index + 1} löschen`} onDelete={onDelete}>
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "w-6 text-sm tabular-nums",
              isWarmup ? "text-muted-foreground" : "text-foreground"
            )}
          >
            {index + 1}
          </span>

          <input
            aria-label={`Gewicht Satz ${index + 1}`}
            inputMode="decimal"
            value={weight}
            placeholder={ghost ? formatWeight(ghost.weight_kg) : "kg"}
            onChange={(event) => onWeightChange(event.target.value)}
            onBlur={onCommit}
            className={inputClass}
          />

          <span className="text-muted-foreground" aria-hidden>
            ×
          </span>

          <input
            aria-label={`Wiederholungen Satz ${index + 1}`}
            inputMode="numeric"
            value={reps}
            placeholder={ghost ? String(ghost.reps) : "Wdh."}
            onChange={(event) => onRepsChange(event.target.value)}
            onBlur={onCommit}
            className={inputClass}
          />

          <button
            type="button"
            onClick={onToggleWarmup}
            aria-pressed={isWarmup}
            aria-label={`Aufwärmsatz ${index + 1}`}
            className={cn(
              "min-h-12 min-w-12 rounded-xl text-sm font-medium",
              // Warm-up state is never signalled by colour alone (DESIGN_SYSTEM.md §8).
              isWarmup ? "bg-muted text-muted-foreground" : "text-muted-foreground"
            )}
          >
            W
          </button>

          <span className="flex min-w-6 items-center justify-center" aria-live="polite">
            {status === "saving" && <span className="text-muted-foreground">…</span>}
            {status === "saved" && (
              <span className="text-primary" aria-label="Gespeichert">
                ✓
              </span>
            )}
            {status === "error" &&
              (canRetry ? (
                <button
                  type="button"
                  onClick={onRetry}
                  aria-label="Erneut versuchen"
                  className="flex min-h-12 min-w-11 items-center justify-center text-[hsl(38_92%_55%)]"
                >
                  ●
                </button>
              ) : (
                // A validation failure can never succeed unchanged, so there is
                // no retry to offer — the message below says what to fix.
                <span className="text-destructive" aria-hidden>
                  ●
                </span>
              ))}
            {status === "idle" && canConfirmGhost && (
              <button
                type="button"
                onClick={onConfirmGhost}
                aria-label={`Vorschlag für Satz ${index + 1} übernehmen`}
                className="flex min-h-12 min-w-11 items-center justify-center text-primary"
              >
                ✓
              </button>
            )}
            {status === "idle" && !canConfirmGhost && isUnsaved && (
              <span
                className="text-muted-foreground"
                aria-label={`Satz ${index + 1} nicht gespeichert`}
              >
                ●
              </span>
            )}
          </span>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    </SwipeableRow>
  );
}
```

- [ ] **Step 2: Wrap `set-list.tsx`'s rows in `SwipeGroupProvider` and pass `rowId`**

In `src/components/workout/set-list.tsx`, add the import:

```typescript
import { SwipeGroupProvider } from "@/components/ui/swipeable-row";
```

Replace the `return` statement (the JSX at the bottom of `SetList`) with:

```tsx
  return (
    <div className="mt-3 flex flex-col gap-2">
      <SwipeGroupProvider>
        {rows.map((row, index) => {
          const ghost = ghostFor(rows, lastPerformance, index);

          return (
            <SetRow
              key={row.key}
              rowId={row.key}
              index={index}
              weight={row.weight}
              reps={row.reps}
              isWarmup={row.isWarmup}
              ghost={ghost}
              status={row.status}
              error={row.error}
              canRetry={row.errorKind !== "validation"}
              canConfirmGhost={canConfirmGhost(row, ghost)}
              isUnsaved={isUnsaved(row)}
              onWeightChange={(value) => changeField(row.key, { weight: value })}
              onRepsChange={(value) => changeField(row.key, { reps: value })}
              onCommit={() => commit(row.key)}
              onToggleWarmup={() => {
                patch(row.key, { isWarmup: !row.isWarmup });
                commit(row.key);
              }}
              onDelete={() => removeRow(row.key)}
              onRetry={() => commit(row.key)}
              onConfirmGhost={() => {
                if (ghost) confirmGhost(row.key, ghost);
              }}
            />
          );
        })}
      </SwipeGroupProvider>

      <Button
        type="button"
        variant="secondary"
        className="min-h-12"
        onClick={addRow}
      >
        Satz hinzufügen
      </Button>
    </div>
  );
```

- [ ] **Step 3: Type-check and lint**

Run: `npx tsc --noEmit && npx eslint src/components/workout/set-row.tsx src/components/workout/set-list.tsx`
Expected: no errors (no unused imports — `SetRow` no longer needs any import it previously had removed; `set-list.tsx` gained the `SwipeGroupProvider` import).

- [ ] **Step 4: Run the full test suite**

Run: `npm test`
Expected: PASS (existing `dates.test.ts`, `sets.test.ts`, `validation.test.ts`, and the new `swipe-gesture.test.ts` from Task 1 all pass; nothing in this task touched logic they cover).

- [ ] **Step 5: Commit**

```bash
git add src/components/workout/set-row.tsx src/components/workout/set-list.tsx
git commit -m "feat: replace set-row delete button with swipe-to-delete"
```

---

### Task 6: Wire into `ExerciseCard`

**Files:**
- Modify: `src/components/workout/exercise-card.tsx`

**Interfaces:**
- Consumes: `SwipeableRow`, `SwipeGroupProvider` from `src/components/ui/swipeable-row.tsx` (Task 4).

- [ ] **Step 1: Replace the "Entfernen" button with `SwipeableRow`**

Replace the full contents of `src/components/workout/exercise-card.tsx` with:

```tsx
"use client";

import { useState, useTransition } from "react";

import { removeWorkoutExercise } from "@/app/workout/actions";
import { SetList } from "@/components/workout/set-list";
import { SwipeableRow, SwipeGroupProvider } from "@/components/ui/swipeable-row";
import type { LastPerformance, WorkoutExerciseDetail } from "@/lib/types";

type Props = {
  workoutId: string;
  workoutExercise: WorkoutExerciseDetail;
  /** "12. Aug: 80 × 8 · 82,5 × 6", or null when there is no previous session. */
  lastSummary: string | null;
  lastPerformance: LastPerformance;
};

export function ExerciseCard({
  workoutId,
  workoutExercise,
  lastSummary,
  lastPerformance,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [removeError, setRemoveError] = useState<string | null>(null);

  function remove() {
    // A tap on the revealed button while a previous removal is still in
    // flight would otherwise dispatch a second one for the same exercise.
    if (isPending) return;
    startTransition(async () => {
      const result = await removeWorkoutExercise(workoutId, workoutExercise.id);
      setRemoveError(result.ok ? null : result.error);
    });
  }

  return (
    <article className="rounded-xl bg-card p-4">
      <SwipeGroupProvider>
        <SwipeableRow
          id={workoutExercise.id}
          deleteLabel={`${workoutExercise.exercise.name} entfernen`}
          onDelete={remove}
        >
          <header className="flex items-start justify-between gap-2">
            <div>
              <h3 className="font-medium">{workoutExercise.exercise.name}</h3>
              {lastSummary && (
                <p className="mt-1 text-sm text-muted-foreground tabular-nums">{lastSummary}</p>
              )}
              {/* A dropped delete (RLS filtered it, or the network went) otherwise
                  leaves the card sitting there with nothing said. */}
              {removeError && (
                <p className="mt-1 text-sm text-destructive">{removeError}</p>
              )}
            </div>
          </header>
        </SwipeableRow>
      </SwipeGroupProvider>

      <SetList
        workoutId={workoutId}
        workoutExerciseId={workoutExercise.id}
        sets={workoutExercise.sets}
        lastPerformance={lastPerformance}
      />
    </article>
  );
}
```

- [ ] **Step 2: Type-check and lint**

Run: `npx tsc --noEmit && npx eslint src/components/workout/exercise-card.tsx`
Expected: no errors (the old `Button` import is gone and nothing else in the file references it).

- [ ] **Step 3: Commit**

```bash
git add src/components/workout/exercise-card.tsx
git commit -m "feat: replace exercise-card Entfernen button with swipe-to-delete"
```

---

### Task 7: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Run the full automated suite**

Run: `npm run lint && npx tsc --noEmit && npm test && npm run build`
Expected: all four succeed with no errors.

- [ ] **Step 2: Start the dev server and open the workout log screen**

Use the project's preview tooling to start `npm run dev`, log in as the seeded test user, open a workout with at least one exercise that has 2+ sets (seed data: `supabase/seed_prototype.sql`, or any workout already logged against the connected Supabase project).

- [ ] **Step 3: Verify swipe-to-delete on a set row**

Swipe a set row left. Confirm: the row slides, a red "Löschen" button is revealed at ~88px, releasing mid-drag snaps it open, tapping "Löschen" removes the set (existing `deleteSet` server action fires — confirm the row disappears and reloading the page doesn't bring it back).

- [ ] **Step 4: Verify full swipe-through commits directly**

Swipe a different set row past roughly 200px in one motion and release. Confirm it deletes immediately without needing a second tap on "Löschen".

- [ ] **Step 5: Verify one-open-at-a-time exclusivity**

Open (swipe-reveal) one set row, then swipe open a second row in the same exercise. Confirm the first row auto-closes.

- [ ] **Step 6: Verify keyboard access (WCAG 2.5.1)**

On a desktop-width viewport, Tab through a set row's controls. Confirm focus reaches a "Löschen" button (after the row's own inputs/warm-up toggle/status control), that focusing it visually reveals the row exactly as a swipe would, and that pressing Enter deletes the set.

- [ ] **Step 7: Verify the exercise-card swipe**

Swipe an exercise card's header left and tap "Löschen". Confirm the whole exercise (and its sets) is removed via `removeWorkoutExercise`, and that swiping/tapping again while a removal is still in flight does nothing (no double-dispatch).

- [ ] **Step 8: Verify `prefers-reduced-motion`**

Enable "reduce motion" (OS accessibility setting, or the browser devtools rendering-emulation panel), reload, and swipe a row open. Confirm it jumps directly to the open/closed state with no animated slide.

- [ ] **Step 9: Verify the weight/reps inputs still work untouched**

Tap into a set row's weight input, confirm the keyboard/cursor behaves normally (starting a drag from directly on the input must not trigger the swipe).

- [ ] **Step 10: Take a confirmation screenshot and report results**

Capture a screenshot of a set row mid-swipe (delete button revealed) as evidence the feature renders correctly, per this project's verification workflow.
