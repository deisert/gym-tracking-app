import type { LastPerformance, SetRecord } from "@/lib/types";

export type GhostValue = { weight_kg: number; reps: number };

/**
 * Placeholder values for the set at `index` (0-based row position on screen).
 * Maps by index over ALL sets of the last session, warm-ups included, so row i
 * lines up with row i last time. Overshooting repeats the final set.
 */
export function ghostForPosition(last: LastPerformance, index: number): GhostValue | null {
  if (!last || last.sets.length === 0) return null;

  const ordered = [...last.sets].sort((a, b) => a.position - b.position);
  const match = ordered[index] ?? ordered[ordered.length - 1];

  return { weight_kg: match.weight_kg, reps: match.reps };
}

/** 82.5 -> "82,5", 80 -> "80". German decimal comma, no trailing zeros. */
export function formatWeight(kg: number): string {
  return (Math.round(kg * 100) / 100).toString().replace(".", ",");
}

/** "80 × 8 · 80 × 8 · 82,5 × 6" — working sets only; warm-ups are not the comparison. */
export function formatSetSummary(sets: SetRecord[]): string {
  return sets
    .filter((s) => !s.is_warmup)
    .sort((a, b) => a.position - b.position)
    .map((s) => `${formatWeight(s.weight_kg)} × ${s.reps}`)
    .join(" · ");
}

export function nextPosition(items: { position: number }[]): number {
  if (items.length === 0) return 0;
  return Math.max(...items.map((i) => i.position)) + 1;
}

/**
 * Which row key should carry the "current set" ring after `removedKey` is
 * deleted from a set list. Untouched unless the removed row was the active
 * one, in which case it falls back to the new last row (or null if that was
 * the only row left).
 */
export function nextActiveKey(
  remainingKeys: string[],
  activeKey: string | null,
  removedKey: string
): string | null {
  if (activeKey !== removedKey) return activeKey;
  return remainingKeys.length > 0 ? remainingKeys[remainingKeys.length - 1] : null;
}
