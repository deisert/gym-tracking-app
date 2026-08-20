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
