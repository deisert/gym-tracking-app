# Notes-File Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Backfill ~150 workouts from the private training log `past-sets.md` into the owner's account, and show unclean reps and dropsets in the app.

**Architecture:** An additive migration adds `sets.unclean_reps` and `sets.is_dropset`; the app reads and displays them. A pure, Vitest-tested parser in `src/lib/notes-import/` turns the log into an import model; a `tsx` runner writes a local HTML preview plus dry-run/commit/rollback SQL, which is executed through the Supabase MCP connection after the owner approves the preview.

**Tech Stack:** Next.js 16 (App Router), TypeScript, Supabase Postgres (RLS), Vitest, `tsx` (new dev dependency).

**Spec:** `docs/superpowers/specs/2026-09-24-notes-import-design.md`

## Global Constraints

- Staging and production share ONE Supabase project (`dctoccqancfuwtfbjjyg`). Every migration and every data write is live in production immediately.
- Owner account: `4458ae8e-cf70-4ba5-8416-e9e7983cf181`. Existing app data starts 2026-08-19; the log ends 2026-08-16.
- `past-sets.md` is git-ignored and private. Never commit it, the preview, or generated SQL. Tests use synthetic lines only. Generated files go to the session scratchpad, never into the repo.
- `weight_kg` is `numeric(6,2)`: every imported weight is rounded to two decimals (21.875 → 21.88).
- `reps` = clean reps only. Unclean reps go to `unclean_reps`, never into `reps`.
- Reuse the 21 existing exercise names **verbatim** (case-sensitive `unique (user_id, name)`).
- No schema change for unknown reps: such sets are dropped.
- UI copy is German. Comments match the surrounding density (explain *why*).
- Before the PR: `npm run lint && npm run test && npm run build`.
- The import (Task 11) runs only after the owner explicitly approves the preview (end of Task 10).

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/<version>_sets_unclean_reps_dropset.sql` | Adds the two columns and the warm-up/dropset exclusivity check |
| `src/lib/types.ts` | `SetRecord` gains `unclean_reps`, `is_dropset` |
| `src/app/workout/actions.ts`, `src/lib/data/workouts.ts`, `src/lib/data/exercises.ts` | Select and map the new columns; warm-up clears dropset |
| `src/lib/sets.ts` | `formatSetExtras` — the „+3 unsauber · Dropset“ line |
| `src/components/workout/set-row.tsx`, `set-list.tsx` | Render that line; keep the values across saves |
| `src/lib/notes-import/types.ts` | Shared types for parser, builder, emitters |
| `src/lib/notes-import/weights.ts` | Weight terms → kg (sums, stack-step snapping, cents) |
| `src/lib/notes-import/set-line.ts` | One line → set / unknown reps / bare number / nothing |
| `src/lib/notes-import/dates.ts` | Date lines, year rollover, estimated dates |
| `src/lib/notes-import/exercise-map.ts` | Raw exercise text → canonical exercise + attributes |
| `src/lib/notes-import/overrides.ts` | Line-numbered corrections for the real file |
| `src/lib/notes-import/parse-log.ts` | Whole file → workouts + a fate for every line |
| `src/lib/notes-import/build-import.ts` | Parsed log → dated import model with per-side rules |
| `src/lib/notes-import/emit-sql.ts` | Import model → dry-run/commit/rollback SQL |
| `src/lib/notes-import/preview.ts` | Import model → review HTML |
| `scripts/notes-import.ts` | Runner: file in, preview + SQL out, fails on any unclassified line |

---

### Task 1: Migration and data plumbing

**Files:**
- Create: `supabase/migrations/<version>_sets_unclean_reps_dropset.sql`
- Modify: `src/lib/types.ts:1-10`
- Modify: `src/app/workout/actions.ts:33-51` and the `updateSet` update object (~line 280)
- Modify: `src/lib/data/workouts.ts:12-18,37-45,56`
- Modify: `src/lib/data/exercises.ts:8-24,123`
- Modify: `src/lib/sets.test.ts:11-13`, `src/lib/workout-summary.test.ts:6-8`

**Interfaces:**
- Produces: `SetRecord = { id; position; weight_kg: number; reps: number; is_warmup: boolean; unclean_reps: number; is_dropset: boolean }` — used by Task 2.

- [ ] **Step 1: Write the migration file**

Create `supabase/migrations/20260924200000_sets_unclean_reps_dropset.sql` (the version is renamed in Step 3):

```sql
-- Unclean reps and dropsets on a set
-- (docs/superpowers/specs/2026-09-24-notes-import-design.md §3).
--
-- `reps` keeps meaning CLEAN reps, so every existing reader — the dashboard
-- views, records, e1RM, volume — stays correct without a change. Reps done
-- with sloppy form or partial range live beside it, never inside it.
--
-- `is_dropset` follows the `is_warmup` idiom instead of replacing both with a
-- set-type enum: `is_warmup` is read in ~30 places, the dashboard views among
-- them, and an enum buys nothing today. A set cannot be both.
--
-- Additive with defaults: the deployed app never names these columns, so this
-- is safe to apply while the old code is live (staging and production share
-- this database).

alter table sets
  add column unclean_reps int not null default 0 check (unclean_reps >= 0),
  add column is_dropset boolean not null default false,
  add constraint sets_warmup_xor_dropset check (not (is_warmup and is_dropset));

comment on column sets.unclean_reps is
  'Extra reps with unclean form or partial range, done after `reps` clean ones. Counted by no metric.';
comment on column sets.is_dropset is
  'A lighter continuation straight after the previous set.';
```

- [ ] **Step 2: Apply it through the Supabase MCP**

Call `apply_migration` with `project_id: "dctoccqancfuwtfbjjyg"`, `name: "sets_unclean_reps_dropset"`, and the SQL above.

Verify with `execute_sql`:

```sql
select column_name, data_type, column_default
  from information_schema.columns
 where table_name = 'sets' and column_name in ('unclean_reps', 'is_dropset');
```

Expected: two rows, defaults `0` and `false`.

- [ ] **Step 3: Align the file's version with the applied one**

Call `list_migrations`, take the version of `sets_unclean_reps_dropset`, and rename the file to `supabase/migrations/<that version>_sets_unclean_reps_dropset.sql` (same practice as commit `72a3421`).

- [ ] **Step 4: Extend `SetRecord`**

In `src/lib/types.ts` replace the type with:

```ts
/** A logged set. `weight_kg` is always a number here — PostgREST may hand
 *  back `numeric` columns as strings, so the data layer converts on the way in.
 *  `reps` counts clean reps only; `unclean_reps` are extra, sloppy ones. */
export type SetRecord = {
  id: string;
  position: number;
  weight_kg: number;
  reps: number;
  is_warmup: boolean;
  unclean_reps: number;
  is_dropset: boolean;
};
```

- [ ] **Step 5: Select and map the columns in all three data paths**

In each of `src/app/workout/actions.ts`, `src/lib/data/workouts.ts`, `src/lib/data/exercises.ts`, extend `RawSet` and `toSetRecord`:

```ts
type RawSet = {
  id: string;
  position: number;
  weight_kg: number | string;
  reps: number;
  is_warmup: boolean;
  unclean_reps: number;
  is_dropset: boolean;
};

function toSetRecord(raw: RawSet): SetRecord {
  return {
    id: raw.id,
    position: raw.position,
    weight_kg: Number(raw.weight_kg),
    reps: raw.reps,
    is_warmup: raw.is_warmup,
    unclean_reps: raw.unclean_reps,
    is_dropset: raw.is_dropset,
  };
}
```

In `actions.ts`:

```ts
const SET_COLUMNS = "id, position, weight_kg, reps, is_warmup, unclean_reps, is_dropset";
```

In `workouts.ts` and `exercises.ts` change both nested selects to:

```
sets ( id, position, weight_kg, reps, is_warmup, unclean_reps, is_dropset )
```

- [ ] **Step 6: Warm-up clears dropset in `updateSet`**

In `src/app/workout/actions.ts`, `updateSet`, replace the `.update({...})` argument with:

```ts
    .update({
      weight_kg: parsed.data.weight_kg,
      reps: parsed.data.reps,
      is_warmup: parsed.data.is_warmup,
      // `sets_warmup_xor_dropset` forbids both flags. Marking an imported
      // dropset as warm-up must clear the dropset, or the save fails forever.
      // `unclean_reps` is never written here: editing keeps what was imported.
      ...(parsed.data.is_warmup ? { is_dropset: false } : {}),
    })
