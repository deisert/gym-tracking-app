"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";

import { addSet, deleteSet, updateSet } from "@/app/workout/actions";
import type { ActionFailureKind } from "@/app/workout/actions";
import { SetRow, type SaveStatus } from "@/components/workout/set-row";
import { Button } from "@/components/ui/button";
import { SwipeGroupProvider } from "@/components/ui/swipeable-row";
import { formatWeight, ghostForPosition, nextActiveKey, type GhostValue } from "@/lib/sets";
import type { LastPerformance, SetRecord } from "@/lib/types";

/** How long a successful save keeps its check before the row goes quiet again. */
const SAVED_CHECK_MS = 1000;

/** A row as the user sees it: server truth plus whatever they are typing. */
type DraftRow = {
  key: string;
  /** null while the row has never been persisted. */
  id: string | null;
  weight: string;
  reps: string;
  isWarmup: boolean;
  status: SaveStatus;
  /** The server's German failure copy, shown beneath the row. */
  error: string | null;
  /** "validation" suppresses both the automatic and the manual retry. */
  errorKind: ActionFailureKind | null;
};

function toDraft(set: SetRecord): DraftRow {
  return {
    key: set.id,
    id: set.id,
    // formatWeight, not String: a saved 82.5 must read "82,5" in the input,
    // matching its own ghost placeholder. `parseRow` takes the comma back.
    weight: formatWeight(set.weight_kg),
    reps: String(set.reps),
    isWarmup: set.is_warmup,
    status: "idle",
    error: null,
    errorKind: null,
  };
}

/** A row that is untouched and ghosted, so one tap can turn the ghost real. */
function canConfirmGhost(row: DraftRow, ghost: GhostValue | null): boolean {
  return (
    ghost !== null &&
    row.status === "idle" &&
    row.id === null &&
    row.weight === "" &&
    row.reps === ""
  );
}

/**
 * A row with typed content that has never reached the server.
 *
 * Without this the row renders an empty status slot — indistinguishable from a
 * row loaded from the database, so a half-filled row looks saved and then
 * vanishes on reload (`CONCEPT.md` §2.8).
 */
function isUnsaved(row: DraftRow): boolean {
  return (
    row.id === null &&
    row.status === "idle" &&
    (row.weight.trim() !== "" || row.reps.trim() !== "")
  );
}

function parseRow(row: DraftRow) {
  return {
    weight_kg: Number(row.weight.replace(",", ".")),
    reps: Number(row.reps),
    is_warmup: row.isWarmup,
  };
}

/**
 * Placeholder precedence for a row that has never been typed into:
 * ghost value for that index -> the previous row's typed values in the same
 * card -> nothing. The summary line above the rows stays working-sets-only
 * (see `formatSetSummary`); this is the opposite, deliberately including
 * warm-ups, because it lines row i up with row i last time.
 */
function ghostFor(rows: DraftRow[], lastPerformance: LastPerformance, index: number): GhostValue | null {
  const fromHistory = ghostForPosition(lastPerformance, index);
  if (fromHistory) return fromHistory;

  const previous = rows[index - 1];
  if (!previous) return null;

  const weightText = previous.weight.trim();
  const repsText = previous.reps.trim();
  if (weightText === "" || repsText === "") return null;

  const weight_kg = Number(weightText.replace(",", "."));
  const reps = Number(repsText);
  if (!Number.isFinite(weight_kg) || !Number.isFinite(reps)) return null;

  return { weight_kg, reps };
}

type Props = {
  workoutId: string;
  workoutExerciseId: string;
  sets: SetRecord[];
  lastPerformance: LastPerformance;
};

