import type { ExerciseOption } from "@/lib/types";

/**
 * A picker entry: an exercise plus the recency the ordering is built from.
 *
 * `lastPickedAt` mirrors `exercises.last_picked_at` — an ISO timestamp of when
 * the exercise was last added to a workout, null for one never picked. It stays
 * off `ExerciseOption` because only the picker sorts by it; `findOrCreateExercise`
 * hands back a plain option and has no use for the column.
 */
export type ExercisePickerOption = ExerciseOption & {
  lastPickedAt: string | null;
};

/**
 * Recently used first, then everything never picked, alphabetically.
 *
 * The name tie-break stays in JS rather than moving into the `order by`: the
 * Postgres instance's collation is not guaranteed to be German, and under `C`
 * collation "Überzüge" sorts behind "Zercher Squat" instead of next to "U".
 * `localeCompare(…, "de")` is the only place that ordering is pinned.
 *
 * Timestamps compare as strings because they are ISO-8601 from PostgREST, where
 * lexical order is chronological order.
 */
export function sortByRecency(options: ExercisePickerOption[]): ExercisePickerOption[] {
  return [...options].sort((a, b) => {
    const pickedA = a.lastPickedAt;
    const pickedB = b.lastPickedAt;
    if (pickedA && pickedB) return pickedA < pickedB ? 1 : -1;
    if (pickedA) return -1;
    if (pickedB) return 1;
    return a.name.localeCompare(b.name, "de");
  });
}

/**
 * The entries whose name contains `query`, case-insensitively.
 *
 * Order is preserved, never recomputed: the caller passes a list already sorted
 * by `sortByRecency`, so a filtered list stays recently-used-first. An empty or
 * whitespace-only query matches everything, which is what the picker shows the
 * moment it opens.
 *
 * Substring rather than prefix matching is deliberate — "Rudern" has to find
 * "Kurzhantel Rudern", which is how the library's compound names are written.
 */
export function filterExercises(
  options: ExercisePickerOption[],
  query: string
): ExercisePickerOption[] {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) return options;

  return options.filter((option) => option.name.toLowerCase().includes(needle));
}
