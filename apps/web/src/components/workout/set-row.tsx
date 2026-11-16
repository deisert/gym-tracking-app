"use client";

import { cn } from "@/lib/utils";
import { formatWeight, type GhostValue } from "@gymtrack/core";
import { SwipeableRow } from "@/components/ui/swipeable-row";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

type Props = {
  rowId: string;
  index: number;
  weight: string;
  reps: string;
  isWarmup: boolean;
  /** "+3 unsauber · Dropset" for imported sets; null when there is nothing to say. */
  extras: string | null;
  ghost: GhostValue | null;
  /** "Neuer Rekord · Gewicht 85 kg (vorher 80)", or null when this set is no record. */
  recordText: string | null;
  status: SaveStatus;
  /** German failure copy from the server, rendered beneath the row. */
  error: string | null;
  /** False for a validation failure: the same input can never succeed. */
  canRetry: boolean;
  /** The row is untouched and has a ghost, so one tap can confirm it. */
  canConfirmGhost: boolean;
  /** The row has typed content that has never reached the server. */
  isUnsaved: boolean;
  /** True when this is the set the user is currently "on" — gets a ring. */
  isActive: boolean;
  onWeightChange: (value: string) => void;
  onRepsChange: (value: string) => void;
  onCommit: () => void;
  onToggleWarmup: () => void;
  onDelete: () => void;
  onRetry: () => void;
  onConfirmGhost: () => void;
  /** Marks this row as current the moment either of its inputs gets focus. */
  onFocusRow: () => void;
};

export function SetRow({
  rowId,
  index,
  weight,
  reps,
  isWarmup,
  extras,
  ghost,
  recordText,
  status,
  error,
  canRetry,
  canConfirmGhost,
  isUnsaved,
  isActive,
  onWeightChange,
  onRepsChange,
  onCommit,
  onToggleWarmup,
  onDelete,
  onRetry,
  onConfirmGhost,
  onFocusRow,
}: Props) {
  const inputClass =
    "min-h-12 w-full min-w-0 rounded-xl bg-muted px-1 text-2xl font-semibold tabular-nums " +
    "text-center outline-none focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <SwipeableRow id={rowId} deleteLabel={`Satz ${index + 1} löschen`} onDelete={onDelete}>
      {/* One grid for the inputs and the lines under them, so every row's
          columns line up whatever its status shows, and notes start flush with
          the weight input. The ring is inset: SwipeableRow's overflow-hidden
          clips anything drawn outside the row. */}
      <div
        className={cn(
          "grid grid-cols-[1.25rem_minmax(0,1fr)_auto_minmax(0,1fr)_2.75rem_2.5rem] items-center gap-x-2 gap-y-1 rounded-xl p-1.5 ring-2 ring-inset transition-shadow",
          isActive ? "ring-ring" : "ring-transparent"
        )}
      >
        <span
          className={cn(
            "text-center text-sm tabular-nums",
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
          onFocus={onFocusRow}
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
          onFocus={onFocusRow}
          onBlur={onCommit}
          className={inputClass}
        />

        <button
          type="button"
          onClick={onToggleWarmup}
          aria-pressed={isWarmup}
          aria-label={`Aufwärmsatz ${index + 1}`}
          className={cn(
            "min-h-12 rounded-xl text-sm font-medium",
            // Warm-up state is never signalled by colour alone (DESIGN_SYSTEM.md §8).
            isWarmup
              ? "bg-muted text-foreground"
              : "text-muted-foreground ring-1 ring-border ring-inset"
          )}
        >
          W
        </button>

        <span className="flex items-center justify-center" aria-live="polite">
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
                className="flex min-h-12 w-full items-center justify-center text-[hsl(38_92%_55%)]"
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
              className="flex min-h-12 w-full items-center justify-center text-primary"
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

        {extras && <p className="col-span-5 col-start-2 text-sm text-muted-foreground">{extras}</p>}
        {recordText && (
          // --warning is the design system's PR highlight. Icon + words, so it
          // never rests on colour alone; the pulse is skipped for reduced motion.
          <p
            role="status"
            className="col-span-5 col-start-2 text-sm font-medium text-[hsl(38_92%_55%)] motion-safe:animate-[pulse_0.4s_ease-out_1]"
          >
            <span aria-hidden>🏆 </span>
            {recordText}
          </p>
        )}
        {error && <p className="col-span-5 col-start-2 text-sm text-destructive">{error}</p>}
      </div>
    </SwipeableRow>
  );
}