```

- [ ] **Step 7: Update the test fixtures**

In `src/lib/sets.test.ts` and `src/lib/workout-summary.test.ts` replace the `set` helper with:

```ts
function set(position: number, weight_kg: number, reps: number, is_warmup = false): SetRecord {
  return { id: `s${position}`, position, weight_kg, reps, is_warmup, unclean_reps: 0, is_dropset: false };
}
```

- [ ] **Step 8: Type-check and test**

Run: `npx tsc --noEmit && npm run test`
Expected: no type errors; all existing tests PASS.

- [ ] **Step 9: Commit**

```bash
git add supabase/migrations src/lib/types.ts src/app/workout/actions.ts src/lib/data/workouts.ts src/lib/data/exercises.ts src/lib/sets.test.ts src/lib/workout-summary.test.ts
git commit -m "feat(db): unclean reps and dropsets on a set"
```

---

### Task 2: Show unclean reps and dropsets in the set list

**Files:**
- Modify: `src/lib/sets.ts` (add `formatSetExtras`)
- Test: `src/lib/sets.test.ts`
- Modify: `src/components/workout/set-row.tsx`
- Modify: `src/components/workout/set-list.tsx`

**Interfaces:**
- Consumes: `SetRecord` from Task 1.
- Produces: `formatSetExtras(set: Pick<SetRecord, "unclean_reps" | "is_dropset">): string | null`.

- [ ] **Step 1: Write the failing test**

Append to `src/lib/sets.test.ts` (add `formatSetExtras` to the import list):

```ts
describe("formatSetExtras", () => {
  it("is null for a plain set", () => {
    expect(formatSetExtras({ unclean_reps: 0, is_dropset: false })).toBeNull();
  });

  it("names unclean reps", () => {
    expect(formatSetExtras({ unclean_reps: 3, is_dropset: false })).toBe("+3 unsauber");
  });

  it("names a dropset", () => {
    expect(formatSetExtras({ unclean_reps: 0, is_dropset: true })).toBe("Dropset");
  });

  it("joins both", () => {
    expect(formatSetExtras({ unclean_reps: 2, is_dropset: true })).toBe("+2 unsauber · Dropset");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/sets.test.ts`
Expected: FAIL — `formatSetExtras` is not exported.

- [ ] **Step 3: Implement**

Add to `src/lib/sets.ts` below `formatSetSummary`:

```ts
/**
 * What a set carries beyond weight × reps — "+3 unsauber · Dropset" — or null.
 * Display only: the logging UI cannot enter either value yet, so this line is
 * how imported history stays honest on screen.
 */
export function formatSetExtras(
  set: Pick<SetRecord, "unclean_reps" | "is_dropset">
): string | null {
  const parts: string[] = [];
  if (set.unclean_reps > 0) parts.push(`+${set.unclean_reps} unsauber`);
  if (set.is_dropset) parts.push("Dropset");
  return parts.length > 0 ? parts.join(" · ") : null;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/lib/sets.test.ts`
Expected: PASS.

- [ ] **Step 5: Render the line in `SetRow`**

In `src/components/workout/set-row.tsx` add to `Props` (after `isWarmup`):

```ts
  /** "+3 unsauber · Dropset" for imported sets; null when there is nothing to say. */
  extras: string | null;
```

Destructure `extras` in the parameter list, and directly above `{error && ...}` add:

```tsx
        {extras && <p className="pl-8 text-sm text-muted-foreground">{extras}</p>}
```

- [ ] **Step 6: Carry the values through `SetList`**

In `src/components/workout/set-list.tsx`:

1. Import: `import { formatSetExtras, formatWeight, ghostForPosition, nextActiveKey, type GhostValue } from "@/lib/sets";`
2. Add to `DraftRow` after `isWarmup`:

```ts
  /** Server truth only — the row cannot edit these, it just shows them. */
  uncleanReps: number;
  isDropset: boolean;
```

3. In `toDraft` add `uncleanReps: set.unclean_reps, isDropset: set.is_dropset,`.
4. In `addRow` add `uncleanReps: 0, isDropset: false,` to the new row.
5. In `commit`'s success branch, extend the `patch(key, {...})` with the server's values:

```ts
            patch(key, {
              id: result.data.id,
              uncleanReps: result.data.unclean_reps,
              isDropset: result.data.is_dropset,
              status: "saved",
              error: null,
              errorKind: null,
            });
```

6. Replace the warm-up toggle handler with:

```tsx
              onToggleWarmup={() => {
                // Turning a set into a warm-up clears its dropset — the server
                // does the same (`sets_warmup_xor_dropset`).
                patch(row.key, {
                  isWarmup: !row.isWarmup,
                  ...(row.isWarmup ? {} : { isDropset: false }),
                });
                commit(row.key);
              }}
```

7. Pass the prop to `<SetRow>`:

```tsx
              extras={formatSetExtras({ unclean_reps: row.uncleanReps, is_dropset: row.isDropset })}
```

- [ ] **Step 7: Type-check, lint, test**

Run: `npx tsc --noEmit && npm run lint && npm run test`
Expected: clean; all tests PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/sets.ts src/lib/sets.test.ts src/components/workout/set-row.tsx src/components/workout/set-list.tsx
git commit -m "feat(workout): show unclean reps and dropsets beneath a set"
```

---

### Task 3: Import types and weight parsing

**Files:**
- Create: `src/lib/notes-import/types.ts`
- Create: `src/lib/notes-import/weights.ts`
- Test: `src/lib/notes-import/weights.test.ts`

**Interfaces:**
- Produces (`types.ts`): `Side`, `RawSet`, `RawExercise`, `RawWorkout`, `LineFate`, `ParsedLog`, `ImportSet`, `ImportExercise`, `ImportWorkout`, `ImportResult`, `DayMonth`.
- Produces (`weights.ts`): `normalizeWeightTerm(term: string): number`, `parseWeight(text: string): number`, `roundKg(kg: number): number`.

- [ ] **Step 1: Write `types.ts`**

```ts
// Types shared by the notes-file import (spec: docs/superpowers/specs/2026-09-24-notes-import-design.md).
// "Raw" = as written in the log; "Import" = what is inserted into the database.

export type Side = "L" | "R";

export type DayMonth = { day: number; month: number; year: number | null };

/** One set line, before exercise-level rules (per-side, halving) apply. */
export type RawSet = {
  line: number;
  weightKg: number;
  /** "85/12 42.5 each side" → 42.5: the line named the per-side weight itself. */
  perSideWeightKg: number | null;
  /** The line said "each side" / "each". */
  perSide: boolean;
  reps: number;
  uncleanReps: number;
  isWarmup: boolean;
  isDropset: boolean;
  side: Side | null;
  /** Leftover text ("90%", "slow") — becomes part of the exercise note. */
  annotation: string | null;
};

export type RawExercise = {
  line: number;
  header: string;
  /** Text lines that belong to the exercise but are not sets ("No straps", "Top grip"). */
  details: string[];
  sets: RawSet[];
};

export type RawWorkout = {
  line: number;
  date: DayMonth | null;
  notes: string[];
  category: string | null;
  exercises: RawExercise[];
};

/** What happened to one line of the log. Every line gets at least one. */
export type LineFate =
  | {
      line: number;
      kind:
        | "blank"
        | "separator"
        | "date"
        | "workout-note"
        | "category"
        | "cardio"
        | "header"
        | "exercise-note"
        | "set";
    }
  | { line: number; kind: "dropped"; reason: string }
  | { line: number; kind: "unclassified"; text: string };

export type ParsedLog = { workouts: RawWorkout[]; fates: LineFate[] };

export type ImportSet = {
  weightKg: number;
  reps: number;
  uncleanReps: number;
  isWarmup: boolean;
  isDropset: boolean;
};

export type ImportExercise = {
  line: number;
  rawHeader: string;
  name: string;
  attributes: Record<string, string>;
  note: string | null;
  /** Review markers for the preview: "halbiert", "umgerechnet". */
  flags: string[];
  sets: ImportSet[];
};

export type ImportWorkout = {
  line: number;
  performedOn: string; // "YYYY-MM-DD"
  dateEstimated: boolean;
  category: string | null;
  note: string | null;
  exercises: ImportExercise[];
};

export type ImportResult = {
  workouts: ImportWorkout[];
  /** Whole workouts that were left out, with the reason. */
  dropped: { line: number; reason: string }[];
};
```

- [ ] **Step 2: Write the failing weight tests**

`src/lib/notes-import/weights.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { normalizeWeightTerm, parseWeight, roundKg } from "@/lib/notes-import/weights";

describe("normalizeWeightTerm", () => {
  it.each([
    ["80", 80],
    ["82.5", 82.5],
    ["82,5", 82.5],
    ["21.25", 21.25],
    ["21.625", 21.625],
    ["21.8", 21.875],
    ["21.85", 21.875],
    ["26.825", 26.875],
    ["28.9", 28.875],
    ["29.3", 29.375],
    ["29.325", 29.375],
    ["29.35", 29.375],
    ["29.4", 29.375],
    ["21.2", 21.25],
    ["26.26", 26.25],
    ["87.6", 87.5],
  ])("%s → %s", (input, expected) => {
    expect(normalizeWeightTerm(input)).toBe(expected);
  });
});

describe("parseWeight", () => {
  it("rounds to the numeric(6,2) column", () => {
    expect(parseWeight("21.85")).toBe(21.88);
    expect(parseWeight("29.325")).toBe(29.38);
    expect(parseWeight("21.625")).toBe(21.63);
  });

  it("adds summed weights", () => {
    expect(parseWeight("25+15+10")).toBe(50);
    expect(parseWeight("18.75+ 0.625")).toBe(19.38);
  });
});

describe("roundKg", () => {
  it("rounds half up at the cent", () => {
    expect(roundKg(21.875)).toBe(21.88);
    expect(roundKg(12.5)).toBe(12.5);
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run src/lib/notes-import/weights.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement `weights.ts`**

```ts
/**
 * The cable stacks move in fixed steps, but the log writes the same step
 * several ways (21.8 / 21.85 / 21.875). Snap each written fraction to its real
 * step so one stack position is one value. Keys are the digits after the dot.
 */
const FRACTION_FIX: Record<string, string> = {
  "8": "875",
  "85": "875",
  "825": "875",
  "9": "875",
  "3": "375",
  "325": "375",
  "35": "375",
  "4": "375",
  "2": "25",
  "26": "25",
  "6": "5",
};

export function normalizeWeightTerm(term: string): number {
  const cleaned = term.trim().replace(",", ".");
  const [whole, fraction] = cleaned.split(".");
  if (fraction === undefined) return Number(whole);
  return Number(`${whole}.${FRACTION_FIX[fraction] ?? fraction}`);
}

/** `weight_kg` is numeric(6,2): 21.875 is stored as 21.88. */
export function roundKg(kg: number): number {
  return Math.round(kg * 100) / 100;
}

/** "25+15+10" → 50, "18.75+ 0.625" → 19.38, "21.85" → 21.88. */
export function parseWeight(text: string): number {
  const sum = text
    .split("+")
    .reduce((total, term) => total + normalizeWeightTerm(term), 0);
  return roundKg(sum);
}
```

- [ ] **Step 5: Run to verify pass**

Run: `npx vitest run src/lib/notes-import/weights.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/notes-import/types.ts src/lib/notes-import/weights.ts src/lib/notes-import/weights.test.ts
git commit -m "feat(import): shared types and weight parsing"
```

---

### Task 4: Set-line grammar

**Files:**
- Create: `src/lib/notes-import/set-line.ts`
- Test: `src/lib/notes-import/set-line.test.ts`

**Interfaces:**
- Consumes: `parseWeight` (Task 3), `RawSet`, `Side`.
- Produces:
  - `type SetLine = { kind: "set"; set: Omit<RawSet, "line"> } | { kind: "unknown-reps"; weightKg: number } | { kind: "bare"; value: number } | { kind: "none" }`
  - `parseSetLine(input: string): SetLine`
  - `parseBodyweightLine(input: string): SetLine`

- [ ] **Step 1: Write the failing tests**

`src/lib/notes-import/set-line.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseBodyweightLine, parseSetLine } from "@/lib/notes-import/set-line";

const plain = {
  weightKg: 80,
  perSideWeightKg: null,
  perSide: false,
  reps: 10,
  uncleanReps: 0,
  isWarmup: false,
  isDropset: false,
  side: null,
  annotation: null,
};

function setOf(line: string) {
  const result = parseSetLine(line);
  if (result.kind !== "set") throw new Error(`${line} did not parse as a set: ${result.kind}`);
  return result.set;
}

describe("parseSetLine", () => {
  it("reads weight/reps", () => {
    expect(parseSetLine("80/10")).toEqual({ kind: "set", set: plain });
  });

  it("tolerates spaces around the slash", () => {
    expect(setOf("50 / 8")).toMatchObject({ weightKg: 50, reps: 8 });
  });

  it.each([
    ["20/10-12", 11],
    ["22/8-9", 8],
    ["40/8-10", 9],
  ])("takes the mean of range %s, rounded down", (line, reps) => {
    expect(setOf(line).reps).toBe(reps);
  });

  it.each([
    ["80/10 _3", 10, 3],
    ["42.5/7_3", 7, 3],
    ["45/4__4", 4, 4],
    ["77.5/12+2", 12, 2],
    ["20/10+5", 10, 5],
    ["40/7-3", 7, 3],
    ["82.5/11.5", 11, 1],
    ["45/12 3halbe", 12, 3],
    ["80/8 (3 -4 half)", 8, 3],
  ])("reads unclean reps in %s", (line, reps, unclean) => {
    const set = setOf(line);
    expect([set.reps, set.uncleanReps]).toEqual([reps, unclean]);
  });

  it.each(["40/5 dropset", "75/8 (dropset)", "75/7 drop", "25/10 drop set"])(
    "marks %s as a dropset",
    (line) => {
      expect(setOf(line)).toMatchObject({ isDropset: true, annotation: null });
    }
  );

  it("marks warm-ups but not 'no warmup'", () => {
    expect(setOf("55/8 warmup")).toMatchObject({ isWarmup: true, annotation: null });
    expect(setOf("50/6 slow (no warmup)")).toMatchObject({
      isWarmup: false,
      annotation: "slow no warmup",
    });
  });

  it.each([
    ["42.5/8 L", "L"],
    ["35/10R", "R"],
    ["5/10l", "L"],
    ["4.2/11 R", "R"],
  ])("reads the side of %s", (line, side) => {
    expect(setOf(line)).toMatchObject({ side, annotation: null });
  });

  it("reads per-side notes", () => {
    expect(setOf("40/12 each side")).toMatchObject({ perSide: true, perSideWeightKg: null, annotation: null });
    expect(setOf("85/12 42.5 each side")).toMatchObject({ weightKg: 85, perSideWeightKg: 42.5 });
    expect(setOf("60/10 (30 each)")).toMatchObject({ perSideWeightKg: 30, annotation: null });
    expect(setOf("40/12_3 (each side)")).toMatchObject({ uncleanReps: 3, perSide: true, annotation: null });
  });

  it("keeps other text as the annotation", () => {
    expect(setOf("22/12 90%").annotation).toBe("90%");
    expect(setOf("142.5/8 (70-80%)")).toMatchObject({ reps: 8, annotation: "70-80%" });
    expect(setOf("75/9 80-90%")).toMatchObject({ reps: 9, annotation: "80-90%" });
  });

  it("normalises separators and sums", () => {
    expect(setOf("40//10")).toMatchObject({ weightKg: 40, reps: 10 });
    expect(setOf("22.5:8")).toMatchObject({ weightKg: 22.5, reps: 8 });
    expect(setOf("25+15+10/8-10 each side")).toMatchObject({ weightKg: 50, reps: 9, perSide: true });
  });

  it("ignores question marks after known reps", () => {
    expect(setOf("70/12?").reps).toBe(12);
    expect(setOf("110/3 ????").reps).toBe(3);
  });

  it.each(["20/?", "22/", "85/???", "28.25/ ?", "80/ underhand"])(
    "reports unknown reps for %s",
    (line) => {
      expect(parseSetLine(line).kind).toBe("unknown-reps");
    }
  );

  it("reports bare numbers", () => {
    expect(parseSetLine("60")).toEqual({ kind: "bare", value: 60 });
    expect(parseSetLine("22.5")).toEqual({ kind: "bare", value: 22.5 });
  });

  it.each(["Row machine", "3 absetzen", "1 1/2 Wochen krank"])("does not read %s", (line) => {
    expect(parseSetLine(line).kind).toBe("none");
  });
});

describe("parseBodyweightLine", () => {
  function bw(line: string) {
    const result = parseBodyweightLine(line);
    return result.kind === "set" ? [result.set.weightKg, result.set.reps, result.set.uncleanReps] : result.kind;
  }

  it.each([
    ["12", [0, 12, 0]],
    ["7_4", [0, 7, 4]],
    ["6_6", [0, 6, 6]],
    ["10 straight leg", [0, 10, 0]],
    ["11 straight", [0, 11, 0]],
    ["6 straight 4", [0, 6, 4]],
    ["7 straight 4 bent", [0, 7, 4]],
    ["Straight 12", [0, 12, 0]],
  ])("%s", (line, expected) => {
    expect(bw(line)).toEqual(expected);
  });

  it.each(["?_3", "Straight / bent", "Straight", "Bent"])("%s has unknown reps", (line) => {
    expect(bw(line)).toBe("unknown-reps");
  });

  it("leaves other lines alone", () => {
    expect(bw("Leg raises")).toBe("none");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/notes-import/set-line.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `set-line.ts`**

```ts
import { parseWeight } from "./weights";
import type { RawSet, Side } from "./types";

export type SetLine =
  | { kind: "set"; set: Omit<RawSet, "line"> }
  | { kind: "unknown-reps"; weightKg: number }
  | { kind: "bare"; value: number }
  | { kind: "none" };

const WEIGHT = String.raw`\d+(?:[.,]\d+)?(?:\s*\+\s*\d+(?:[.,]\d+)?)*`;
const SET_START = new RegExp(String.raw`^(${WEIGHT})\s*/\s*(.*)$`);
// reps, optional "-N" (range, or old-style unclean when N is smaller),
// optional "_N" / "+N" unclean reps, stray "?", then free text.
const REPS = /^(\d+(?:\.\d+)?)(?:\s*-\s*(\d+))?\s*(?:_+\s*(\d+)|\+\s*(\d+))?\s*\?*\s*(.*)$/;
const BARE = /^\d+(?:[.,]\d+)?$/;

type Annotation = {
  text: string | null;
  isWarmup: boolean;
  isDropset: boolean;
  uncleanReps: number;
  perSide: boolean;
  perSideWeightKg: number | null;
  side: Side | null;
};

/** Pulls the known markers out of the text after the reps; what is left is the note. */
export function parseAnnotation(input: string): Annotation {
  let text = ` ${input} `;
  const take = (pattern: RegExp): RegExpExecArray | null => {
    const match = pattern.exec(text);
    if (match) text = text.replace(match[0], " ");
    return match;
  };

  const isDropset = take(/\bdrop\s*set\b|\bdropset\b|\bdrop\b/i) !== null;
  const isWarmup = !/\bno\s+warm-?up\b/i.test(text) && take(/\bwarm-?up\b/i) !== null;

  let uncleanReps = 0;
  const halves = take(/(\d+)\s*halbe\b/i);
  if (halves) uncleanReps += Number(halves[1]);
  const halfRange = take(/\(?\s*(\d+)\s*-\s*(\d+)\s*half\s*\)?/i);
  if (halfRange) uncleanReps += Math.floor((Number(halfRange[1]) + Number(halfRange[2])) / 2);

  const each = take(/\(?\s*(?:(\d+(?:[.,]\d+)?)\s+)?each(?:\s+side)?\s*\)?/i);
  const sideMatch = take(/(?:^|[\s/])([lr])\s*$/i);

  const rest = text.replace(/[()]/g, " ").replace(/\s+/g, " ").trim();
  return {
    text: rest === "" ? null : rest,
    isWarmup,
    isDropset,
    uncleanReps,
    perSide: each !== null,
    perSideWeightKg: each?.[1] ? parseWeight(each[1]) : null,
    side: sideMatch ? (sideMatch[1].toUpperCase() as Side) : null,
  };
}

export function parseSetLine(input: string): SetLine {
  const text = input
    .trim()
    .replace(/\/{2,}/g, "/")
    .replace(/(\d):(\d)/g, "$1/$2");

  const start = SET_START.exec(text);
  if (!start) {
    return BARE.test(text) ? { kind: "bare", value: parseWeight(text) } : { kind: "none" };
  }

  const weightKg = parseWeight(start[1]);
  const reps = REPS.exec(start[2].trim());
  if (!reps) return { kind: "unknown-reps", weightKg };

  const [, first, second, underscore, plus, tail] = reps;
  let clean = Number(first);
  let unclean = Number(underscore ?? plus ?? 0);
  if (second !== undefined) {
    const upper = Number(second);
    // "10-12" is a range; "7-3" is how unclean reps were written before "_3".
    if (upper >= clean) clean = Math.floor((clean + upper) / 2);
    else unclean += upper;
  }
  if (!Number.isInteger(clean)) {
    // "11.5" = 11 clean reps and one half rep.
    clean = Math.floor(clean);
    unclean += 1;
  }
  if (clean < 1) return { kind: "unknown-reps", weightKg };

  const note = parseAnnotation(tail);
  return {
    kind: "set",
    set: {
      weightKg,
      perSideWeightKg: note.perSideWeightKg,
      perSide: note.perSide,
      reps: clean,
      uncleanReps: unclean + note.uncleanReps,
      isWarmup: note.isWarmup,
      isDropset: note.isDropset,
      side: note.side,
      annotation: note.text,
    },
  };
}

function bodyweightSet(reps: number, uncleanReps: number): SetLine {
  return {
    kind: "set",
    set: {
      weightKg: 0,
      perSideWeightKg: null,
      perSide: false,
      reps,
      uncleanReps,
      isWarmup: false,
      isDropset: false,
      side: null,
      annotation: null,
    },
  };
}

/** Leg raises: "7 straight 4 bent" = 7 clean (straight legs) + 4 unclean (bent). */
export function parseBodyweightLine(input: string): SetLine {
  const text = input.trim().toLowerCase();

  let match = /^(\d+)(?:\s*_+\s*(\d+))?$/.exec(text);
  if (match) return bodyweightSet(Number(match[1]), Number(match[2] ?? 0));

  match = /^(\d+)\s+straight(?:\s+leg)?(?:\s+(\d+)(?:\s+bent)?)?$/.exec(text);
  if (match) return bodyweightSet(Number(match[1]), Number(match[2] ?? 0));

  match = /^straight\s+(\d+)$/.exec(text);
  if (match) return bodyweightSet(Number(match[1]), 0);

  if (/^(\?|straight|bent)/.test(text)) return { kind: "unknown-reps", weightKg: 0 };
  return { kind: "none" };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/lib/notes-import/set-line.test.ts`
Expected: PASS. If a case fails, fix the regex in `set-line.ts`, never the expectation — the expectations are the spec.

- [ ] **Step 5: Commit**

```bash
git add src/lib/notes-import/set-line.ts src/lib/notes-import/set-line.test.ts
git commit -m "feat(import): set-line grammar incl. unclean reps, dropsets, sides"
```

---

### Task 5: Dates

**Files:**
- Create: `src/lib/notes-import/dates.ts`
- Test: `src/lib/notes-import/dates.test.ts`

**Interfaces:**
- Consumes: `DayMonth`.
- Produces:
  - `parseDateLine(input: string): { date: DayMonth; rest: string | null } | null`
  - `assignYears(dates: (DayMonth | null)[], startYear: number): (string | null)[]`
  - `fillMissingDates(dates: (string | null)[]): { date: string; estimated: boolean }[]`

- [ ] **Step 1: Write the failing tests**

`src/lib/notes-import/dates.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { assignYears, fillMissingDates, parseDateLine } from "@/lib/notes-import/dates";

describe("parseDateLine", () => {
  it("reads day.month", () => {
    expect(parseDateLine("05.11")).toEqual({ date: { day: 5, month: 11, year: null }, rest: null });
  });

  it("keeps trailing text", () => {
    expect(parseDateLine("07.05 abends")?.rest).toBe("abends");
  });

  it("reads an explicit year and a trailing dot", () => {
    expect(parseDateLine("02.02.2025")?.date).toEqual({ day: 2, month: 2, year: 2025 });
    expect(parseDateLine("04.04.")?.date).toEqual({ day: 4, month: 4, year: null });
  });

  it.each(["22.5", "21.25", "65/8", "28/07", "11.85/11", "17.5/9"])("rejects %s", (line) => {
    expect(parseDateLine(line)).toBeNull();
  });
});

describe("assignYears", () => {
  const dm = (day: number, month: number, year: number | null = null) => ({ day, month, year });

  it("starts at the given year and rolls over at the new year", () => {
    expect(
      assignYears(
        [dm(5, 4), dm(17, 9), dm(23, 12), dm(5, 1), dm(2, 2, 2025), dm(30, 12), dm(3, 1)],
        2024
      )
    ).toEqual([
      "2024-04-05",
      "2024-09-17",
      "2024-12-23",
      "2025-01-05",
      "2025-02-02",
      "2025-12-30",
      "2026-01-03",
    ]);
  });

  it("does not roll over for a day logged out of order", () => {
    expect(assignYears([dm(17, 1), dm(16, 1)], 2025)).toEqual(["2025-01-17", "2025-01-16"]);
  });

  it("passes undated entries through", () => {
    expect(assignYears([dm(1, 3), null, dm(5, 3)], 2025)).toEqual(["2025-03-01", null, "2025-03-05"]);
  });
});

describe("fillMissingDates", () => {
  it("spreads undated workouts evenly between their neighbours", () => {
    expect(fillMissingDates(["2026-07-23", null, null, "2026-07-31"])).toEqual([
      { date: "2026-07-23", estimated: false },
      { date: "2026-07-26", estimated: true },
      { date: "2026-07-28", estimated: true },
      { date: "2026-07-31", estimated: false },
    ]);
  });

  it("works across a month boundary", () => {
    expect(fillMissingDates(["2024-11-27", null, "2024-12-13"])[1]).toEqual({
      date: "2024-12-05",
      estimated: true,
    });
  });

  it("refuses an undated workout without a dated neighbour", () => {
    expect(() => fillMissingDates([null, "2024-12-13"])).toThrow(/neighbour/);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/notes-import/dates.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `dates.ts`**

```ts
import type { DayMonth } from "./types";

// Always two-digit day and month: "22.5" is a weight, not the 22nd of May.
const DATE = /^(\d{2})\.(\d{2})(?!\d)(?:\.(\d{4}))?\.?(?:\s+(.*))?$/;

export function parseDateLine(input: string): { date: DayMonth; rest: string | null } | null {
  const match = DATE.exec(input.trim());
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return {
    date: { day, month, year: match[3] ? Number(match[3]) : null },
    rest: match[4]?.trim() || null,
  };
}

function iso(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * The log never writes a year. It runs forward in time, so the year goes up
 * exactly when the month jumps back by more than half a year (Dec → Jan).
 * A small step back (17.01 then 16.01) is a late entry, not a new year.
 */
export function assignYears(dates: (DayMonth | null)[], startYear: number): (string | null)[] {
  let year = startYear;
  let lastMonth: number | null = null;
  return dates.map((date) => {
    if (!date) return null;
    if (date.year !== null) year = date.year;
    else if (lastMonth !== null && date.month < lastMonth - 6) year += 1;
    lastMonth = date.month;
    return iso(year, date.month, date.day);
  });
}

const DAY_MS = 24 * 60 * 60 * 1000;

function toDayNumber(isoDate: string): number {
  const [y, m, d] = isoDate.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / DAY_MS;
}

function fromDayNumber(day: number): string {
  const date = new Date(day * DAY_MS);
  return iso(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

/** Undated workouts are kept and spread evenly between the dated ones around them. */
export function fillMissingDates(dates: (string | null)[]): { date: string; estimated: boolean }[] {
  const result = dates.map((date) => ({ date: date ?? "", estimated: date === null }));
  let index = 0;
  while (index < dates.length) {
    if (dates[index] !== null) {
      index += 1;
      continue;
    }
    const before = index - 1;
    let after = index;
    while (after < dates.length && dates[after] === null) after += 1;
    const from = before >= 0 ? dates[before] : null;
    const to = after < dates.length ? dates[after] : null;
    if (from === null || to === null) {
      throw new Error(`Undated workout at position ${index} has no dated neighbour on both sides`);
    }
    const start = toDayNumber(from);
    const span = toDayNumber(to) - start;
    const gaps = after - before;
    for (let k = before + 1; k < after; k += 1) {
      result[k].date = fromDayNumber(start + Math.round((span * (k - before)) / gaps));
    }
    index = after;
  }
  return result;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/lib/notes-import/dates.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/notes-import/dates.ts src/lib/notes-import/dates.test.ts
git commit -m "feat(import): date lines, year rollover, estimated dates"
```

---

### Task 6: Exercise mapping

**Files:**
- Create: `src/lib/notes-import/exercise-map.ts`
- Test: `src/lib/notes-import/exercise-map.test.ts`

**Interfaces:**
- Produces:
  - `type ExerciseContext = { header: string; details: string[]; maxWeightKg: number; performedOn: string; perSideNoted: boolean }`
  - `type Resolved = { name: string; attributes: Record<string, string>; halveAbove: number | null }`
  - `resolveExercise(ctx: ExerciseContext): Resolved | null`
  - `isBodyweightHeader(header: string): boolean`
  - `isCardio(line: string): boolean`

- [ ] **Step 1: Write the failing tests**

`src/lib/notes-import/exercise-map.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isBodyweightHeader, isCardio, resolveExercise } from "@/lib/notes-import/exercise-map";

function resolve(header: string, maxWeightKg: number, opts: { details?: string[]; date?: string; perSide?: boolean } = {}) {
  return resolveExercise({
    header,
    details: opts.details ?? [],
    maxWeightKg,
    performedOn: opts.date ?? "2025-03-01",
    perSideNoted: opts.perSide ?? false,
  });
}

describe("resolveExercise", () => {
  it.each([
    // [header, max kg, expected name]
    ["Ab crunches", 85, "Ab crunches machine"],
    ["Abdominal crunch", 82.5, "Ab crunches machine"],
    ["Ab crunches front", 17.5, "Ab crunches freeweight"],
    ["Ab crunch tower", 38, "Ab crunches freeweight"],
    ["Assisted pull ups for", 22.5, "Assisted pull ups"],
    ["Bayesian curls tower front", 11.25, "Bayesian Curls"],
    ["Leg curls für hammies", 75, "Seated leg curls"],
    ["Legcurls", 70, "Seated leg curls"],
    ["Bizepscurls", 45, "Bicep curls machine"],
    ["Bicep curls", 25, "Bicep curls tower"],
    ["Bicep curl tower", 28.75, "Bicep curls tower"],
    ["Bicep curl hinten", 37.5, "Bicep curls free weight"],
    ["Curls machine", 47.5, "Bicep curls machine"],
    ["Hyperextensions", 20, "Hyperextensions"],
    ["Lex Extension", 72.5, "Leg extension"],
    ["Standing leg press / hack squats", 150, "Hack squat"],
    ["Hackssquads", 120, "Hack squat"],
    ["Seated leg press", 140, "Seated leg press"],
    ["Trap bar deadlifts", 120, "Trap bar deadlift"],
    ["Deadlifts", 140, "Deadlift"],
    ["Squats", 80, "Squat"],
    ["Trip overhead", 21.88, "Tri overhead pull"],
    ["Tri press down", 85, "Tri press machine"],
    ["Tri pulldown long rope", 26.25, "Tri pushdown rope"],
    ["Tri pushdown straight metal", 29.38, "Tri pushdown tower"],
    ["Incline smith bench", 60, "Incline smith press"],
    ["Smith sheoulder press", 40, "Smith shoulder press"],
    ["Super inline presss", 22.5, "Super incline press"],
    ["Chest press", 62.5, "Chest press machine"],
    ["Bench press machine", 60, "Chest press machine"],
    ["Machine incline press", 25, "Incline bench machine"],
    ["Incline machine", 60, "Incline bench machine"],
    ["DB incline press", 22, "Incline bench press"],
    ["Incline bench", 26, "Incline bench press"],
    ["Incline bench", 65, "Incline bench press barbell"],
    ["Incline bench press", 60, "Incline bench press barbell"],
    ["Bench incline BB", 65, "Incline bench press barbell"],
    ["Bench press", 75, "Bench Press"],
    ["T bar row", 50, "T-bar row"],
    ["Row high to low machine", 50, "Row machine high to low"],
    ["Row tower lat focus single", 42.5, "Single Lat row tower"],
    ["Lateral row tower", 42.5, "Single Lat row tower"],
    ["Row lateral machine", 85, "Row machine free weight"],
    ["Row front", 47.5, "Row machine free weight"],
    ["Row machine", 87.5, "Row machine"],
    ["Seated row grip", 80, "Row machine"],
    ["Row wide plastic grip", 80, "Row tower"],
    ["Lat pulldown machine front", 45, "Lat pulldown machine"],
    ["Pulldown high to low", 50, "Lat pulldown machine"],
    ["Tower pull-down single grip", 40, "Single Lat pulldown tower"],
    ["Pulldown lateral", 80, "Single Lat pulldown tower"],
    ["Tower pull-down metal", 40, "Single Lat pulldown tower"],
    ["Lat pulldown mid wide grip", 80, "Lat Pulldown"],
    ["Lat raise machine", 45, "Lateral raise"],
    ["Lateral machine", 42.5, "Lateral raise"],
    ["Lateral raise", 6.85, "Single Lateral raise tower"],
    ["Cross body lateral raise", 6.25, "Single Lateral raise tower"],
    ["Shoulder press machine", 45, "Shoulder press machine"],
    ["DB SHoulder press", 22, "DB shoulder press"],
    ["Butterfy", 80, "Butterfly"],
    ["Butterfly high to low", 13.75, "Cable Fly"],
    ["Tower flys high to low", 11.88, "Cable Fly"],
    ["Leg raises ball", 0, "Leg raises"],
  ])("%s at %s kg → %s", (header, kg, name) => {
    expect(resolve(header, kg)?.name).toBe(name);
  });

  it("routes plate-loaded rows by the per-side note", () => {
    expect(resolve("Row machine", 40, { perSide: true })?.name).toBe("Row machine free weight");
    expect(resolve("Lat pulldown lateral", 45, { perSide: true })?.name).toBe("Lat pulldown machine");
  });

  it("sends tricep-range 'lat pulldowns' to the pushdown", () => {
    expect(resolve("Lat pulldown short rope", 28.25)).toMatchObject({ name: "Tri pushdown rope" });
    expect(resolve("Lat pulldown triangle", 31.25)).toMatchObject({
      name: "Tri pushdown tower",
      attributes: { grip: "triangle" },
    });
  });

  it("gives the 2026 pulldown machine its own exercise", () => {
    expect(resolve("Lat pulldown tower", 87, { date: "2026-07-31" })?.name).toBe("Lat Pulldown (neue Maschine)");
    expect(resolve("Lat pulldown tower", 90, { date: "2025-11-04" })?.name).toBe("Lat Pulldown");
  });

  it("maps grips to attributes", () => {
    expect(resolve("Lat pulldown tower close grip", 90)?.attributes).toEqual({ grip: "narrow" });
    expect(resolve("Pulldown tower wide", 80)?.attributes).toEqual({ grip: "wide" });
    expect(resolve("Tri pushdown triangle metal", 32.5)?.attributes).toEqual({ grip: "triangle" });
    expect(resolve("Tri pushdown bent metal", 32.5)?.attributes).toEqual({ grip: "bent" });
  });

  it("marks single-arm incline presses", () => {
    expect(resolve("Incline lateral bench press machine", 50)).toMatchObject({
      name: "Incline bench machine",
      attributes: { arm: "single" },
    });
  });

  it("tells per-side machines when to assume a written total", () => {
    expect(resolve("Incline bench machine", 25)?.halveAbove).toBe(40);
    expect(resolve("Row lateral machine", 85)?.halveAbove).toBe(60);
    expect(resolve("Butterfly", 75)?.halveAbove).toBeNull();
  });

  it("falls back to the detail lines when the header alone says nothing", () => {
    expect(resolve("Lateral back", 80, { details: ["Pulldown"] })?.name).toBe("Single Lat pulldown tower");
  });

  it("returns null for text it does not know", () => {
    expect(resolve("Mit Zoffi", 0)).toBeNull();
  });
});

describe("isBodyweightHeader / isCardio", () => {
  it("knows leg raises", () => {
    expect(isBodyweightHeader("Leg raises ball")).toBe(true);
    expect(isBodyweightHeader("Ball leg pull-ups (idk)")).toBe(true);
    expect(isBodyweightHeader("Leg extension")).toBe(false);
  });

  it("knows the treadmill", () => {
    expect(isCardio("Laufband 25min")).toBe(true);
    expect(isCardio("25min laufband")).toBe(true);
    expect(isCardio("Butterfly")).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/notes-import/exercise-map.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `exercise-map.ts`**

```ts
/**
 * Raw exercise text from the log → one canonical exercise.
 *
 * Rules run top to bottom; the first match wins, so ORDER MATTERS (e.g. "leg
 * curl" before "curl", rows before flys because of "Row tower metal butterfly",
 * triceps before pulldowns because of "Tri pull down"). Names that already
 * exist in the account are reused verbatim — `exercises` is unique on
 * (user_id, name), case-sensitive.
 */

export type ExerciseContext = {
  header: string;
  details: string[];
  /** Heaviest set as written, before any per-side halving. */
  maxWeightKg: number;
  performedOn: string;
  perSideNoted: boolean;
};

export type Resolved = {
  name: string;
  attributes: Record<string, string>;
  /**
   * Per-side machine: a session written WITHOUT "each side" whose heaviest set
   * reaches this weight was written as a total and gets halved. null = not a
   * per-side machine.
   */
  halveAbove: number | null;
};

/** From here on the pulldown and row towers are a different machine (77/87 kg stack). */
const NEW_TOWER_FROM = "2026-06-01";

export function isBodyweightHeader(header: string): boolean {
  return /leg raises|ball leg/i.test(header);
}

export function isCardio(line: string): boolean {
  return /laufband/i.test(line);
}

function plain(name: string, attributes: Record<string, string> = {}): Resolved {
  return { name, attributes, halveAbove: null };
}

function perSide(name: string, halveAbove: number, attributes: Record<string, string> = {}): Resolved {
  return { name, attributes, halveAbove };
}

function gripOf(t: string): Record<string, string> {
  if (/triangle/.test(t)) return { grip: "neutral" };
  if (/close/.test(t)) return { grip: "narrow" };
  if (/wide/.test(t)) return { grip: "wide" };
  return {};
}

function tricepGripOf(t: string): Record<string, string> {
  if (/triangle/.test(t)) return { grip: "triangle" };
  if (/bent/.test(t)) return { grip: "bent" };
  if (/straight/.test(t)) return { grip: "straight" };
  return {};
}

function triceps(t: string, w: number): Resolved {
  if (w >= 80) return plain("Tri press machine");
  if (/overhead/.test(t)) return plain("Tri overhead pull");
  if (/rope|robe/.test(t)) return plain("Tri pushdown rope");
  return plain("Tri pushdown tower", tricepGripOf(t));
}

function match(t: string, ctx: ExerciseContext): Resolved | null {
  const w = ctx.maxWeightKg;
  const newTower = ctx.performedOn >= NEW_TOWER_FROM;

  if (/leg raises|ball leg/.test(t)) return plain("Leg raises", /ball/.test(t) ? { variant: "ball" } : {});
  if (/crunch/.test(t)) return plain(w >= 80 ? "Ab crunches machine" : "Ab crunches freeweight");
  if (/assisted pull/.test(t)) return plain("Assisted pull ups");
  if (/bayesian/.test(t)) return plain("Bayesian Curls");
  if (/leg ?curl|legcurl/.test(t)) return plain("Seated leg curls");
  if (/curl/.test(t)) {
    if (/tower/.test(t)) return plain("Bicep curls tower");
    if (w >= 45) return plain("Bicep curls machine");
    if (w >= 18 && w <= 25) return plain("Bicep curls tower");
    return plain("Bicep curls free weight");
  }
  if (/hyperextension/.test(t)) return plain("Hyperextensions");
  if (/extension/.test(t)) return plain("Leg extension");
  if (/hack\s?s+qua[dt]/.test(t)) return plain("Hack squat");
  if (/leg press/.test(t)) return plain("Seated leg press");
  if (/trap bar/.test(t)) return plain("Trap bar deadlift");
  if (/deadlift/.test(t)) return plain("Deadlift");
  if (/squat/.test(t)) return plain("Squat");
  if (/^tri|tricep/.test(t)) return triceps(t, w);

  if (/smith/.test(t)) return plain(/bench|incline/.test(t) ? "Incline smith press" : "Smith shoulder press");
  if (/super/.test(t)) return perSide("Super incline press", 40);
  if (/chest press|bench press machine/.test(t)) return plain("Chest press machine");
  if (
    /lateral bench press/.test(t) ||
    (/incline|bench/.test(t) && /machine/.test(t)) ||
    (/incline press/.test(t) && !/db/.test(t))
  ) {
    return perSide("Incline bench machine", 40, /lateral/.test(t) ? { arm: "single" } : {});
  }
  if (/incline/.test(t)) {
    if (/db/.test(t)) return plain("Incline bench press");
    if (/bb|barbell/.test(t)) return plain("Incline bench press barbell");
    return plain(w <= 30 ? "Incline bench press" : "Incline bench press barbell");
  }
  if (/bench press/.test(t)) return plain("Bench Press");

  if (/\brow\b/.test(t)) {
    if (/t bar/.test(t)) return plain("T-bar row");
    if (/high to low/.test(t)) return perSide("Row machine high to low", 60);
    if (/single/.test(t) || (/lateral/.test(t) && /tower/.test(t))) return plain("Single Lat row tower");
    if (/lateral|unilateral|free weight|front/.test(t) || ctx.perSideNoted) {
      return perSide("Row machine free weight", 60);
    }
    if (/tower|close|wide|metal|plastic/.test(t)) {
      return plain(newTower ? "Row tower (neue Maschine)" : "Row tower", gripOf(t));
    }
    return plain("Row machine");
  }

  if (/pull ?-?down|pulldown|lap pull/.test(t)) {
    // Tricep-stack weights: these were pushdowns written down as pulldowns.
    if (w < 35) return /rope/.test(t) ? plain("Tri pushdown rope") : plain("Tri pushdown tower", tricepGripOf(t));
    if (/machine|front|high to low/.test(t) || ctx.perSideNoted) return perSide("Lat pulldown machine", 60);
    if (newTower) return plain("Lat Pulldown (neue Maschine)", gripOf(t));
    // "lateral" means single-arm (owner, 2026-09-24).
    if (/single|uni|lateral/.test(t) || w <= 45) return plain("Single Lat pulldown tower");
    return plain("Lat Pulldown", gripOf(t));
  }

  if (/raise|lateral machine/.test(t)) {
    return plain(w < 20 || /cross|single/.test(t) ? "Single Lateral raise tower" : "Lateral raise");
  }
  if (/should/.test(t)) return plain(/machine/.test(t) ? "Shoulder press machine" : "DB shoulder press");
  if (/butterf?l?y/.test(t) && !/high to low/.test(t)) return plain("Butterfly");
  if (/fly|flys|butterfly/.test(t)) return plain("Cable Fly");
  return null;
}

/** The header decides; detail lines are consulted only when it says nothing ("Lateral back" + "Pulldown"). */
export function resolveExercise(ctx: ExerciseContext): Resolved | null {
  const header = ctx.header.toLowerCase();
  return match(header, ctx) ?? match(`${header} ${ctx.details.join(" ").toLowerCase()}`, ctx);
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/lib/notes-import/exercise-map.test.ts`
Expected: PASS. A failure means a rule is mis-ordered — fix the order, not the expectation.

- [ ] **Step 5: Commit**

```bash
git add src/lib/notes-import/exercise-map.ts src/lib/notes-import/exercise-map.test.ts
git commit -m "feat(import): map raw exercise names onto the canonical library"
```

---

### Task 7: Overrides and the log parser

**Files:**
- Create: `src/lib/notes-import/overrides.ts`
- Create: `src/lib/notes-import/parse-log.ts`
- Test: `src/lib/notes-import/parse-log.test.ts`

**Interfaces:**
- Consumes: `parseSetLine`, `parseBodyweightLine` (Task 4), `parseDateLine` (Task 5), `isBodyweightHeader`, `isCardio` (Task 6), types (Task 3).
- Produces:
  - `type Override = { line: number; expect: string } & ({ replace: (string | { header: string })[] } | { note: string } | { drop: string } | { date: string })`
  - `OVERRIDES: Override[]`
  - `parseLog(text: string, overrides?: Override[]): ParsedLog`

- [ ] **Step 1: Write `overrides.ts`**

Only digits, typos and names — no private note text. `expect` guards against the file having changed underneath the table.

```ts
/**
 * Line-numbered corrections for past-sets.md (spec §5.4).
 *
 * Every entry names the exact trimmed text it expects at that line, so an
 * edited log fails loudly instead of silently correcting the wrong line.
 * Replacement lines are parsed like normal lines; `{ header }` forces a new
 * exercise where the log ran two exercises together without a blank line.
 */
export type Override = { line: number; expect: string } & (
  | { replace: (string | { header: string })[] }
  | { note: string }
  | { drop: string }
  | { date: string }
);

const UNKNOWN_REPS = "Wiederholungen unbekannt";

export const OVERRIDES: Override[] = [
  // The first two sessions use "weight x reps x sets" notation.
  { line: 3, expect: "Bizepscurls 45 x 12 x 2 | 42.5x10", replace: [{ header: "Bizepscurls" }, "45/12", "45/12", "42.5/10"] },
  { line: 4, expect: "Legcurls 70x12 x2", replace: [{ header: "Legcurls" }, "70/12", "70/12"] },
  { line: 7, expect: "Incline DB 1x22 2x24 12 /12/10", replace: [{ header: "Incline DB" }, "22/12", "24/12", "24/10"] },
  { line: 8, expect: "Lateral lat pulldown 3x12 35", replace: [{ header: "Lateral lat pulldown" }, "35/12", "35/12", "35/12"] },
  {
    line: 9,
    expect: "Normal machine bicep curls 1x 42.5 x 12 // 1x45 x 9 // 1x45 x 6",
    replace: [{ header: "Normal machine bicep curls" }, "42.5/12", "45/9", "45/6"],
  },
  { line: 153, expect: "40/8-0", replace: ["40/8-10"] },
  { line: 300, expect: "408", replace: ["40/8"] },
  { line: 407, expect: "???", drop: "unklarer Eintrag" },
  { line: 522, expect: "80 (weirde Übersetzung)", drop: UNKNOWN_REPS },
  { line: 581, expect: "7011", replace: ["70/11"] },
  { line: 781, expect: "3 absetzen", note: "3 Wdh. mit Absetzen" },
  { line: 782, expect: "2 ohne", note: "2 Wdh. ohne Absetzen" },
  { line: 986, expect: "10x40 warmup", replace: ["40/10 warmup"] },
  { line: 1070, expect: "5010", replace: ["50/10"] },
  { line: 1680, expect: "21.25/", replace: ["21.25/10"] },
  { line: 1681, expect: "10", drop: "Wiederholungen von Zeile 1680" },
  { line: 1968, expect: "4.2/11/r", replace: ["4.2/11 R"] },
  { line: 2069, expect: "3x5 l r Wechsel", drop: "Gewicht unbekannt" },
  { line: 2103, expect: "17.06", date: "17.07" },
  { line: 2107, expect: "Incline bench press", replace: [{ header: "Incline bench press" }] },
  { line: 2118, expect: "26.25 metal", drop: UNKNOWN_REPS },
  { line: 2162, expect: "28/07", date: "28.07" },
  { line: 2184, expect: "25/7 32.5/7", replace: ["25/7", "32.5/7"] },
  { line: 2678, expect: "80/80", replace: ["80/8"] },
  { line: 2890, expect: "87/5/7_3", replace: ["87.5/7_3"] },
  { line: 3019, expect: "35 dropset 6", replace: ["35/6 dropset"] },
  { line: 3092, expect: "20/10 15/3", replace: ["20/10", "15/3 dropset"] },
  { line: 3093, expect: "20/11 15/4", replace: ["20/11", "15/4 dropset"] },
  { line: 3798, expect: "17/5/9", replace: ["17.5/9"] },
  { line: 3937, expect: "6.25 jeweils", drop: UNKNOWN_REPS },
  { line: 3939, expect: "Assisted pull ups", replace: [{ header: "Assisted pull ups" }] },
  { line: 4089, expect: "3 sets of?", drop: UNKNOWN_REPS },
  { line: 4245, expect: "65/8 lateral L/R", replace: ["65/8 einarmig L+R"] },
  { line: 4296, expect: "28.375/9", replace: ["29.375/9"] },
  { line: 4338, expect: "19.07", date: "19.06" },
  { line: 4373, expect: "80%pp", note: "80%pp" },
];
```

- [ ] **Step 2: Write the failing parser tests**

`src/lib/notes-import/parse-log.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseLog } from "@/lib/notes-import/parse-log";
import type { LineFate } from "@/lib/notes-import/types";

const LOG = [
  "", //                   1
  "05.04", //              2
  "Curls", //              3
  "45/12", //              4
  "", //                   5
  "————", //               6
  "After a break", //      7
  "17.09", //              8
  "Upper Body", //         9
  "", //                   10
  "Row machine", //        11
  "No straps", //          12
  "80/10 _3", //           13
  "80/?", //               14
  "Top grip", //           15
  "80/8", //               16
  "", //                   17
  "Incline bench", //      18
  "", //                   19
  "60/8", //               20
  "Laufband 25min", //     21
  "Leg raises", //         22
  "7 straight 4 bent", //  23
  "Straight / bent", //    24
  "", //                   25
  "Tri overhead pull", //  26
  "80", //                 27
  "———", //                28
  "19.09", //              29
  "3/10 tired", //         30
  "", //                   31
  "Butterfly", //          32
  "75/11", //              33
  "12 weird", //           34
].join("\n");

function fatesOf(fates: LineFate[], line: number) {
  return fates.filter((f) => f.line === line).map((f) => ("reason" in f ? `${f.kind}:${f.reason}` : f.kind));
}

describe("parseLog", () => {
  const { workouts, fates } = parseLog(LOG, []);

  it("splits workouts at separators and dates", () => {
    expect(workouts.map((w) => w.date)).toEqual([
      { day: 5, month: 4, year: null },
      { day: 17, month: 9, year: null },
      { day: 19, month: 9, year: null },
    ]);
  });

  it("collects workout notes and the category before the first exercise", () => {
    expect(workouts[1].notes).toEqual(["After a break", "Laufband 25min"]);
    expect(workouts[1].category).toBe("Upper");
    expect(workouts[2].notes).toEqual(["3/10 tired"]);
  });

  it("keeps text inside an exercise as details", () => {
    const row = workouts[1].exercises[0];
    expect(row.header).toBe("Row machine");
    expect(row.details).toEqual(["No straps", "Top grip"]);
    expect(row.sets.map((s) => [s.weightKg, s.reps, s.uncleanReps])).toEqual([
      [80, 10, 3],
      [80, 8, 0],
    ]);
  });

  it("joins a header separated from its sets by a blank line", () => {
    expect(workouts[1].exercises[1]).toMatchObject({ header: "Incline bench", sets: [{ weightKg: 60, reps: 8 }] });
  });

  it("parses bodyweight sets", () => {
    expect(workouts[1].exercises[2]).toMatchObject({
      header: "Leg raises",
      sets: [{ weightKg: 0, reps: 7, uncleanReps: 4 }],
    });
  });

  it("drops exercises without sets that follow real ones", () => {
    expect(workouts[1].exercises.map((e) => e.header)).toEqual(["Row machine", "Incline bench", "Leg raises"]);
    expect(fatesOf(fates, 26)).toEqual(["dropped:Übung ohne Sätze"]);
  });

  it("gives every line a fate", () => {
    const lines = new Set(fates.map((f) => f.line));
    for (let line = 1; line <= 34; line += 1) expect(lines.has(line), `line ${line}`).toBe(true);
    expect(fatesOf(fates, 14)).toEqual(["dropped:Wiederholungen unbekannt"]);
    expect(fatesOf(fates, 24)).toEqual(["dropped:Wiederholungen unbekannt"]);
    expect(fatesOf(fates, 27)).toEqual(["dropped:Wiederholungen unbekannt"]);
    expect(fatesOf(fates, 21)).toEqual(["cardio"]);
    expect(fatesOf(fates, 9)).toEqual(["category"]);
    expect(fatesOf(fates, 12)).toEqual(["exercise-note"]);
    expect(fatesOf(fates, 6)).toEqual(["separator"]);
    expect(fatesOf(fates, 8)).toEqual(["date"]);
  });

  it("flags digit lines inside an exercise it cannot read", () => {
    expect(fates.find((f) => f.line === 34)).toEqual({ line: 34, kind: "unclassified", text: "12 weird" });
  });
});

describe("parseLog overrides", () => {
  const text = ["05.04", "Curls", "408", "Rows", "80/8", "Butterfly", "70/8", "3 absetzen", "????"].join("\n");

  it("applies replacements, forced headers, notes and drops", () => {
    const { workouts, fates } = parseLog(text, [
      { line: 3, expect: "408", replace: ["40/8"] },
      { line: 6, expect: "Butterfly", replace: [{ header: "Butterfly" }] },
      { line: 8, expect: "3 absetzen", note: "3 Wdh. mit Absetzen" },
      { line: 9, expect: "????", drop: "unklar" },
    ]);
    expect(workouts[0].exercises.map((e) => [e.header, e.details, e.sets.length])).toEqual([
      ["Curls", ["Rows"], 2],
      ["Butterfly", ["3 Wdh. mit Absetzen"], 1],
    ]);
    expect(fatesOf(fates, 9)).toEqual(["dropped:unklar"]);
  });

  it("applies date overrides", () => {
    const { workouts } = parseLog(["28/07", "Curls", "45/10"].join("\n"), [
      { line: 1, expect: "28/07", date: "28.07" },
    ]);
    expect(workouts[0].date).toEqual({ day: 28, month: 7, year: null });
  });

  it("refuses an override whose text does not match", () => {
    expect(() => parseLog(text, [{ line: 3, expect: "409", replace: ["40/9"] }])).toThrow(/expected "409"/);
  });
});
```

Note on the second test: "Rows" directly follows the set "40/8" inside the same paragraph, so it becomes a detail of "Curls" — which is exactly why real run-togethers need a `{ header }` override.

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run src/lib/notes-import/parse-log.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement `parse-log.ts`**

```ts
import { parseDateLine } from "./dates";
import { isBodyweightHeader, isCardio } from "./exercise-map";
import { OVERRIDES, type Override } from "./overrides";
import { parseBodyweightLine, parseSetLine, type SetLine } from "./set-line";
import type { DayMonth, LineFate, ParsedLog, RawSet, RawWorkout } from "./types";

type VLine =
  | { line: number; kind: "text"; text: string }
  | { line: number; kind: "header"; text: string }
  | { line: number; kind: "note"; text: string }
  | { line: number; kind: "drop"; reason: string }
  | { line: number; kind: "date"; text: string }
  /** A date line inside a block: ends the paragraph, carries no fate. */
  | { line: number; kind: "break" };

type Block = { date: DayMonth | null; dateLine: number | null; dateRest: string | null; lines: VLine[]; hasSet: boolean };

type Detail = { line: number; text: string; fated: boolean };
type Draft = { line: number; header: string; details: Detail[]; sets: RawSet[] };

const SEPARATOR = /^[—–\-_][—–\-_\s]+$/;

const CATEGORY_LABELS: Record<string, string> = {
  "upper body": "Upper",
  "lower body workout": "Legs",
  "pull day": "Pull",
  "quick intense push": "Push",
};

function applyOverrides(lines: string[], overrides: Override[]): VLine[] {
  for (const override of overrides) {
    if (override.line > lines.length) {
      throw new Error(`Override for line ${override.line} is past the end of the file`);
    }
  }
  const byLine = new Map(overrides.map((override) => [override.line, override]));

  return lines.flatMap((raw, index): VLine[] => {
    const line = index + 1;
    // U+FFFC is an attachment placeholder the notes app left behind.
    const text = raw.replace(/￼/g, "").trim();
    const override = byLine.get(line);
    if (!override) return [{ line, kind: "text", text }];
    if (text !== override.expect) {
      throw new Error(`Override for line ${line} expected "${override.expect}" but found "${text}"`);
    }
    if ("replace" in override) {
      return override.replace.map((item) =>
        typeof item === "string" ? { line, kind: "text", text: item } : { line, kind: "header", text: item.header }
      );
    }
    if ("note" in override) return [{ line, kind: "note", text: override.note }];
    if ("drop" in override) return [{ line, kind: "drop", reason: override.drop }];
    return [{ line, kind: "date", text: override.date }];
  });
}

function parseAnySet(text: string, current: Draft | null): SetLine {
  if (current && isBodyweightHeader(current.header)) {
    const bodyweight = parseBodyweightLine(text);
    if (bodyweight.kind !== "none") return bodyweight;
  }
  const parsed = parseSetLine(text);
  // A lone number under a weighted exercise is a weight without reps.
  return parsed.kind === "bare" ? { kind: "unknown-reps", weightKg: parsed.value } : parsed;
}

function parseBlock(block: Block, fates: LineFate[]): RawWorkout {
  const notes: { line: number; text: string }[] = [];
  if (block.dateRest && block.dateLine !== null) notes.push({ line: block.dateLine, text: block.dateRest });
  let category: string | null = null;
  const drafts: Draft[] = [];
  let current: Draft | null = null;
  let paragraphStart = true;

  const workoutNote = (line: number, text: string) => {
    notes.push({ line, text });
    fates.push({ line, kind: "workout-note" });
  };

  for (const v of block.lines) {
    if (v.kind === "break") {
      paragraphStart = true;
      continue;
    }
    if (v.kind === "drop") {
      fates.push({ line: v.line, kind: "dropped", reason: v.reason });
      continue;
    }
    if (v.kind === "note") {
      if (current) {
        current.details.push({ line: v.line, text: v.text, fated: true });
        fates.push({ line: v.line, kind: "exercise-note" });
      } else {
        workoutNote(v.line, v.text);
      }
      continue;
    }
    if (v.kind === "header" || v.kind === "date") {
      current = { line: v.line, header: v.text, details: [], sets: [] };
      drafts.push(current);
      paragraphStart = false;
      continue;
    }

    const text = v.text;
    if (text === "") {
      fates.push({ line: v.line, kind: "blank" });
      paragraphStart = true;
      continue;
    }
    if (isCardio(text)) {
      notes.push({ line: v.line, text });
      fates.push({ line: v.line, kind: "cardio" });
      // Cardio closes the exercise above it: the next text line is a new one.
      paragraphStart = true;
      continue;
    }

    const parsed = parseAnySet(text, current);
    if (parsed.kind !== "none") {
      // Before any exercise, a set-shaped line is a remark ("3/10 verkatert").
      if (!current) workoutNote(v.line, text);
      else if (parsed.kind === "set") {
        current.sets.push({ line: v.line, ...parsed.set });
        fates.push({ line: v.line, kind: "set" });
      } else {
        fates.push({ line: v.line, kind: "dropped", reason: "Wiederholungen unbekannt" });
      }
      paragraphStart = false;
      continue;
    }

    if (/^\d/.test(text)) {
      // Digits that are not a set: harmless before the first exercise, an
      // unknown shape inside one — that needs an override, not a guess.
      if (!current) workoutNote(v.line, text);
      else fates.push({ line: v.line, kind: "unclassified", text });
      paragraphStart = false;
      continue;
    }

    if (paragraphStart || !current) {
      current = { line: v.line, header: text, details: [], sets: [] };
      drafts.push(current);
    } else {
      current.details.push({ line: v.line, text, fated: false });
    }
    paragraphStart = false;
  }

  // A set-less "exercise" before the first real one was really a remark or a
  // category label; after it, it is an exercise that was never done.
  const firstWithSets = drafts.findIndex((draft) => draft.sets.length > 0);
  const exercises: RawWorkout["exercises"] = [];
  drafts.forEach((draft, index) => {
    const lines: Detail[] = [{ line: draft.line, text: draft.header, fated: false }, ...draft.details];
    if (draft.sets.length > 0) {
      fates.push({ line: draft.line, kind: "header" });
      for (const detail of draft.details) if (!detail.fated) fates.push({ line: detail.line, kind: "exercise-note" });
      exercises.push({
        line: draft.line,
        header: draft.header,
        details: draft.details.map((detail) => detail.text),
        sets: draft.sets,
      });
    } else if (firstWithSets === -1 || index < firstWithSets) {
      for (const entry of lines) {
        const label = CATEGORY_LABELS[entry.text.toLowerCase()];
        if (label) {
          category = label;
          if (!entry.fated) fates.push({ line: entry.line, kind: "category" });
        } else {
          notes.push({ line: entry.line, text: entry.text });
          if (!entry.fated) fates.push({ line: entry.line, kind: "workout-note" });
        }
      }
    } else {
      for (const entry of lines) {
        if (!entry.fated) fates.push({ line: entry.line, kind: "dropped", reason: "Übung ohne Sätze" });
      }
    }
  });

  const firstLine = block.lines.find((v) => v.kind !== "break")?.line ?? 0;
  return {
    line: block.dateLine ?? firstLine,
    date: block.date,
    notes: notes.sort((a, b) => a.line - b.line).map((note) => note.text),
    category,
    exercises,
  };
}

export function parseLog(text: string, overrides: Override[] = OVERRIDES): ParsedLog {
  const fates: LineFate[] = [];
  const blocks: Block[] = [];
  const fresh = (): Block => ({ date: null, dateLine: null, dateRest: null, lines: [], hasSet: false });
  let block = fresh();

  for (const v of applyOverrides(text.split(/\r?\n/), overrides)) {
    if (v.kind === "text" && v.text !== "" && SEPARATOR.test(v.text)) {
      fates.push({ line: v.line, kind: "separator" });
      blocks.push(block);
      block = fresh();
      continue;
    }

    const date = v.kind === "text" || v.kind === "date" ? parseDateLine(v.text) : null;
    if (v.kind === "date" && !date) throw new Error(`Date override for line ${v.line} is not a date: "${v.text}"`);
    if (date) {
      // A second date, or a date after sets, starts the next workout even
      // without a separator line.
      if (block.date || block.hasSet) {
        blocks.push(block);
        block = fresh();
      }
      block.date = date.date;
      block.dateLine = v.line;
      block.dateRest = date.rest;
      block.lines.push({ line: v.line, kind: "break" });
      fates.push({ line: v.line, kind: "date" });
      continue;
    }

    if (v.kind === "text" && parseSetLine(v.text).kind === "set") block.hasSet = true;
    block.lines.push(v);
  }
  blocks.push(block);

  return { workouts: blocks.map((b) => parseBlock(b, fates)), fates };
}
```

Note: `v.kind === "date"` never reaches `parseBlock` (dates are consumed in `parseLog`), but the branch keeps the switch total for the type checker.

- [ ] **Step 5: Run to verify pass**

Run: `npx vitest run src/lib/notes-import/parse-log.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/notes-import/overrides.ts src/lib/notes-import/parse-log.ts src/lib/notes-import/parse-log.test.ts
git commit -m "feat(import): parse the log into workouts with a fate for every line"
```

---

### Task 8: Build the import model

**Files:**
- Create: `src/lib/notes-import/build-import.ts`
- Test: `src/lib/notes-import/build-import.test.ts`

**Interfaces:**
- Consumes: `parseLog` (Task 7), `assignYears`, `fillMissingDates` (Task 5), `resolveExercise` (Task 6), `roundKg` (Task 3).
- Produces: `buildImport(log: ParsedLog, options: { startYear: number }): ImportResult`, `buildExercise(raw: RawExercise, performedOn: string): ImportExercise`.

- [ ] **Step 1: Write the failing tests**

`src/lib/notes-import/build-import.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildImport } from "@/lib/notes-import/build-import";
import { parseLog } from "@/lib/notes-import/parse-log";

const LOG = [
  "17.09",
  "Incline machine",
  "60/10 (30 each)",
  "60/9",
  "",
  "Incline bench machine",
  "60/12",
  "50/8",
  "———",
  "Row machine",
  "80/10 _3 slow",
  "42.5/8 L",
  "———",
  "21.09",
  "Butterfly",
  "75/10 dropset",
  "———",
  "25.09",
  "Mit Zoffi",
].join("\n");

describe("buildImport", () => {
  const result = buildImport(parseLog(LOG, []), { startYear: 2024 });

  it("dates every workout, estimating the undated one", () => {
    expect(result.workouts.map((w) => [w.performedOn, w.dateEstimated, w.note])).toEqual([
      ["2024-09-17", false, null],
      ["2024-09-19", true, "Datum geschätzt"],
      ["2024-09-21", false, null],
    ]);
  });

  it("drops a workout without sets", () => {
    expect(result.dropped).toEqual([{ line: 18, reason: "Workout ohne Sätze" }]);
  });

  it("converts written totals to per-side weights", () => {
    const [named, assumed] = result.workouts[0].exercises;
    expect(named).toMatchObject({ name: "Incline bench machine", flags: ["umgerechnet"] });
    expect(named.sets.map((s) => s.weightKg)).toEqual([30, 30]);
    expect(named.note).toContain("Gesamtgewicht auf pro Seite umgerechnet");
    expect(assumed).toMatchObject({ flags: ["halbiert"] });
    expect(assumed.sets.map((s) => s.weightKg)).toEqual([30, 25]);
  });

  it("carries unclean reps, annotations and sides into sets and notes", () => {
    const row = result.workouts[1].exercises[0];
    expect(row.name).toBe("Row machine");
    expect(row.sets[0]).toEqual({ weightKg: 80, reps: 10, uncleanReps: 3, isWarmup: false, isDropset: false });
    expect(row.note).toBe("S1: slow · Sätze einzeln L/R");
  });

  it("keeps dropsets", () => {
    expect(result.workouts[2].exercises[0].sets[0].isDropset).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/notes-import/build-import.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `build-import.ts`**

```ts
import { assignYears, fillMissingDates } from "./dates";
import { resolveExercise } from "./exercise-map";
import { roundKg } from "./weights";
import type { ImportExercise, ImportResult, ImportWorkout, ParsedLog, RawExercise } from "./types";

export function buildExercise(raw: RawExercise, performedOn: string): ImportExercise {
  const maxWritten = Math.max(...raw.sets.map((set) => set.weightKg));
  const perSideNoted = raw.sets.some((set) => set.perSide);
  const resolved = resolveExercise({
    header: raw.header,
    details: raw.details,
    maxWeightKg: maxWritten,
    performedOn,
    perSideNoted,
  });
  if (!resolved) throw new Error(`No exercise rule for "${raw.header}" (line ${raw.line})`);

  // "85/12 42.5 each side": this session's plain numbers are totals.
  const writtenAsTotals = raw.sets.some(
    (set) => set.perSideWeightKg !== null && Math.abs(set.weightKg - 2 * set.perSideWeightKg) < 0.01
  );
  // A per-side machine written far above its per-side range, with no note.
  const assumedTotals = !perSideNoted && resolved.halveAbove !== null && maxWritten >= resolved.halveAbove;
  const halve = writtenAsTotals || assumedTotals;

  const sets = raw.sets.map((set) => ({
    weightKg: set.perSideWeightKg ?? (halve ? roundKg(set.weightKg / 2) : set.weightKg),
    reps: set.reps,
    uncleanReps: set.uncleanReps,
    isWarmup: set.isWarmup,
    // The database forbids both flags; a warm-up wins.
    isDropset: set.isDropset && !set.isWarmup,
  }));

  const parts: string[] = [...raw.details];
  raw.sets.forEach((set, index) => {
    if (set.annotation) parts.push(`S${index + 1}: ${set.annotation}`);
  });
  if (raw.sets.some((set) => set.side !== null)) parts.push("Sätze einzeln L/R");
  if (perSideNoted || resolved.halveAbove !== null) parts.push("Gewicht pro Seite");

  const flags: string[] = [];
  if (writtenAsTotals) {
    parts.push("Gesamtgewicht auf pro Seite umgerechnet");
    flags.push("umgerechnet");
  } else if (assumedTotals) {
    parts.push("Gewicht halbiert (vermutlich Gesamtgewicht notiert)");
    flags.push("halbiert");
  }

  return {
    line: raw.line,
    rawHeader: raw.header,
    name: resolved.name,
    attributes: resolved.attributes,
    note: parts.length > 0 ? parts.join(" · ") : null,
    flags,
    sets,
  };
}

export function buildImport(log: ParsedLog, options: { startYear: number }): ImportResult {
  // Years come from ALL dated blocks in file order, dropped ones included —
  // a set-less session still marks where the new year began.
  const isoDates = assignYears(log.workouts.map((workout) => workout.date), options.startYear);
  const kept = log.workouts
    .map((workout, index) => ({ workout, date: isoDates[index] }))
    .filter(({ workout }) => workout.exercises.length > 0);
  const filled = fillMissingDates(kept.map(({ date }) => date));

  const dropped = log.workouts
    .filter((workout) => workout.exercises.length === 0 && (workout.date !== null || workout.notes.length > 0))
    .map((workout) => ({ line: workout.line, reason: "Workout ohne Sätze" }));

  const workouts: ImportWorkout[] = kept.map(({ workout }, index) => {
    const { date, estimated } = filled[index];
    const notes = [...workout.notes, ...(estimated ? ["Datum geschätzt"] : [])];
    return {
      line: workout.line,
      performedOn: date,
      dateEstimated: estimated,
      category: workout.category,
      note: notes.length > 0 ? notes.join(" · ") : null,
      exercises: workout.exercises.map((exercise) => buildExercise(exercise, date)),
    };
  });

  workouts.sort((a, b) => a.performedOn.localeCompare(b.performedOn) || a.line - b.line);
  return { workouts, dropped };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/lib/notes-import/build-import.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/notes-import/build-import.ts src/lib/notes-import/build-import.test.ts
git commit -m "feat(import): dated import model with per-side weight rules"
```

---

### Task 9: SQL and preview emitters

**Files:**
- Create: `src/lib/notes-import/emit-sql.ts`
- Create: `src/lib/notes-import/preview.ts`
- Test: `src/lib/notes-import/emit-sql.test.ts`

**Interfaces:**
- Consumes: `ImportWorkout`, `ImportResult`, `LineFate`, `Override`.
- Produces:
  - `emitImportSql(workouts: ImportWorkout[], options: { userId: string; mode: "dry-run" | "commit" }): string`
  - `emitRollbackSql(options: { userId: string; lastDate: string; generatedAt: string }): string`
  - `renderPreview(input: { result: ImportResult; fates: LineFate[]; lines: string[]; overrides: Override[] }): string`

- [ ] **Step 1: Write the failing tests**

`src/lib/notes-import/emit-sql.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { emitImportSql, emitRollbackSql } from "@/lib/notes-import/emit-sql";
import type { ImportWorkout } from "@/lib/notes-import/types";

const USER = "4458ae8e-cf70-4ba5-8416-e9e7983cf181";

const workouts: ImportWorkout[] = [
  {
    line: 3,
    performedOn: "2024-09-17",
    dateEstimated: false,
    category: "Push",
    note: "it's fine",
    exercises: [
      {
        line: 4,
        rawHeader: "Incline BB",
        name: "Incline bench press barbell",
        attributes: {},
        note: null,
        flags: [],
        sets: [{ weightKg: 50, reps: 9, uncleanReps: 0, isWarmup: false, isDropset: false }],
      },
      {
        line: 9,
        rawHeader: "Lat pulldown wide",
        name: "Lat Pulldown",
        attributes: { grip: "wide" },
        note: null,
        flags: [],
        sets: [{ weightKg: 80, reps: 8, uncleanReps: 2, isWarmup: false, isDropset: true }],
      },
    ],
  },
];

function payloadOf(sql: string) {
  const match = /\$payload\$([\s\S]*)\$payload\$/.exec(sql);
  if (!match) throw new Error("no payload");
  return JSON.parse(match[1]);
}

describe("emitImportSql", () => {
  it("embeds the model as a JSON payload", () => {
    const payload = payloadOf(emitImportSql(workouts, { userId: USER, mode: "commit" }));
    expect(payload.exerciseNames).toEqual(["Incline bench press barbell", "Lat Pulldown"]);
    expect(payload.attributeOptions).toEqual([{ name: "Lat Pulldown", key: "grip", values: ["wide"] }]);
    expect(payload.lastDate).toBe("2024-09-17");
    expect(payload.workouts[0]).toMatchObject({ performedOn: "2024-09-17", category: "Push", note: "it's fine" });
    expect(payload.workouts[0].exercises[1].sets).toEqual([[80, 8, 2, false, true]]);
  });

  it("runs as the owner under RLS", () => {
    const sql = emitImportSql(workouts, { userId: USER, mode: "commit" });
    expect(sql).toContain("set local role authenticated");
    expect(sql).toContain(`'${USER}'`);
  });

  it("aborts the dry run at the end so nothing is kept", () => {
    const sql = emitImportSql(workouts, { userId: USER, mode: "dry-run" });
    expect(sql).toMatch(/raise exception 'NOTES_IMPORT_DRY_RUN_OK/);
  });

  it("refuses to import twice", () => {
    const sql = emitImportSql(workouts, { userId: USER, mode: "commit" });
    expect(sql).toContain("NOTES_IMPORT_ABORT");
    expect(sql).not.toContain("NOTES_IMPORT_DRY_RUN_OK");
  });

  it("rejects a malformed user id", () => {
    expect(() => emitImportSql(workouts, { userId: "x'; drop table sets;--", mode: "commit" })).toThrow(/user id/);
  });

  it("rejects text that would end the payload quote", () => {
    const bad = [{ ...workouts[0], note: "$payload$" }];
    expect(() => emitImportSql(bad, { userId: USER, mode: "commit" })).toThrow(/payload/);
  });
});

describe("emitRollbackSql", () => {
  it("deletes the imported range and the exercises it created", () => {
    const sql = emitRollbackSql({ userId: USER, lastDate: "2026-08-16", generatedAt: "2026-09-25T10:00:00.000Z" });
    expect(sql).toContain("performed_on <= '2026-08-16'");
    expect(sql).toContain("created_at >= '2026-09-25T10:00:00.000Z'");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/notes-import/emit-sql.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `emit-sql.ts`**

```ts
import type { ImportWorkout } from "./types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function assertUserId(userId: string): void {
  if (!UUID.test(userId)) throw new Error(`Not a user id: ${userId}`);
}

/** Runs the block as the owner: RLS then proves every row is theirs. */
function actAs(userId: string): string {
  return `  execute 'set local role authenticated';
  perform set_config('request.jwt.claims',
    json_build_object('sub', '${userId}', 'role', 'authenticated')::text, true);`;
}

function buildPayload(workouts: ImportWorkout[]) {
  const names = [...new Set(workouts.flatMap((w) => w.exercises.map((e) => e.name)))].sort();
  const options = new Map<string, { name: string; key: string; values: Set<string> }>();
  for (const exercise of workouts.flatMap((w) => w.exercises)) {
    for (const [key, value] of Object.entries(exercise.attributes)) {
      const id = `${exercise.name}\u0000${key}`;
      const entry = options.get(id) ?? { name: exercise.name, key, values: new Set<string>() };
      entry.values.add(value);
      options.set(id, entry);
    }
  }
  return {
    lastDate: workouts.map((w) => w.performedOn).sort().at(-1) ?? null,
    exerciseNames: names,
    attributeOptions: [...options.values()].map((o) => ({ name: o.name, key: o.key, values: [...o.values].sort() })),
    workouts: workouts.map((w) => ({
      performedOn: w.performedOn,
      category: w.category,
      note: w.note,
      exercises: w.exercises.map((e) => ({
        name: e.name,
        note: e.note,
        attributes: e.attributes,
        sets: e.sets.map((s) => [s.weightKg, s.reps, s.uncleanReps, s.isWarmup, s.isDropset]),
      })),
    })),
  };
}

/**
 * One DO block = one transaction: everything lands or nothing does.
 * dry-run ends in `raise exception`, which rolls the whole block back after
 * reporting the counts (same pattern as supabase/checks/dashboard_views.sql).
 */
export function emitImportSql(
  workouts: ImportWorkout[],
  options: { userId: string; mode: "dry-run" | "commit" }
): string {
  assertUserId(options.userId);
  const payload = buildPayload(workouts);
  if (!payload.lastDate || !ISO_DATE.test(payload.lastDate)) throw new Error("Nothing to import");
  const json = JSON.stringify(payload);
  if (json.includes("$payload$")) throw new Error("Import text contains the payload quote tag");

  const finish =
    options.mode === "dry-run"
      ? `  raise exception 'NOTES_IMPORT_DRY_RUN_OK workouts=% exercises=% sets=% new_exercise_names=%',
    n_workouts, n_exercises, n_sets, n_new_names;`
      : `  raise notice 'NOTES_IMPORT_DONE workouts=% exercises=% sets=% new_exercise_names=%',
    n_workouts, n_exercises, n_sets, n_new_names;`;

  const guard =
    options.mode === "commit"
      ? `  if exists (select 1 from workouts where user_id = me and performed_on <= (payload->>'lastDate')::date) then
    raise exception 'NOTES_IMPORT_ABORT: workouts up to % already exist', payload->>'lastDate';
  end if;
`
      : "";

  return `-- Notes-file import (${options.mode}). Generated by scripts/notes-import.ts — do not commit.
do $import$
declare
  me constant uuid := '${options.userId}';
  payload constant jsonb := $payload$${json}$payload$;
  w jsonb;
  x jsonb;
  s jsonb;
  v_workout uuid;
  v_workout_exercise uuid;
  v_exercise uuid;
  stamp timestamptz;
  exercise_position int;
  set_position int;
  n_workouts int := 0;
  n_exercises int := 0;
  n_sets int := 0;
  n_new_names int := 0;
begin
${actAs(options.userId)}

${guard}
  with inserted as (
    insert into exercises (user_id, name)
    select me, name from jsonb_array_elements_text(payload->'exerciseNames') as t(name)
    on conflict (user_id, name) do nothing
    returning 1
  )
  select count(*) into n_new_names from inserted;

  for w in select * from jsonb_array_elements(payload->'workouts') loop
    -- Noon Berlin time: a stable, plausible created_at on the right day.
    stamp := ((w->>'performedOn')::date + time '12:00') at time zone 'Europe/Berlin';
    insert into workouts (user_id, performed_on, category, note, created_at)
    values (me, (w->>'performedOn')::date, w->>'category', w->>'note', stamp)
    returning id into v_workout;
    n_workouts := n_workouts + 1;

    exercise_position := 0;
    for x in select * from jsonb_array_elements(w->'exercises') loop
      select id into strict v_exercise from exercises where user_id = me and name = x->>'name';
      insert into workout_exercises (workout_id, exercise_id, position, note, attributes, created_at)
      values (v_workout, v_exercise, exercise_position, x->>'note', x->'attributes',
              stamp + make_interval(secs => exercise_position))
      returning id into v_workout_exercise;
      n_exercises := n_exercises + 1;

      set_position := 0;
      for s in select * from jsonb_array_elements(x->'sets') loop
        insert into sets (workout_exercise_id, position, weight_kg, reps, unclean_reps,
                          is_warmup, is_dropset, created_at)
        values (v_workout_exercise, set_position, (s->>0)::numeric, (s->>1)::int, (s->>2)::int,
                (s->>3)::boolean, (s->>4)::boolean, stamp);
        set_position := set_position + 1;
        n_sets := n_sets + 1;
      end loop;
      exercise_position := exercise_position + 1;
    end loop;
  end loop;

  -- Selectable variations: union what the import used into each exercise.
  for x in select * from jsonb_array_elements(payload->'attributeOptions') loop
    update exercises e
       set attribute_options = e.attribute_options || jsonb_build_object(
             x->>'key',
             (select jsonb_agg(distinct v order by v)
                from jsonb_array_elements_text(
                       coalesce(e.attribute_options->(x->>'key'), '[]'::jsonb) || (x->'values')) as t(v)))
     where e.user_id = me and e.name = x->>'name';
  end loop;

  -- The insert trigger stamped every imported exercise "picked now", which
  -- would float two-year-old exercises to the top of the picker. Recompute
  -- from the rows, exactly like the backfill in 20260915203912.
  update exercises e
     set last_picked_at = picked.last_picked_at
    from (select exercise_id, max(created_at) as last_picked_at
            from workout_exercises group by exercise_id) picked
   where picked.exercise_id = e.id and e.user_id = me;

${finish}
end
$import$;
`;
}

export function emitRollbackSql(options: { userId: string; lastDate: string; generatedAt: string }): string {
  assertUserId(options.userId);
  if (!ISO_DATE.test(options.lastDate)) throw new Error(`Not a date: ${options.lastDate}`);
  if (Number.isNaN(Date.parse(options.generatedAt))) throw new Error(`Not a timestamp: ${options.generatedAt}`);

  return `-- Undo the notes-file import. App data starts 2026-08-19, the log ends ${options.lastDate}.
do $rollback$
declare
  me constant uuid := '${options.userId}';
begin
${actAs(options.userId)}

  delete from workouts where user_id = me and performed_on <= '${options.lastDate}';

  -- Only exercises the import created (after generation) and nothing uses now.
  delete from exercises e
   where e.user_id = me
     and e.created_at >= '${options.generatedAt}'
     and not exists (select 1 from workout_exercises we where we.exercise_id = e.id);

  update exercises e
     set last_picked_at = (select max(we.created_at) from workout_exercises we where we.exercise_id = e.id)
   where e.user_id = me;
end
$rollback$;
`;
}
```

- [ ] **Step 4: Implement `preview.ts`**

```ts
import type { Override } from "./overrides";
import type { ImportResult, ImportSet, LineFate } from "./types";

function esc(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function kg(value: number): string {
  return String(value).replace(".", ",");
}

export function formatImportSet(set: ImportSet): string {
  let text = `${kg(set.weightKg)} × ${set.reps}`;
  if (set.uncleanReps > 0) text += ` +${set.uncleanReps}`;
  if (set.isWarmup) text += " (W)";
  if (set.isDropset) text += " (D)";
  return text;
}

function overrideTarget(override: Override): string {
  if ("replace" in override) {
    return override.replace.map((item) => (typeof item === "string" ? item : `[Übung] ${item.header}`)).join(" | ");
  }
  if ("note" in override) return `Notiz: ${override.note}`;
  if ("drop" in override) return `weggelassen: ${override.drop}`;
  return `Datum: ${override.date}`;
}

/** A local review page — the owner approves THIS before any SQL runs. */
export function renderPreview(input: {
  result: ImportResult;
  fates: LineFate[];
  lines: string[];
  overrides: Override[];
}): string {
  const { result, fates, lines, overrides } = input;
  const pairs = result.workouts.flatMap((workout) => workout.exercises.map((exercise) => ({ workout, exercise })));
  const setCount = pairs.reduce((total, { exercise }) => total + exercise.sets.length, 0);

  const byName = new Map<string, { sessions: number; min: number; max: number; headers: Set<string> }>();
  for (const { exercise } of pairs) {
    const entry = byName.get(exercise.name) ?? { sessions: 0, min: Infinity, max: -Infinity, headers: new Set<string>() };
    entry.sessions += 1;
    for (const set of exercise.sets) {
      entry.min = Math.min(entry.min, set.weightKg);
      entry.max = Math.max(entry.max, set.weightKg);
    }
    entry.headers.add(exercise.rawHeader);
    byName.set(exercise.name, entry);
  }

  const dropped = [
    ...fates.flatMap((fate) => (fate.kind === "dropped" ? [{ line: fate.line, reason: fate.reason }] : [])),
    ...result.dropped,
  ].sort((a, b) => a.line - b.line);

  const text = (line: number) => esc((lines[line - 1] ?? "").trim());
  const first = result.workouts[0]?.performedOn ?? "–";
  const last = result.workouts.at(-1)?.performedOn ?? "–";

  const exerciseRows = [...byName.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(
      ([name, e]) =>
        `<tr><td>${esc(name)}</td><td>${e.sessions}</td><td>${kg(e.min)}–${kg(e.max)} kg</td><td>${[...e.headers]
          .map(esc)
          .join("<br>")}</td></tr>`
    )
    .join("");

  const flaggedRows = pairs
    .filter(({ exercise }) => exercise.flags.length > 0)
    .map(
      ({ workout, exercise }) =>
        `<tr><td>${workout.performedOn}</td><td>${esc(exercise.name)}</td><td>${esc(exercise.rawHeader)} (Z. ${exercise.line})</td><td>${esc(exercise.flags.join(", "))}</td><td>${exercise.sets.map(formatImportSet).join(" · ")}</td></tr>`
    )
    .join("");

  const estimatedRows = result.workouts
    .filter((workout) => workout.dateEstimated)
    .map((workout) => `<li>${workout.performedOn} (Z. ${workout.line})</li>`)
    .join("");

  const overrideRows = overrides
    .map((o) => `<tr><td>${o.line}</td><td><code>${esc(o.expect)}</code></td><td>${esc(overrideTarget(o))}</td></tr>`)
    .join("");

  const droppedRows = dropped
    .map((d) => `<tr><td>${d.line}</td><td><code>${text(d.line)}</code></td><td>${esc(d.reason)}</td></tr>`)
    .join("");

  const workoutBlocks = result.workouts
    .map((workout) => {
      const head = [workout.performedOn, workout.category, workout.note].filter(Boolean).map((part) => esc(String(part))).join(" · ");
      const body = workout.exercises
        .map((exercise) => {
          const attrs = Object.entries(exercise.attributes).map(([k, v]) => `${k}: ${v}`).join(", ");
          return `<li><b>${esc(exercise.name)}</b>${attrs ? ` <small>(${esc(attrs)})</small>` : ""} — ${exercise.sets
            .map(formatImportSet)
            .join(" · ")}${exercise.note ? `<br><small>${esc(exercise.note)}</small>` : ""}</li>`;
        })
        .join("");
      return `<section><h3>${head}</h3><ul>${body}</ul></section>`;
    })
    .join("");

  return `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><title>Import-Vorschau</title>
<style>
  body { font: 14px/1.45 system-ui, sans-serif; margin: 24px; color: #1a1a1a; background: #fff; }
  table { border-collapse: collapse; margin: 8px 0 24px; }
  td, th { border: 1px solid #ddd; padding: 4px 8px; vertical-align: top; text-align: left; }
  h3 { margin: 16px 0 4px; font-size: 14px; }
  small { color: #666; }
  code { background: #f4f4f4; padding: 0 3px; }
</style></head><body>
<h1>Import-Vorschau</h1>
<p><b>${result.workouts.length}</b> Workouts · <b>${pairs.length}</b> Übungseinträge · <b>${setCount}</b> Sätze · <b>${byName.size}</b> Übungen · ${first} bis ${last}</p>
<h2>Übungen</h2>
<table><tr><th>Übung</th><th>Einheiten</th><th>Gewichte</th><th>Rohnamen</th></tr>${exerciseRows}</table>
<h2>Bitte prüfen: umgerechnete Gewichte</h2>
<table><tr><th>Datum</th><th>Übung</th><th>Roh</th><th>Markierung</th><th>Sätze</th></tr>${flaggedRows}</table>
<h2>Geschätzte Daten</h2><ul>${estimatedRows}</ul>
<h2>Korrekturen (overrides.ts)</h2>
<table><tr><th>Zeile</th><th>Original</th><th>Wird zu</th></tr>${overrideRows}</table>
<h2>Weggelassen</h2>
<table><tr><th>Zeile</th><th>Text</th><th>Grund</th></tr>${droppedRows}</table>
<h2>Alle Workouts</h2>
${workoutBlocks}
</body></html>
`;
}
```

- [ ] **Step 5: Run to verify pass**

Run: `npx vitest run src/lib/notes-import/emit-sql.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/notes-import/emit-sql.ts src/lib/notes-import/preview.ts src/lib/notes-import/emit-sql.test.ts
git commit -m "feat(import): emit transactional import/rollback SQL and a review page"
```

---

### Task 10: Runner, real-file run, preview checkpoint

**Files:**
- Create: `scripts/notes-import.ts`
- Modify: `package.json` (dev dependency `tsx`)
- Modify (as needed): `src/lib/notes-import/overrides.ts`, `src/lib/notes-import/exercise-map.ts`

**Interfaces:**
- Consumes: `parseLog`, `OVERRIDES`, `buildImport`, `emitImportSql`, `emitRollbackSql`, `renderPreview`.
- Produces (outside the repo, in `$OUT`): `preview.html`, `dry-run.sql`, `import.sql`, `rollback.sql`.

- [ ] **Step 1: Add `tsx`**

Run: `npm install --save-dev tsx`
Expected: `tsx` appears under `devDependencies`.

- [ ] **Step 2: Write the runner**

`scripts/notes-import.ts`:

```ts
/**
 * Notes-file import runner (spec: docs/superpowers/specs/2026-09-24-notes-import-design.md §6).
 *
 *   npx tsx scripts/notes-import.ts <past-sets.md> <out-dir> <user-uuid>
 *
 * Writes preview.html, dry-run.sql, import.sql and rollback.sql to <out-dir>.
 * <out-dir> must be OUTSIDE the repo: every output contains the private log.
 * Exits non-zero, writing nothing, if any line is unclassified or uncovered.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { buildImport } from "../src/lib/notes-import/build-import";
import { emitImportSql, emitRollbackSql } from "../src/lib/notes-import/emit-sql";
import { OVERRIDES } from "../src/lib/notes-import/overrides";
import { parseLog } from "../src/lib/notes-import/parse-log";
import { renderPreview } from "../src/lib/notes-import/preview";

const [input, outDir, userId] = process.argv.slice(2);
if (!input || !outDir || !userId) {
  console.error("Usage: npx tsx scripts/notes-import.ts <past-sets.md> <out-dir> <user-uuid>");
  process.exit(1);
}
if (resolve(outDir).startsWith(process.cwd())) {
  console.error("Refusing to write inside the repo — the outputs contain the private log.");
  process.exit(1);
}

const text = readFileSync(input, "utf8");
const lines = text.split(/\r?\n/);
const log = parseLog(text, OVERRIDES);

const covered = new Set(log.fates.map((fate) => fate.line));
const uncovered = lines.map((_, index) => index + 1).filter((line) => !covered.has(line));
const unclassified = log.fates.filter((fate) => fate.kind === "unclassified");
if (uncovered.length > 0 || unclassified.length > 0) {
  for (const line of uncovered) console.error(`uncovered   ${line}: ${lines[line - 1]}`);
  for (const fate of unclassified) console.error(`unclassified ${fate.line}: ${lines[fate.line - 1]}`);
  process.exit(1);
}

const result = buildImport(log, { startYear: 2024 });
const lastDate = result.workouts.at(-1)?.performedOn;
if (!lastDate) {
  console.error("Nothing to import.");
  process.exit(1);
}
const generatedAt = new Date().toISOString();

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "preview.html"), renderPreview({ result, fates: log.fates, lines, overrides: OVERRIDES }));
writeFileSync(join(outDir, "dry-run.sql"), emitImportSql(result.workouts, { userId, mode: "dry-run" }));
writeFileSync(join(outDir, "import.sql"), emitImportSql(result.workouts, { userId, mode: "commit" }));
writeFileSync(join(outDir, "rollback.sql"), emitRollbackSql({ userId, lastDate, generatedAt }));

const exercises = result.workouts.flatMap((workout) => workout.exercises);
console.log(
  `workouts=${result.workouts.length} exercises=${exercises.length} ` +
    `sets=${exercises.reduce((total, exercise) => total + exercise.sets.length, 0)} ` +
    `names=${new Set(exercises.map((exercise) => exercise.name)).size} ` +
    `range=${result.workouts[0].performedOn}..${lastDate}`
);
```

- [ ] **Step 3: Run it against the real file**

```bash
OUT=/private/tmp/claude-501/-Users-dominikeisert---coding-claude-claude-projects-gym-tracking-app/5fa79859-1c40-4b48-8e44-14b10f9dfd32/scratchpad/notes-import
npx tsx scripts/notes-import.ts past-sets.md "$OUT" 4458ae8e-cf70-4ba5-8416-e9e7983cf181
```

(If the session's scratchpad path differs, use the current scratchpad; never a path inside the repo.)

Expected: one summary line, roughly `workouts≈150 … range=2024-04-05..2026-08-16`.

- [ ] **Step 4: Resolve every failure at its source**

For each `uncovered`/`unclassified` line or `No exercise rule for …` error:
- a one-off shape or typo → add an entry to `OVERRIDES` (exact trimmed `expect` text; digits/typos only, no private note text);
- a recurring shape → extend the grammar in `set-line.ts` **and** add a synthetic test case to `set-line.test.ts` first;
- an unmapped exercise name → add a rule to `exercise-map.ts` **and** a row to the `it.each` table in `exercise-map.test.ts` first.

Re-run Step 3 until it prints the summary. Then run `npm run test` — all PASS.

- [ ] **Step 5: Sanity-check the output**

Open `$OUT/preview.html` and check:
- the date range is 2024-04-05 … 2026-08-16, and no workout is on or after 2026-08-19;
- the „Übungen“ table uses the 21 existing names verbatim where they apply, and no name is a near-duplicate of another;
- every row under „Bitte prüfen“ is plausible (halved machine weights land in the usual per-side range);
- „Weggelassen“ lists only unknown-rep sets, set-less exercises/workouts and the override drops.

- [ ] **Step 6: Commit the code (never the outputs)**

```bash
git status --short   # must show no preview/SQL files and no past-sets.md
git add package.json package-lock.json scripts/notes-import.ts src/lib/notes-import
git commit -m "feat(import): runner that turns the log into a preview and SQL"
```

- [ ] **Step 7: CHECKPOINT — owner reviews the preview**

Send `$OUT/preview.html` to the owner (SendUserFile, `display: "render"`), with the summary line, and ask explicitly for approval of the mapping and the flagged weights. **Stop here.** Apply requested changes (overrides/mapping + tests), regenerate, and ask again. Continue to Task 11 only after an explicit „ja/passt“.

---

### Task 11: Dry run, import, verification

**Files:** none in the repo (reads `$OUT/*.sql`).

- [ ] **Step 1: Confirm the target is untouched**

`execute_sql`:

```sql
select count(*) as history, min(performed_on), max(performed_on)
  from workouts
 where user_id = '4458ae8e-cf70-4ba5-8416-e9e7983cf181' and performed_on <= '2026-08-16';
```

Expected: `history = 0`.

- [ ] **Step 2: Dry run**

Run the contents of `$OUT/dry-run.sql` with `execute_sql`.
Expected: an error `NOTES_IMPORT_DRY_RUN_OK workouts=… exercises=… sets=… new_exercise_names=…` whose first three counts equal the runner's summary line. Any other error: stop, fix, regenerate, go back to Task 10 Step 5.

Re-run Step 1: still `history = 0` (the dry run left nothing behind).

- [ ] **Step 3: Keep the rollback at hand**

Confirm `$OUT/rollback.sql` exists and names `performed_on <= '2026-08-16'`. Do not run it.

- [ ] **Step 4: Import**

Tell the owner the import is starting, then run `$OUT/import.sql` with `execute_sql`.
Expected: success (the notice may not be shown).

- [ ] **Step 5: Verify in the database**

```sql
select
  (select count(*) from workouts
    where user_id = '4458ae8e-cf70-4ba5-8416-e9e7983cf181' and performed_on <= '2026-08-16') as workouts,
  (select count(*) from workout_exercises we join workouts w on w.id = we.workout_id
    where w.user_id = '4458ae8e-cf70-4ba5-8416-e9e7983cf181' and w.performed_on <= '2026-08-16') as exercises,
  (select count(*) from sets s join workout_exercises we on we.id = s.workout_exercise_id
     join workouts w on w.id = we.workout_id
    where w.user_id = '4458ae8e-cf70-4ba5-8416-e9e7983cf181' and w.performed_on <= '2026-08-16') as sets,
  (select count(*) from sets s join workout_exercises we on we.id = s.workout_exercise_id
     join workouts w on w.id = we.workout_id
    where w.user_id = '4458ae8e-cf70-4ba5-8416-e9e7983cf181' and s.unclean_reps > 0) as unclean_sets,
  (select count(*) from sets s join workout_exercises we on we.id = s.workout_exercise_id
     join workouts w on w.id = we.workout_id
    where w.user_id = '4458ae8e-cf70-4ba5-8416-e9e7983cf181' and s.is_dropset) as dropsets;
```

Expected: counts equal the runner's summary; `unclean_sets` ≈ 80+, `dropsets` ≈ 40.

```sql
select name, last_picked_at from exercises
 where user_id = '4458ae8e-cf70-4ba5-8416-e9e7983cf181'
 order by last_picked_at desc nulls last limit 5;
```

Expected: the top entries are exercises used since 2026-08-19, not import dates.

- [ ] **Step 6: Verify in the app**

Start the dev server (preview_start; add a `.claude/launch.json` entry for `npm run dev` on port 3000 if none exists — it talks to the same database). The owner is signed in already or signs in themselves; never enter credentials. Check:
- the history list reaches back to 2024-04-05;
- one workout with unclean reps and dropsets (e.g. an early-2025 lateral raise session) shows „+3 unsauber“ / „Dropset“ beneath the sets;
- the dashboard renders records and the heatmap without errors (`read_console_messages` clean).

Take a screenshot as proof.

- [ ] **Step 7: Report**

Tell the owner the counts and share the screenshot. Note: production shows the imported data now; the „+3 unsauber“ line appears there after the release.

---

### Task 12: Finish the branch

**Files:**
- Modify: `docs/superpowers/specs/2026-09-24-notes-import-design.md` (status line)
- Modify: `FEATURE_BACKLOG.md` (mark #2 done)

- [ ] **Step 1: Full local gate**

Run: `npm run lint && npm run test && npm run build`
Expected: all clean.

- [ ] **Step 2: Mark the work done in the docs**

Spec status line → `**Status:** implemented 2026-09-xx; import run on 2026-09-xx (counts: …)` with the real date and counts. In `FEATURE_BACKLOG.md` mark row #2 „Notes-file import“ as done with a pointer to the spec.

- [ ] **Step 3: Commit and push**

```bash
git add docs/superpowers/specs/2026-09-24-notes-import-design.md FEATURE_BACKLOG.md
git commit -m "docs: record the notes-file import as done"
git push
```

The branch's PR against `staging` (#19) picks the commits up. Update its description: what changed, that the migration and the data are already live in the shared database, and the rollback route.