export function SetList({ workoutId, workoutExerciseId, sets, lastPerformance }: Props) {
  const [rows, setRowsState] = useState<DraftRow[]>(() => sets.map(toDraft));
  const [, startTransition] = useTransition();

  /**
   * The set the user is currently "on" — gets a persistent ring so it's
   * visible even once focus leaves the input (user feedback 2026-08-20).
   * Defaults to the last row (the one most likely being worked on), moves to
   * whichever row is focused, and falls back sensibly when that row is
   * deleted (see `nextActiveKey`).
   */
  const [activeKey, setActiveKey] = useState<string | null>(
    () => (rows.length > 0 ? rows[rows.length - 1].key : null)
  );

  /**
   * A mirror of `rows` that callbacks can read synchronously.
   *
   * React may invoke a state updater more than once (StrictMode does exactly
   * that in development), so updaters must stay pure. Dispatching a save from
   * inside one would save the set twice. Everything that has a side effect
   * reads `rowsRef.current` instead.
   */
  const rowsRef = useRef<DraftRow[]>(rows);
  const retriedRef = useRef<Set<string>>(new Set());

  /** Keys with a save currently awaiting the server. */
  const inFlightRef = useRef<Set<string>>(new Set());
  /** Keys that got a new commit while already in flight; re-dispatched once the in-flight one settles. */
  const pendingRef = useRef<Set<string>>(new Set());
  /**
   * At most one scheduled timer per row: either the single automatic retry or
   * the check-clearing timer after a successful save. The two can never be
   * outstanding at the same time (a save that failed produced no check, and a
   * fresh commit clears whatever was scheduled), so one map serves both and a
   * later event can always cancel what is pending for that row.
   */
  const rowTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  /** Monotonic source of draft keys — `Date.now()` collides within a millisecond. */
  const draftSeqRef = useRef(0);

  const clearRowTimer = useCallback((key: string) => {
    const timer = rowTimersRef.current.get(key);
    if (timer) {
      clearTimeout(timer);
      rowTimersRef.current.delete(key);
    }
  }, []);

  // Cancel every outstanding timer on unmount — none of them may fire an
  // uncontrolled dispatch or state write after this component is gone.
  useEffect(() => {
    const timers = rowTimersRef.current;
    return () => {
      timers.forEach((timer) => clearTimeout(timer));
      timers.clear();
    };
  }, []);

  const setRows = useCallback((update: (current: DraftRow[]) => DraftRow[]) => {
    rowsRef.current = update(rowsRef.current);
    setRowsState(rowsRef.current);
  }, []);

  const patch = useCallback(
    (key: string, changes: Partial<DraftRow>) => {
      setRows((current) =>
        current.map((row) => (row.key === key ? { ...row, ...changes } : row))
      );
    },
    [setRows]
  );

  // A named function expression, so the retry below can call it by name
  // without a forward reference.
  const commit = useCallback(
    function commit(key: string) {
      // A fresh commit supersedes anything still scheduled for this row —
      // an automatic retry, or the check left by the previous save.
      clearRowTimer(key);

      const row = rowsRef.current.find((candidate) => candidate.key === key);
      if (!row) return;

      // An empty field is a draft, not a value — never treat it as "0".
      // (`Number("")` is 0, which is a legitimate bodyweight weight, so this
      // check must happen before parsing rather than relying on isFinite.)
      const weightText = row.weight.trim();
      const repsText = row.reps.trim();
      if (weightText === "" || repsText === "") return;

      const input = parseRow(row);
      // Anything else incomplete/invalid is also a draft, not a failure.
      if (!Number.isFinite(input.weight_kg) || !Number.isFinite(input.reps) || input.reps < 1) {
        return;
      }

      // Serialise dispatches per row: never let two saves for the same row
      // race. A commit that arrives while one is already in flight (e.g. blur
      // firing right after the warm-up toggle's own commit) is deferred until
      // the in-flight one settles, instead of firing a second insert.
      if (inFlightRef.current.has(key)) {
        pendingRef.current.add(key);
        return;
      }
      inFlightRef.current.add(key);

      const wasNewRow = row.id === null;
      const rowId = row.id;

      patch(key, { status: "saving", error: null, errorKind: null });

      startTransition(async () => {
        const result = rowId
          ? await updateSet(workoutId, rowId, input)
          : await addSet(workoutId, workoutExerciseId, input);

        inFlightRef.current.delete(key);

        if (result.ok) {
          retriedRef.current.delete(key);

          const stillPresent = rowsRef.current.some((candidate) => candidate.key === key);
          if (stillPresent) {
            patch(key, {
              id: result.data.id,
              status: "saved",
              error: null,
              errorKind: null,
            });

            // The check is a confirmation, not a permanent badge: leaving it
            // makes rows saved this session look different from identical
            // rows loaded from the server. Let it fade back to idle.
            const savedTimer = setTimeout(() => {
              rowTimersRef.current.delete(key);
              const current = rowsRef.current.find((candidate) => candidate.key === key);
              if (current?.status === "saved") patch(key, { status: "idle" });
            }, SAVED_CHECK_MS);
            rowTimersRef.current.set(key, savedTimer);
          } else if (wasNewRow) {
            // The row was deleted client-side while this first save was still
            // in flight. The server now holds a set nobody can see — clean it
            // up rather than leaving a phantom that reappears on reload.
            startTransition(async () => {
              await deleteSet(workoutId, result.data.id);
            });
          }
        } else {
          const kind = result.kind ?? "transient";
          patch(key, { status: "error", error: result.error, errorKind: kind });

          // A validation rejection is permanent: the same numbers will be
          // rejected again, so retrying only hides the message that says what
          // to fix. Only a transient failure gets the automatic retry —
          // exactly one, after which the row waits for a tap.
          if (kind !== "validation" && !retriedRef.current.has(key)) {
            retriedRef.current.add(key);
            const timer = setTimeout(() => {
              rowTimersRef.current.delete(key);
              commit(key);
            }, 2000);
            rowTimersRef.current.set(key, timer);
          }
        }

        // Run the newest edit that arrived while this dispatch was in flight.
        if (pendingRef.current.has(key)) {
          pendingRef.current.delete(key);
          commit(key);
        }
      });
    },
    [clearRowTimer, patch, workoutExerciseId, workoutId]
  );

  /**
   * A field edit, with one extra rule: blanking a field must clear a failure.
   *
   * `commit` refuses to dispatch a row with an empty field, so an error status
   * left standing after a blank is a dot that explains nothing and a retry tap
   * that can never do anything.
   */
  const changeField = useCallback(
    (key: string, changes: Partial<DraftRow>) => {
      const row = rowsRef.current.find((candidate) => candidate.key === key);
      const next = row ? { ...row, ...changes } : null;
      const isBlank =
        next !== null && (next.weight.trim() === "" || next.reps.trim() === "");

      if (next && isBlank && next.status === "error") {
        clearRowTimer(key);
        retriedRef.current.delete(key);
        patch(key, { ...changes, status: "idle", error: null, errorKind: null });
        return;
      }

      patch(key, changes);
    },
    [clearRowTimer, patch]
  );

  /**
   * One-tap ghost confirmation (spec §8): turn the placeholder into a value.
   *
   * Patch then commit synchronously, exactly as the warm-up toggle does —
   * `setRows` writes `rowsRef.current` before `setRowsState`, so `commit`
   * reads the numbers just written rather than the pre-tap blanks.
   */
  const confirmGhost = useCallback(
    (key: string, ghost: GhostValue) => {
      patch(key, {
        weight: formatWeight(ghost.weight_kg),
        reps: String(ghost.reps),
      });
      commit(key);
    },
    [commit, patch]
  );

  function addRow() {
    draftSeqRef.current += 1;
    const key = `draft-${draftSeqRef.current}`;
    setRows((current) => [
      ...current,
      {
        key,
        id: null,
        weight: "",
        reps: "",
        isWarmup: false,
        status: "idle",
        error: null,
        errorKind: null,
      },
    ]);
    // The newly added row is the one about to be filled in — make it current.
    setActiveKey(key);
  }

  function removeRow(key: string) {
    clearRowTimer(key);

    const row = rowsRef.current.find((candidate) => candidate.key === key);
    const remaining = rowsRef.current.filter((candidate) => candidate.key !== key);
    setRows(() => remaining);
    setActiveKey((current) =>
      nextActiveKey(
        remaining.map((candidate) => candidate.key),
        current,
        key
      )
    );

    if (row?.id) {
      const setId = row.id;
      startTransition(async () => {
        await deleteSet(workoutId, setId);
      });
    }
    // A row with no `id` yet may still have a save in flight — `commit`'s
    // success handler checks whether the row is still present and cleans up
    // the orphaned set itself once the server responds.
  }

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
              isActive={row.key === activeKey}
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
              onFocusRow={() => setActiveKey(row.key)}
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
}
