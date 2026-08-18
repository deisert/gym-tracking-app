"use client";

import { cn } from "@/lib/utils";
import type { GhostValue } from "@/lib/sets";
import { formatWeight } from "@/lib/sets";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

type Props = {
  index: number;
  weight: string;
  reps: string;
  isWarmup: boolean;
  ghost: GhostValue | null;
  status: SaveStatus;
  onWeightChange: (value: string) => void;
  onRepsChange: (value: string) => void;
  onCommit: () => void;
  onToggleWarmup: () => void;
  onDelete: () => void;
  onRetry: () => void;
};

export function SetRow({
  index,
  weight,
  reps,
  isWarmup,
  ghost,
  status,
  onWeightChange,
  onRepsChange,
  onCommit,
  onToggleWarmup,
  onDelete,
  onRetry,
}: Props) {
  const inputClass =
    "min-h-12 w-full rounded-xl bg-muted px-3 text-2xl font-semibold tabular-nums " +
    "text-center outline-none focus-visible:ring-2 focus-visible:ring-ring";

  return (
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
        {status === "error" && (
          <button
            type="button"
            onClick={onRetry}
            aria-label="Erneut versuchen"
            className="flex min-h-11 min-w-11 items-center justify-center text-[hsl(38_92%_55%)]"
          >
            ●
          </button>
        )}
      </span>

      <button
        type="button"
        onClick={onDelete}
        aria-label={`Satz ${index + 1} löschen`}
        className="min-h-12 min-w-11 text-muted-foreground"
      >
        ×
      </button>
    </div>
  );
}
