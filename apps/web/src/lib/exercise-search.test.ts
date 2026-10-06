import { describe, expect, it } from "vitest";

import { filterExercises, sortByRecency } from "@/lib/exercise-search";
import type { ExercisePickerOption } from "@/lib/exercise-search";

function option(
  name: string,
  lastPickedAt: string | null = null
): ExercisePickerOption {
  return { id: `e-${name}`, name, note: null, lastPickedAt };
}

function names(options: ExercisePickerOption[]): string[] {
  return options.map((entry) => entry.name);
}

describe("sortByRecency", () => {
  it("puts the most recently picked exercise first", () => {
    const sorted = sortByRecency([
      option("Bankdrücken", "2026-09-01T10:00:00Z"),
      option("Rudern", "2026-09-07T10:00:00Z"),
      option("Kniebeuge", "2026-09-04T10:00:00Z"),
    ]);

    expect(names(sorted)).toEqual(["Rudern", "Kniebeuge", "Bankdrücken"]);
  });

  it("puts every picked exercise ahead of one never picked", () => {
    const sorted = sortByRecency([
      option("Nie Trainiert"),
      option("Bankdrücken", "2026-01-01T10:00:00Z"),
    ]);

    expect(names(sorted)).toEqual(["Bankdrücken", "Nie Trainiert"]);
  });

  it("sorts the never-picked tail alphabetically", () => {
    const sorted = sortByRecency([option("Rudern"), option("Bankdrücken"), option("Kniebeuge")]);

    expect(names(sorted)).toEqual(["Bankdrücken", "Kniebeuge", "Rudern"]);
  });

  it("sorts umlauts the German way, not behind Z", () => {
    const sorted = sortByRecency([option("Zercher Squat"), option("Überzüge"), option("Ausfallschritt")]);

    expect(names(sorted)).toEqual(["Ausfallschritt", "Überzüge", "Zercher Squat"]);
  });

  it("ignores the stored order of the input array", () => {
    const input = [
      option("Kniebeuge", "2026-09-04T10:00:00Z"),
      option("Rudern", "2026-09-07T10:00:00Z"),
    ];
    const sorted = sortByRecency(input);

    expect(names(sorted)).toEqual(["Rudern", "Kniebeuge"]);
    // The picker re-renders from the prop it was given; sorting must not mutate it.
    expect(names(input)).toEqual(["Kniebeuge", "Rudern"]);
  });

  it("returns an empty list for an empty library", () => {
    expect(sortByRecency([])).toEqual([]);
  });
});

describe("filterExercises", () => {
  const library = [
    option("Rudern", "2026-09-07T10:00:00Z"),
    option("Kurzhantel Rudern", "2026-09-04T10:00:00Z"),
    option("Bankdrücken", "2026-09-01T10:00:00Z"),
  ];

  it("returns the whole library for an empty query", () => {
    expect(filterExercises(library, "")).toHaveLength(3);
  });

  it("returns the whole library for a whitespace-only query", () => {
    expect(filterExercises(library, "   ")).toHaveLength(3);
  });

  it("matches a word in the middle of a name, not just the start", () => {
    expect(names(filterExercises(library, "Rudern"))).toEqual(["Rudern", "Kurzhantel Rudern"]);
  });

  it("ignores case on both sides", () => {
    expect(names(filterExercises(library, "bankDRÜCKEN"))).toEqual(["Bankdrücken"]);
  });

  it("ignores surrounding whitespace in the query", () => {
    expect(names(filterExercises(library, "  Bank  "))).toEqual(["Bankdrücken"]);
  });

  it("keeps the recency order it was given instead of re-sorting", () => {
    expect(names(filterExercises(library, "r"))).toEqual([
      "Rudern",
      "Kurzhantel Rudern",
      "Bankdrücken",
    ]);
  });

  it("returns nothing when no name matches", () => {
    expect(filterExercises(library, "Assisted")).toEqual([]);
  });

  it("treats a wildcard as a literal character, not a pattern", () => {
    // The old server search escaped `%` and `_` for `ilike`; substring matching
    // has no pattern syntax to escape, so this must simply find nothing.
    expect(filterExercises(library, "%")).toEqual([]);
  });
});
