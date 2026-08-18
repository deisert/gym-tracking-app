"use client";

import { useCallback, useRef, useState, useTransition } from "react";

import { addSet, deleteSet, updateSet } from "@/app/workout/actions";
import { SetRow, type SaveStatus } from "@/components/workout/set-row";
import { Button } from "@/components/ui/button";
import { ghostForPosition } from "@/lib/sets";
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
      const row = rowsRef.current.find((candidate) => candidate.key === key);
      if (!row) return;

      const input = parseRow(row);
      // An incomplete row is a draft, not a failure — leave it alone.
      if (!Number.isFinite(input.weight_kg) || !Number.isFinite(input.reps) || input.reps < 1) {
        return;
      }

      patch(key, { status: "saving" });

      startTransition(async () => {
        const result = row.id
          ? await updateSet(workoutId, row.id, input)
          : await addSet(workoutId, workoutExerciseId, input);

        if (result.ok) {
          retriedRef.current.delete(key);
          patch(key, { id: result.data.id, status: "saved" });
          return;
        }

        patch(key, { status: "error" });

        // Exactly one automatic retry, then the row waits for a tap.
        if (!retriedRef.current.has(key)) {
          retriedRef.current.add(key);
          setTimeout(() => commit(key), 2000);
        }
      });
    },
    [patch, workoutExerciseId, workoutId]
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
    const row = rowsRef.current.find((candidate) => candidate.key === key);
    setRows((current) => current.filter((candidate) => candidate.key !== key));

    if (row?.id) {
      const setId = row.id;
      startTransition(async () => {
        await deleteSet(workoutId, setId);
      });
    }
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
          ghost={ghostForPosition(lastPerformance, index)}
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
