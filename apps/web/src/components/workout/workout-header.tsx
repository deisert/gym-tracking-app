"use client";

import { useState, useTransition } from "react";

import { updateWorkoutMeta } from "@/app/workout/actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatPerformedOn } from "@/lib/dates";

type Props = {
  workoutId: string;
  performedOn: string;
  category: string | null;
  note: string | null;
};

export function WorkoutHeader({ workoutId, performedOn, category, note }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [meta, setMeta] = useState({ performedOn, category: category ?? "", note: note ?? "" });
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function save(next: typeof meta) {
    setMeta(next);
    startTransition(async () => {
      const result = await updateWorkoutMeta(workoutId, {
        performed_on: next.performedOn,
        category: next.category.trim() || null,
        note: next.note.trim() || null,
      });
      setError(result.ok ? null : result.error);
    });
  }

  return (
    <section>
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-expanded={isOpen}
        className="flex min-h-12 w-full items-center justify-between text-left"
      >
        <span className="text-xl font-semibold">
          {formatPerformedOn(meta.performedOn)}
          {meta.category ? ` · ${meta.category}` : ""}
        </span>
        <span className="text-sm text-muted-foreground">
          {isOpen ? "Fertig" : "Bearbeiten"}
        </span>
      </button>

      {isOpen && (
        <div className="mt-3 flex flex-col gap-4 rounded-xl bg-card p-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="performed-on">Datum</Label>
            <Input
              id="performed-on"
              type="date"
              className="min-h-11"
              value={meta.performedOn}
              onChange={(event) => setMeta({ ...meta, performedOn: event.target.value })}
              onBlur={() => save(meta)}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="category">Kategorie</Label>
            <Input
              id="category"
              className="min-h-11"
              value={meta.category}
              placeholder="Push, Pull, Beine …"
              onChange={(event) => setMeta({ ...meta, category: event.target.value })}
              onBlur={() => save(meta)}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="note">Notiz</Label>
            <Input
              id="note"
              className="min-h-11"
              value={meta.note}
              placeholder="Wie lief's?"
              onChange={(event) => setMeta({ ...meta, note: event.target.value })}
              onBlur={() => save(meta)}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
      )}
    </section>
  );
}
