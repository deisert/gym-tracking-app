"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";

import { addSet, deleteSet, updateSet } from "@/app/workout/actions";
import { SetRow, type SaveStatus } from "@/components/workout/set-row";
import { Button } from "@/components/ui/button";
import { ghostForPosition, type GhostValue } from "@/lib/sets";
import type { LastPerformance, SetRecord } from "@/lib/types";

/** A row as the user sees it: server truth plus whatever they are typing. */
type DraftRow = {
  key: string;
  /** null while the row has never been persisted. */
  id: string | null;
  weight: string;
  reps: string;
  isWarmup: boolean;
  status: SaveStatus;
};

function toDraft(set: SetRecord): DraftRow {
  return {
    key: set.id,
    id: set.id,
    weight: String(set.weight_kg),
    reps: String(set.reps),
    isWarmup: set.is_warmup,
    status: "idle",
  };
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
  /** Scheduled single-retry timers, keyed by row, so a later event can cancel one still pending. */
  const retryTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const clearRetryTimer = useCallback((key: string) => {
    const timer = retryTimersRef.current.get(key);
    if (timer) {
      clearTimeout(timer);
      retryTimersRef.current.delete(key);
    }
  }, []);

  // Cancel every outstanding retry timer on unmount — none of them may fire
  // an uncontrolled dispatch after this component is gone.
  useEffect(() => {
    const timers = retryTimersRef.current;
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
      // A fresh commit supersedes any automatic retry still waiting on this row.
      clearRetryTimer(key);

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

      patch(key, { status: "saving" });

      startTransition(async () => {
        const result = rowId
          ? await updateSet(workoutId, rowId, input)
          : await addSet(workoutId, workoutExerciseId, input);

        inFlightRef.current.delete(key);

        if (result.ok) {
          retriedRef.current.delete(key);

          const stillPresent = rowsRef.current.some((candidate) => candidate.key === key);
          if (stillPresent) {
            patch(key, { id: result.data.id, status: "saved" });
          } else if (wasNewRow) {
            // The row was deleted client-side while this first save was still
            // in flight. The server now holds a set nobody can see — clean it
            // up rather than leaving a phantom that reappears on reload.
            startTransition(async () => {
              await deleteSet(workoutId, result.data.id);
            });
          }
        } else {
          patch(key, { status: "error" });

          // Exactly one automatic retry, then the row waits for a tap.
          if (!retriedRef.current.has(key)) {
            retriedRef.current.add(key);
            const timer = setTimeout(() => {
              retryTimersRef.current.delete(key);
              commit(key);
            }, 2000);
            retryTimersRef.current.set(key, timer);
          }
        }

        // Run the newest edit that arrived while this dispatch was in flight.
        if (pendingRef.current.has(key)) {
          pendingRef.current.delete(key);
          commit(key);
        }
      });
    },
    [clearRetryTimer, patch, workoutExerciseId, workoutId]
  );

  function addRow() {
    setRows((current) => [
      ...current,
      {
        key: `draft-${Date.now()}`,
        id: null,
        weight: "",
        reps: "",
        isWarmup: false,
        status: "idle",
      },
    ]);
  }

  function removeRow(key: string) {
    clearRetryTimer(key);

    const row = rowsRef.current.find((candidate) => candidate.key === key);
    setRows((current) => current.filter((candidate) => candidate.key !== key));

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
      {rows.map((row, index) => (
        <SetRow
          key={row.key}
          index={index}
          weight={row.weight}
          reps={row.reps}
          isWarmup={row.isWarmup}
          ghost={ghostFor(rows, lastPerformance, index)}
          status={row.status}
          onWeightChange={(value) => patch(row.key, { weight: value })}
          onRepsChange={(value) => patch(row.key, { reps: value })}
          onCommit={() => commit(row.key)}
          onToggleWarmup={() => {
            patch(row.key, { isWarmup: !row.isWarmup });
            commit(row.key);
          }}
          onDelete={() => removeRow(row.key)}
          onRetry={() => commit(row.key)}
        />
      ))}

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
