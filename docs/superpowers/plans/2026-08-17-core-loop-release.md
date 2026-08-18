# GymTrack Core-Loop Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Get GymTrack onto a production URL, then make the core workout workflow clickable there — start a workout, pick an exercise, log sets, see last session's numbers while logging.

**Architecture:** Next.js App Router. Reads go through typed functions in `src/lib/data/` using the server Supabase client under RLS; writes go through server actions in `src/app/workout/actions.ts`, one per operation, each saving immediately. Pure logic (ghost values, formatting, validation) lives in `src/lib/` with no DB or React dependency — that is the only layer with unit tests. The set row is a client component using `useOptimistic` so a logged set appears instantly and retries on failure.

**Tech Stack:** Next.js 16.3.1 (App Router, TypeScript), React 19.2.8, Tailwind CSS v4, shadcn/ui (`base-nova` style, Base UI primitives), Supabase (`@supabase/ssr`), Zod, Vitest, Vercel.

**Spec:** `docs/superpowers/specs/2026-08-17-core-loop-release-design.md` — read it before Task 3. It is the binding authority; this plan argues from it.

## Global Constraints

- **Read the shipped Next.js docs before writing code.** `AGENTS.md` warns that this Next.js version differs from training data. The relevant guides live in `node_modules/next/dist/docs/01-app/` — specifically `02-guides/server-actions.md`, `02-guides/forms.md`, `03-api-reference/04-functions/revalidatePath.md`, and `03-api-reference/03-file-conventions/dynamic-routes.md`. Verified facts you can rely on: dynamic-route `params` is a **Promise** and must be awaited; `revalidatePath(path, type?)` needs the `type` argument only for route *patterns*, not literal paths; Next.js dispatches server actions **sequentially per client**, so never `Promise.all` them from the browser.
- Env var names exactly: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Never commit `.env.local`. The `service_role` key is never used, stored, or pasted anywhere.
- Weight is stored in kg as `numeric(6,2)`; `weight_kg = 0` means bodyweight. kg-only UI. **PostgREST may return `numeric` columns as strings** — always pass them through `Number()` when mapping query results.
- All UI copy in German, informal "du" (`DESIGN_SYSTEM.md` §7). Numbers as `80 × 8`, weights with a comma (`82,5 kg`), dates short (`12. Aug`).
- Visual language per `DESIGN_SYSTEM.md`: dark-only token set already in `globals.css`, lime (`--primary`) reserved for actions and progress, tap targets ≥ 44px, base font size never below 16px, single column `max-w-md` centred.
- Branch flow: commit on `staging`. `main` is never committed to directly — it only ever fast-forwards from `staging`. Task 2 and Task 11 are the only tasks that touch `main`.
- Node ≥ 20, npm as package manager.
- Tasks 1, 2, and 11 contain steps only **Dominik** can perform (Vercel dashboard, pushing shared branches, phone verification). An agent executing this plan stops at those tasks and hands over.

---

### Task 1: Vercel project and preview deployment (manual — Dominik)

Supersedes Task 7 Steps 1–3 of `docs/superpowers/plans/2026-08-17-prototype-foundation.md`, which were never executed.

**Files:** none in-repo. Vercel is zero-config for Next.js; no `vercel.json`.

**Interfaces:**
- Consumes: GitHub repo `deisert/gym-tracking-app` (branches `staging`, `main`), Supabase URL and anon key.
- Produces: a Vercel project where every push to `staging` builds a Preview and `main` builds Production; a verified preview URL.

- [ ] **Step 1: Verify the branch builds locally first**

```bash
npm install && npm run build
```
Expected: exits 0, "Compiled successfully". Do not create the Vercel project against a branch that does not build.

- [ ] **Step 2: Create the Vercel project**

Vercel Dashboard → **Add New → Project** → import `deisert/gym-tracking-app`. Framework preset: **Next.js** (auto-detected). Root directory: `./`. Production branch: `main` (default). If more than one team/scope exists, confirm which one before creating.

Do **not** deploy yet if Vercel offers to — set the environment variables first (Step 3), otherwise the first build produces a runtime-broken deployment.

- [ ] **Step 3: Set the environment variables**

Project → **Settings → Environment Variables**, environment **All Environments** (Production, Preview, Development):

| Name | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://dctoccqancfuwtfbjjyg.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | the `sb_publishable_…` key from Supabase → Project Settings → API |

Both are `NEXT_PUBLIC_`, so both end up in the client bundle by design. Neither is a secret; the `service_role` key is, and it goes nowhere near this project.

- [ ] **Step 4: Check Deployment Protection**

Project → **Settings → Deployment Protection**. If **Vercel Authentication** is enabled for Preview deployments, the preview URL will demand a Vercel login on the phone and Step 6 will look like a broken app.

Either disable protection for Preview deployments, or accept it and verify on Production only (Task 2 Step 3). Write down which you chose — Task 11 repeats this verification.

- [ ] **Step 5: Trigger the preview deployment**

```bash
git push origin staging
```
Expected: Vercel starts a Preview build. Wait for status **READY** in the dashboard. A failed build here is almost always a missing env var (Step 3).

- [ ] **Step 6: Verify the preview**

```bash
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" https://<preview-domain>/
```
Expected: `307 https://<preview-domain>/login` — the middleware gates the home route.

Then open the preview URL in a browser and log in with the test user. Expected: the home page shows "Angemeldet als Dominik". This proves env vars, Supabase reachability from Vercel's runtime, and cookie-based auth across a real domain all work.

---

### Task 2: Production deployment and `v0.1-foundation` tag (manual — Dominik)

Supersedes Task 7 Steps 4–5 and Task 8 of the foundation plan.

**Files:** none.

**Interfaces:**
- Consumes: the verified preview from Task 1.
- Produces: a live production URL; the tag `v0.1-foundation`; `main` == `staging`.

- [ ] **Step 1: Fast-forward `main` and push**

```bash
git checkout main && git merge --ff-only staging && git push origin main && git checkout staging
```
Expected: `--ff-only` succeeds. If it refuses, `main` has commits `staging` lacks — stop and resolve that before pushing; do not use a merge commit.

- [ ] **Step 2: Wait for the production build**

Vercel Dashboard → Deployments. Expected: a Production deployment reaches **READY** on the project's `.vercel.app` domain.

- [ ] **Step 3: Verify production**

```bash
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" https://<production-domain>/
```
Expected: `307 https://<production-domain>/login`.

Then, **on the phone** — the target device for this app — open the production URL and log in with the test user. Expected: "Angemeldet als Dominik". Check that the dark theme renders and text is legible at arm's length.

- [ ] **Step 4: Confirm RLS still locks anonymous access**

```bash
curl -s "https://dctoccqancfuwtfbjjyg.supabase.co/rest/v1/exercises?select=name" \
  -H "apikey: <SUPABASE_ANON_KEY>" -H "Authorization: Bearer <SUPABASE_ANON_KEY>"
```
Expected: `[]` — the table exists but RLS returns no rows without a user session. Seeded rows appearing here is a failure that must be fixed before continuing.

- [ ] **Step 5: Tag the milestone**

```bash
git tag -a v0.1-foundation -m "Auth + schema + deploy working end-to-end" && git push origin v0.1-foundation
```

---

### Task 3: Vitest and the pure logic layer

**Files:**
- Create: `vitest.config.mts`, `src/lib/types.ts`, `src/lib/sets.ts`, `src/lib/dates.ts`
- Test: `src/lib/sets.test.ts`, `src/lib/dates.test.ts`
- Modify: `package.json` (devDependencies + `test` scripts)

**Interfaces:**
- Consumes: nothing.
- Produces: the shared types every later task imports (`SetRecord`, `LastPerformance`, `ExerciseOption`, `WorkoutSummary`, `WorkoutExerciseDetail`, `WorkoutDetail`); `ghostForPosition(last, index)`, `formatSetSummary(sets)`, `formatWeight(kg)`, `nextPosition(items)` from `@/lib/sets`; `localDateString(date)`, `startOfWeekMonday(date)`, `formatPerformedOn(isoDate)`, `todayInAppTimezone()` from `@/lib/dates`.

- [ ] **Step 1: Install Vitest**

```bash
npm install -D vitest vite-tsconfig-paths
```

No `jsdom`, no Testing Library: this release unit-tests pure functions only (spec §10). Adding a DOM environment now would be unused weight.

- [ ] **Step 2: Create `vitest.config.mts`**

```ts
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
```

`vite-tsconfig-paths` is what makes the `@/*` alias from `tsconfig.json` resolve inside tests.

- [ ] **Step 3: Add the test scripts to `package.json`**

In the `"scripts"` block, alongside the existing entries:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: Create `src/lib/types.ts`**

```ts
/** A logged set. `weight_kg` is always a number here — PostgREST may hand
 *  back `numeric` columns as strings, so the data layer converts on the way in. */
export type SetRecord = {
  id: string;
  position: number;
  weight_kg: number;
  reps: number;
  is_warmup: boolean;
};

/** The most recent session of one exercise, used for ghost values. */
export type LastPerformance = {
  workoutId: string;
  performedOn: string; // "YYYY-MM-DD"
  sets: SetRecord[];
} | null;

export type ExerciseOption = {
  id: string;
  name: string;
  note: string | null;
};

export type WorkoutSummary = {
  id: string;
  performed_on: string;
  category: string | null;
  note: string | null;
  exerciseCount: number;
  setCount: number;
};

export type WorkoutExerciseDetail = {
  id: string;
  position: number;
  note: string | null;
  exercise: { id: string; name: string };
  sets: SetRecord[];
};

export type WorkoutDetail = {
  id: string;
  performed_on: string;
  category: string | null;
  note: string | null;
  exercises: WorkoutExerciseDetail[];
};
```

- [ ] **Step 5: Write the failing tests for `src/lib/sets.ts`**

Create `src/lib/sets.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  formatSetSummary,
  formatWeight,
  ghostForPosition,
  nextPosition,
} from "@/lib/sets";
import type { LastPerformance, SetRecord } from "@/lib/types";

function set(position: number, weight_kg: number, reps: number, is_warmup = false): SetRecord {
  return { id: `s${position}`, position, weight_kg, reps, is_warmup };
}

const lastSession: LastPerformance = {
  workoutId: "w1",
  performedOn: "2026-08-12",
  sets: [set(0, 80, 8), set(1, 80, 8), set(2, 82.5, 6)],
};

describe("ghostForPosition", () => {
  it("returns the set at the same index", () => {
    expect(ghostForPosition(lastSession, 0)).toEqual({ weight_kg: 80, reps: 8 });
    expect(ghostForPosition(lastSession, 2)).toEqual({ weight_kg: 82.5, reps: 6 });
  });

  it("falls back to the last set when this session goes deeper", () => {
    expect(ghostForPosition(lastSession, 5)).toEqual({ weight_kg: 82.5, reps: 6 });
  });

  it("returns null without a last performance", () => {
    expect(ghostForPosition(null, 0)).toBeNull();
  });

  it("returns null when the last performance has no sets", () => {
    expect(ghostForPosition({ workoutId: "w1", performedOn: "2026-08-12", sets: [] }, 0)).toBeNull();
  });

  it("maps by index over all sets, warm-ups included", () => {
    const withWarmup: LastPerformance = {
      workoutId: "w1",
      performedOn: "2026-08-12",
      sets: [set(0, 40, 10, true), set(1, 80, 8)],
    };
    expect(ghostForPosition(withWarmup, 0)).toEqual({ weight_kg: 40, reps: 10 });
    expect(ghostForPosition(withWarmup, 1)).toEqual({ weight_kg: 80, reps: 8 });
  });

  it("ignores the stored order of the input array", () => {
    const shuffled: LastPerformance = {
      workoutId: "w1",
      performedOn: "2026-08-12",
      sets: [set(2, 82.5, 6), set(0, 80, 8), set(1, 80, 8)],
    };
    expect(ghostForPosition(shuffled, 0)).toEqual({ weight_kg: 80, reps: 8 });
  });
});

describe("formatWeight", () => {
  it("uses a German decimal comma", () => {
    expect(formatWeight(82.5)).toBe("82,5");
  });

  it("drops trailing zeros", () => {
    expect(formatWeight(80)).toBe("80");
    expect(formatWeight(80.0)).toBe("80");
  });

  it("renders bodyweight as 0", () => {
    expect(formatWeight(0)).toBe("0");
  });
});

describe("formatSetSummary", () => {
  it("joins working sets with a middle dot", () => {
    expect(formatSetSummary(lastSession.sets)).toBe("80 × 8 · 80 × 8 · 82,5 × 6");
  });

  it("excludes warm-up sets", () => {
    expect(formatSetSummary([set(0, 40, 10, true), set(1, 80, 8)])).toBe("80 × 8");
  });

  it("returns an empty string when there are no working sets", () => {
    expect(formatSetSummary([set(0, 40, 10, true)])).toBe("");
    expect(formatSetSummary([])).toBe("");
  });
});

describe("nextPosition", () => {
  it("starts at 0", () => {
    expect(nextPosition([])).toBe(0);
  });

  it("continues after the highest existing position", () => {
    expect(nextPosition([{ position: 0 }, { position: 2 }])).toBe(3);
  });
});
```

- [ ] **Step 6: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Failed to resolve import "@/lib/sets"`.

- [ ] **Step 7: Write `src/lib/sets.ts`**

```ts
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
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS, `src/lib/sets.test.ts` green.

- [ ] **Step 9: Write the failing tests for `src/lib/dates.ts`**

Create `src/lib/dates.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { formatPerformedOn, localDateString, startOfWeekMonday } from "@/lib/dates";

describe("localDateString", () => {
  it("formats a local date without shifting through UTC", () => {
    // 23:30 local on 17 Aug must stay 17 Aug, even though it is 18 Aug in UTC
    // for timezones east of Greenwich.
    expect(localDateString(new Date(2026, 7, 17, 23, 30))).toBe("2026-08-17");
  });

  it("zero-pads month and day", () => {
    expect(localDateString(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});

describe("startOfWeekMonday", () => {
  it("returns the same day for a Monday", () => {
    expect(startOfWeekMonday(new Date(2026, 7, 17))).toBe("2026-08-17"); // Monday
  });

  it("walks back to Monday from a Sunday", () => {
    expect(startOfWeekMonday(new Date(2026, 7, 23))).toBe("2026-08-17"); // Sunday
  });

  it("crosses a month boundary", () => {
    expect(startOfWeekMonday(new Date(2026, 8, 2))).toBe("2026-08-31"); // Wed 2 Sep
  });
});

describe("formatPerformedOn", () => {
  it("renders a short German date", () => {
    expect(formatPerformedOn("2026-08-12")).toBe("12. Aug");
  });

  it("strips the leading zero from the day", () => {
    expect(formatPerformedOn("2026-03-05")).toBe("5. Mär");
  });
});
```

- [ ] **Step 10: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Failed to resolve import "@/lib/dates"`.

- [ ] **Step 11: Write `src/lib/dates.ts`**

```ts
/** The app's reference timezone for server-side "today" (single German user). */
const APP_TIMEZONE = "Europe/Berlin";

const MONTHS_DE = [
  "Jan", "Feb", "Mär", "Apr", "Mai", "Jun",
  "Jul", "Aug", "Sep", "Okt", "Nov", "Dez",
];

/** "YYYY-MM-DD" from a Date's LOCAL fields — never via toISOString(), which is UTC. */
export function localDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** The Monday of the week containing `date`, as "YYYY-MM-DD". */
export function startOfWeekMonday(date: Date): string {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const daysSinceMonday = (copy.getDay() + 6) % 7; // Sunday(0) -> 6, Monday(1) -> 0
  copy.setDate(copy.getDate() - daysSinceMonday);
  return localDateString(copy);
}

/** Today in the app timezone, for server components that have no client clock. */
export function todayInAppTimezone(now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD, which is exactly the shape we store.
  return new Intl.DateTimeFormat("en-CA", { timeZone: APP_TIMEZONE }).format(now);
}

/** "2026-08-12" -> "12. Aug". Parsed by hand so no timezone can shift the day. */
export function formatPerformedOn(isoDate: string): string {
  const [, month, day] = isoDate.split("-");
  return `${Number(day)}. ${MONTHS_DE[Number(month) - 1]}`;
}
```

- [ ] **Step 12: Run the full suite and the build**

Run: `npm test && npm run build`
Expected: all tests PASS; build exits 0.

- [ ] **Step 13: Commit**

```bash
git add package.json package-lock.json vitest.config.mts src/lib
git commit -m "feat: add Vitest and the pure set/date logic layer"
```

---

### Task 4: Input validation schemas

**Files:**
- Create: `src/lib/validation.ts`, `src/lib/validation.test.ts`
- Modify: `package.json` (dependency `zod`)

**Interfaces:**
- Consumes: nothing.
- Produces: `setInputSchema`, `exerciseNameSchema`, `workoutMetaSchema` and the inferred types `SetInput`, `WorkoutMeta` from `@/lib/validation`. Task 6's server actions validate every input through these.

Schemas carry no custom messages: German user-facing copy is produced at the action boundary in Task 6, which keeps the schemas free of Zod version-specific error APIs.

- [ ] **Step 1: Install Zod**

```bash
npm install zod
```

- [ ] **Step 2: Write the failing tests**

Create `src/lib/validation.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { exerciseNameSchema, setInputSchema, workoutMetaSchema } from "@/lib/validation";

describe("setInputSchema", () => {
  it("accepts a normal working set", () => {
    expect(setInputSchema.safeParse({ weight_kg: 82.5, reps: 6, is_warmup: false }).success).toBe(true);
  });

  it("accepts 0 kg as bodyweight", () => {
    expect(setInputSchema.safeParse({ weight_kg: 0, reps: 12, is_warmup: false }).success).toBe(true);
  });

  it("rejects negative weight", () => {
    expect(setInputSchema.safeParse({ weight_kg: -1, reps: 5, is_warmup: false }).success).toBe(false);
  });

  it("rejects weight above the numeric(6,2) ceiling", () => {
    expect(setInputSchema.safeParse({ weight_kg: 10000, reps: 5, is_warmup: false }).success).toBe(false);
    expect(setInputSchema.safeParse({ weight_kg: 9999.99, reps: 5, is_warmup: false }).success).toBe(true);
  });

  it("rejects more than two decimal places", () => {
    expect(setInputSchema.safeParse({ weight_kg: 80.125, reps: 5, is_warmup: false }).success).toBe(false);
  });

  it("accepts two decimal places that float arithmetic handles badly", () => {
    expect(setInputSchema.safeParse({ weight_kg: 0.07, reps: 5, is_warmup: false }).success).toBe(true);
  });

  it("rejects zero or fractional reps", () => {
    expect(setInputSchema.safeParse({ weight_kg: 80, reps: 0, is_warmup: false }).success).toBe(false);
    expect(setInputSchema.safeParse({ weight_kg: 80, reps: 5.5, is_warmup: false }).success).toBe(false);
  });

  it("rejects NaN weight, which is what an empty input parses to", () => {
    expect(setInputSchema.safeParse({ weight_kg: NaN, reps: 5, is_warmup: false }).success).toBe(false);
  });
});

describe("exerciseNameSchema", () => {
  it("trims surrounding whitespace", () => {
    expect(exerciseNameSchema.parse("  Bankdrücken  ")).toBe("Bankdrücken");
  });

  it("rejects an empty or whitespace-only name", () => {
    expect(exerciseNameSchema.safeParse("").success).toBe(false);
    expect(exerciseNameSchema.safeParse("   ").success).toBe(false);
  });

  it("rejects names longer than 80 characters", () => {
    expect(exerciseNameSchema.safeParse("x".repeat(81)).success).toBe(false);
  });
});

describe("workoutMetaSchema", () => {
  it("accepts a full set of fields", () => {
    const result = workoutMetaSchema.safeParse({
      performed_on: "2026-08-17",
      category: "Push",
      note: "gut gelaufen",
    });
    expect(result.success).toBe(true);
  });

  it("accepts null category and note", () => {
    expect(
      workoutMetaSchema.safeParse({ performed_on: "2026-08-17", category: null, note: null }).success
    ).toBe(true);
  });

  it("rejects a malformed date", () => {
    expect(
      workoutMetaSchema.safeParse({ performed_on: "17.08.2026", category: null, note: null }).success
    ).toBe(false);
  });

  it("rejects an impossible date", () => {
    expect(
      workoutMetaSchema.safeParse({ performed_on: "2026-13-01", category: null, note: null }).success
    ).toBe(false);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Failed to resolve import "@/lib/validation"`.

- [ ] **Step 4: Write `src/lib/validation.ts`**

```ts
import { z } from "zod";

/** True when `n` has at most two decimal places, tolerant of float representation. */
function hasAtMostTwoDecimals(n: number): boolean {
  return Math.abs(n * 100 - Math.round(n * 100)) < 1e-9;
}

/** Matches "YYYY-MM-DD" AND checks the date actually exists. */
function isRealIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export const setInputSchema = z.object({
  // 0 means bodyweight; 9999.99 is the numeric(6,2) ceiling from the migration.
  weight_kg: z.number().min(0).max(9999.99).refine(hasAtMostTwoDecimals),
  reps: z.number().int().min(1).max(1000),
  is_warmup: z.boolean(),
});
export type SetInput = z.infer<typeof setInputSchema>;

export const exerciseNameSchema = z.string().trim().min(1).max(80);

export const workoutMetaSchema = z.object({
  performed_on: z.string().refine(isRealIsoDate),
  category: z.string().trim().max(40).nullable(),
  note: z.string().trim().max(2000).nullable(),
});
export type WorkoutMeta = z.infer<typeof workoutMetaSchema>;
```

`z.number()` rejects `NaN` on its own, which is what an emptied number input produces — the test pins that behaviour so a later refactor cannot lose it.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS, all three suites green.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/lib/validation.ts src/lib/validation.test.ts
git commit -m "feat: add Zod input validation schemas"
```

---

### Task 5: Data access layer

**Files:**
- Create: `src/lib/data/workouts.ts`, `src/lib/data/exercises.ts`

**Interfaces:**
- Consumes: `createServerSupabase()` from `@/lib/supabase/server`; the types from `@/lib/types`.
- Produces: `getWorkoutDetail(workoutId)`, `listRecentWorkouts(limit)`, `countWorkoutsSince(weekStart)` from `@/lib/data/workouts`; `searchExercises(query)`, `getLastPerformances(exerciseIds, beforeDate, excludeWorkoutId)` from `@/lib/data/exercises`.

The spec calls the third function `countWorkoutsThisWeek(weekStart)`. It is named `countWorkoutsSince(sinceDate)` here because that is what it does — the caller decides that "since" means this week's Monday, and the function has no notion of weeks.

These functions read only. Every one runs under RLS, so no function filters by `user_id` itself — the policies do it. They are not unit-tested (spec §10): they are thin query wrappers, and a test database does not exist yet. Verification is typecheck plus build, with behaviour covered by the Task 11 acceptance run.

- [ ] **Step 1: Write `src/lib/data/workouts.ts`**

```ts
import type {
  SetRecord,
  WorkoutDetail,
  WorkoutExerciseDetail,
  WorkoutSummary,
} from "@/lib/types";
import { createServerSupabase } from "@/lib/supabase/server";

/** Shape PostgREST returns for the nested select below. `numeric` may arrive as a string. */
type RawSet = {
  id: string;
  position: number;
  weight_kg: number | string;
  reps: number;
  is_warmup: boolean;
};

type RawWorkoutExercise = {
  id: string;
  position: number;
  note: string | null;
  exercises: { id: string; name: string } | null;
  sets: RawSet[] | null;
};

type RawWorkout = {
  id: string;
  performed_on: string;
  category: string | null;
  note: string | null;
  workout_exercises: RawWorkoutExercise[] | null;
};

function toSetRecord(raw: RawSet): SetRecord {
  return {
    id: raw.id,
    position: raw.position,
    weight_kg: Number(raw.weight_kg),
    reps: raw.reps,
    is_warmup: raw.is_warmup,
  };
}

export async function getWorkoutDetail(workoutId: string): Promise<WorkoutDetail | null> {
  const supabase = await createServerSupabase();

  const { data, error } = await supabase
    .from("workouts")
    .select(
      `id, performed_on, category, note,
       workout_exercises (
         id, position, note,
         exercises ( id, name ),
         sets ( id, position, weight_kg, reps, is_warmup )
       )`
    )
    .eq("id", workoutId)
    .maybeSingle();

  if (error || !data) return null;

  const raw = data as unknown as RawWorkout;

  const exercises: WorkoutExerciseDetail[] = (raw.workout_exercises ?? [])
    // An exercise row can only be null if the join broke; skip rather than crash.
    .filter((we) => we.exercises !== null)
    .map((we) => ({
      id: we.id,
      position: we.position,
      note: we.note,
      exercise: { id: we.exercises!.id, name: we.exercises!.name },
      sets: (we.sets ?? []).map(toSetRecord).sort((a, b) => a.position - b.position),
    }))
    .sort((a, b) => a.position - b.position);

  return {
    id: raw.id,
    performed_on: raw.performed_on,
    category: raw.category,
    note: raw.note,
    exercises,
  };
}

export async function listRecentWorkouts(limit: number): Promise<WorkoutSummary[]> {
  const supabase = await createServerSupabase();

  const { data, error } = await supabase
    .from("workouts")
    .select(
      `id, performed_on, category, note,
       workout_exercises ( id, sets ( id ) )`
    )
    .order("performed_on", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error || !data) return [];

  return (data as unknown as RawWorkout[]).map((w) => {
    const exercises = w.workout_exercises ?? [];
    return {
      id: w.id,
      performed_on: w.performed_on,
      category: w.category,
      note: w.note,
      exerciseCount: exercises.length,
      setCount: exercises.reduce((total, we) => total + (we.sets?.length ?? 0), 0),
    };
  });
}

/** Number of workouts performed on or after `sinceDate` ("YYYY-MM-DD"). */
export async function countWorkoutsSince(sinceDate: string): Promise<number> {
  const supabase = await createServerSupabase();

  const { count, error } = await supabase
    .from("workouts")
    .select("id", { count: "exact", head: true })
    .gte("performed_on", sinceDate);

  if (error) return 0;
  return count ?? 0;
}
```

- [ ] **Step 2: Write `src/lib/data/exercises.ts`**

```ts
import type { ExerciseOption, LastPerformance, SetRecord } from "@/lib/types";
import { createServerSupabase } from "@/lib/supabase/server";

type RawSet = {
  id: string;
  position: number;
  weight_kg: number | string;
  reps: number;
  is_warmup: boolean;
};

function toSetRecord(raw: RawSet): SetRecord {
  return {
    id: raw.id,
    position: raw.position,
    weight_kg: Number(raw.weight_kg),
    reps: raw.reps,
    is_warmup: raw.is_warmup,
  };
}

/**
 * Non-archived exercises matching `query`, most recently used first.
 *
 * Recency is computed in JS rather than SQL: this is a single-user library of
 * tens of rows, and a view or RPC would be more machinery than the ordering is
 * worth. Revisit if the library ever grows past a few hundred exercises.
 */
export async function searchExercises(query: string): Promise<ExerciseOption[]> {
  const supabase = await createServerSupabase();

  const trimmed = query.trim();

  let exerciseQuery = supabase
    .from("exercises")
    .select("id, name, note")
    .eq("is_archived", false);

  if (trimmed.length > 0) {
    exerciseQuery = exerciseQuery.ilike("name", `%${trimmed}%`);
  }

  const [{ data: exercises }, { data: usage }] = await Promise.all([
    exerciseQuery.order("name", { ascending: true }),
    supabase
      .from("workout_exercises")
      .select("exercise_id, created_at")
      .order("created_at", { ascending: false })
      .limit(200),
  ]);

  if (!exercises) return [];

  // First occurrence wins because `usage` is already newest-first.
  const lastUsedAt = new Map<string, string>();
  for (const row of usage ?? []) {
    if (!lastUsedAt.has(row.exercise_id)) lastUsedAt.set(row.exercise_id, row.created_at);
  }

  return [...exercises].sort((a, b) => {
    const usedA = lastUsedAt.get(a.id);
    const usedB = lastUsedAt.get(b.id);
    if (usedA && usedB) return usedA < usedB ? 1 : -1;
    if (usedA) return -1;
    if (usedB) return 1;
    return a.name.localeCompare(b.name, "de");
  });
}

/**
 * The last session of each requested exercise, for ghost values.
 *
 * "Last" means: the newest workout by `performed_on` that is not later than
 * `beforeDate` and is not `excludeWorkoutId` — so a backdated workout never
 * shows numbers from the future.
 */
export async function getLastPerformances(
  exerciseIds: string[],
  beforeDate: string,
  excludeWorkoutId: string
): Promise<Map<string, LastPerformance>> {
  const result = new Map<string, LastPerformance>();
  if (exerciseIds.length === 0) return result;

  const supabase = await createServerSupabase();

  const { data, error } = await supabase
    .from("workout_exercises")
    .select(
      `id, exercise_id, workout_id,
       workouts!inner ( id, performed_on ),
       sets ( id, position, weight_kg, reps, is_warmup )`
    )
    .in("exercise_id", exerciseIds)
    .neq("workout_id", excludeWorkoutId)
    .lte("workouts.performed_on", beforeDate);

  if (error || !data) return result;

  type Row = {
    exercise_id: string;
    workouts: { id: string; performed_on: string } | null;
    sets: RawSet[] | null;
  };

  // Pick the newest row per exercise in JS: the candidate set is one user's
  // history for a handful of exercises, so sorting here beats a window function.
  for (const row of data as unknown as Row[]) {
    if (!row.workouts) continue;
    if (!row.sets || row.sets.length === 0) continue; // an exercise with no sets is no comparison

    const current = result.get(row.exercise_id);
    if (current && current.performedOn >= row.workouts.performed_on) continue;

    result.set(row.exercise_id, {
      workoutId: row.workouts.id,
      performedOn: row.workouts.performed_on,
      sets: row.sets.map(toSetRecord).sort((a, b) => a.position - b.position),
    });
  }

  return result;
}
```

- [ ] **Step 3: Verify types and build**

```bash
npx tsc --noEmit && npm run build
```
Expected: both exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/lib/data
git commit -m "feat: add typed Supabase read layer"
```

---

### Task 6: Server actions

**Files:**
- Create: `src/app/workout/actions.ts`

**Interfaces:**
- Consumes: `createServerSupabase()`; schemas from `@/lib/validation`; `nextPosition` from `@/lib/sets`; `todayInAppTimezone` from `@/lib/dates`; types from `@/lib/types`.
- Produces, all from `@/app/workout/actions`:
  - `type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string }`
  - `startWorkout(localDate: string): Promise<never>` — redirects, never returns
  - `updateWorkoutMeta(workoutId: string, meta: unknown): Promise<ActionResult<null>>`
  - `addExerciseToWorkout(workoutId: string, exerciseId: string): Promise<ActionResult<string>>` — returns the new `workout_exercise` id
  - `removeWorkoutExercise(workoutId: string, workoutExerciseId: string): Promise<ActionResult<null>>`
  - `findOrCreateExercise(name: string): Promise<ActionResult<ExerciseOption>>`
  - `addSet(workoutId: string, workoutExerciseId: string, input: unknown): Promise<ActionResult<SetRecord>>`
  - `updateSet(workoutId: string, setId: string, input: unknown): Promise<ActionResult<SetRecord>>`
  - `deleteSet(workoutId: string, setId: string): Promise<ActionResult<null>>`
  - `searchExercisesAction(query: string): Promise<ExerciseOption[]>` — the picker's only way to reach the server-only read layer

Every mutating action takes `workoutId` so it can call `revalidatePath` on the literal path — no route pattern, no `type` argument.

The spec's action list also includes `deleteWorkout`. It is **not** built here: no screen in this release calls it, and an unreachable destructive action is the kind of thing that rots. It arrives with the screen that needs it.

- [ ] **Step 1: Read the server actions guide**

Read `node_modules/next/dist/docs/01-app/02-guides/server-actions.md`. Two points bind this task: `redirect()` throws a control-flow exception, so it must never sit inside a `try` block; and the framework treats every action as an untrusted public endpoint, so each one authenticates rather than trusting that a page rendered the form.

- [ ] **Step 2: Write `src/app/workout/actions.ts`**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { searchExercises } from "@/lib/data/exercises";
import { todayInAppTimezone } from "@/lib/dates";
import { nextPosition } from "@/lib/sets";
import { createServerSupabase } from "@/lib/supabase/server";
import type { ExerciseOption, SetRecord } from "@/lib/types";
import {
  exerciseNameSchema,
  setInputSchema,
  workoutMetaSchema,
} from "@/lib/validation";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

const SAVE_FAILED = "Speichern fehlgeschlagen – wird automatisch wiederholt.";
const NOT_SIGNED_IN = "Nicht angemeldet.";

type RawSet = {
  id: string;
  position: number;
  weight_kg: number | string;
  reps: number;
  is_warmup: boolean;
};

const SET_COLUMNS = "id, position, weight_kg, reps, is_warmup";

function toSetRecord(raw: RawSet): SetRecord {
  return {
    id: raw.id,
    position: raw.position,
    weight_kg: Number(raw.weight_kg),
    reps: raw.reps,
    is_warmup: raw.is_warmup,
  };
}

/**
 * Creates a workout dated by the CLIENT's local date and opens it.
 *
 * The date comes from the browser because Postgres `current_date` is UTC: a
 * 23:30 CEST session would otherwise be filed under the next day.
 */
export async function startWorkout(localDate: string): Promise<never> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const parsed = workoutMetaSchema.shape.performed_on.safeParse(localDate);
  const performed_on = parsed.success ? parsed.data : todayInAppTimezone();

  const { data, error } = await supabase
    .from("workouts")
    .insert({ user_id: user.id, performed_on })
    .select("id")
    .single();

  if (error || !data) redirect("/?error=start");

  revalidatePath("/");
  redirect(`/workout/${data.id}`);
}

export async function updateWorkoutMeta(
  workoutId: string,
  meta: unknown
): Promise<ActionResult<null>> {
  const parsed = workoutMetaSchema.safeParse(meta);
  if (!parsed.success) {
    return { ok: false, error: "Ungültige Angaben – prüfe Datum, Kategorie und Notiz." };
  }

  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from("workouts")
    .update({
      performed_on: parsed.data.performed_on,
      category: parsed.data.category || null,
      note: parsed.data.note || null,
    })
    .eq("id", workoutId);

  if (error) return { ok: false, error: SAVE_FAILED };

  revalidatePath(`/workout/${workoutId}`);
  revalidatePath("/");
  return { ok: true, data: null };
}

export async function addExerciseToWorkout(
  workoutId: string,
  exerciseId: string
): Promise<ActionResult<string>> {
  const supabase = await createServerSupabase();

  const { data: existing } = await supabase
    .from("workout_exercises")
    .select("position")
    .eq("workout_id", workoutId);

  const { data, error } = await supabase
    .from("workout_exercises")
    .insert({
      workout_id: workoutId,
      exercise_id: exerciseId,
      position: nextPosition(existing ?? []),
    })
    .select("id")
    .single();

  if (error || !data) return { ok: false, error: "Übung konnte nicht hinzugefügt werden." };

  revalidatePath(`/workout/${workoutId}`);
  return { ok: true, data: data.id };
}

export async function removeWorkoutExercise(
  workoutId: string,
  workoutExerciseId: string
): Promise<ActionResult<null>> {
  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from("workout_exercises")
    .delete()
    .eq("id", workoutExerciseId);

  if (error) return { ok: false, error: "Übung konnte nicht entfernt werden." };

  revalidatePath(`/workout/${workoutId}`);
  return { ok: true, data: null };
}

/**
 * Resolves a typed name to an exercise, creating it only if nothing matches.
 *
 * The lookup is case-insensitive on purpose: CONCEPT.md §2.5 calls out
 * "Bench Press" vs "bench press" silently splitting history as the main way
 * exercise identity breaks. The unique constraint is exact, so a case variant
 * would otherwise slip past it and create a second library entry.
 */
export async function findOrCreateExercise(
  name: string
): Promise<ActionResult<ExerciseOption>> {
  const parsed = exerciseNameSchema.safeParse(name);
  if (!parsed.success) {
    return { ok: false, error: "Name darf nicht leer sein (höchstens 80 Zeichen)." };
  }
  const cleanName = parsed.data;

  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: NOT_SIGNED_IN };

  const { data: match } = await supabase
    .from("exercises")
    .select("id, name, note")
    .ilike("name", cleanName)
    .maybeSingle();

  if (match) return { ok: true, data: match };

  const { data, error } = await supabase
    .from("exercises")
    .insert({ user_id: user.id, name: cleanName })
    .select("id, name, note")
    .single();

  if (error || !data) {
    // Lost a race against another tab, or hit the exact-match unique index.
    const { data: retry } = await supabase
      .from("exercises")
      .select("id, name, note")
      .ilike("name", cleanName)
      .maybeSingle();

    if (retry) return { ok: true, data: retry };
    return { ok: false, error: "Übung konnte nicht angelegt werden." };
  }

  return { ok: true, data };
}

export async function addSet(
  workoutId: string,
  workoutExerciseId: string,
  input: unknown
): Promise<ActionResult<SetRecord>> {
  const parsed = setInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Prüfe Gewicht und Wiederholungen." };
  }

  const supabase = await createServerSupabase();

  const { data: existing } = await supabase
    .from("sets")
    .select("position")
    .eq("workout_exercise_id", workoutExerciseId);

  const { data, error } = await supabase
    .from("sets")
    .insert({
      workout_exercise_id: workoutExerciseId,
      position: nextPosition(existing ?? []),
      weight_kg: parsed.data.weight_kg,
      reps: parsed.data.reps,
      is_warmup: parsed.data.is_warmup,
    })
    .select(SET_COLUMNS)
    .single();

  if (error || !data) return { ok: false, error: SAVE_FAILED };

  revalidatePath(`/workout/${workoutId}`);
  return { ok: true, data: toSetRecord(data as RawSet) };
}

export async function updateSet(
  workoutId: string,
  setId: string,
  input: unknown
): Promise<ActionResult<SetRecord>> {
  const parsed = setInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Prüfe Gewicht und Wiederholungen." };
  }

  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("sets")
    .update({
      weight_kg: parsed.data.weight_kg,
      reps: parsed.data.reps,
      is_warmup: parsed.data.is_warmup,
    })
    .eq("id", setId)
    .select(SET_COLUMNS)
    .single();

  if (error || !data) return { ok: false, error: SAVE_FAILED };

  revalidatePath(`/workout/${workoutId}`);
  return { ok: true, data: toSetRecord(data as RawSet) };
}

export async function deleteSet(
  workoutId: string,
  setId: string
): Promise<ActionResult<null>> {
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("sets").delete().eq("id", setId);

  if (error) return { ok: false, error: "Satz konnte nicht gelöscht werden." };

  revalidatePath(`/workout/${workoutId}`);
  return { ok: true, data: null };
}

/**
 * Search wrapper for the picker.
 *
 * `searchExercises` reaches the server-only Supabase client, so a client
 * component cannot import it. It lives here rather than beside the route
 * because a module inside `src/app/workout/[id]/` would have to be imported
 * through a path containing literal square brackets.
 */
export async function searchExercisesAction(query: string): Promise<ExerciseOption[]> {
  return searchExercises(query);
}
```

- [ ] **Step 3: Verify types and build**

```bash
npx tsc --noEmit && npm run build
```
Expected: both exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/app/workout/actions.ts
git commit -m "feat: add workout server actions"
```

---

### Task 7: App shell, Heute screen, and the workout page skeleton

**Files:**
- Create: `src/components/nav/bottom-tabs.tsx`, `src/components/workout/start-workout-button.tsx`, `src/components/workout/workout-header.tsx`, `src/app/workout/[id]/page.tsx`
- Modify: `src/app/layout.tsx`, `src/app/page.tsx`

**Interfaces:**
- Consumes: `listRecentWorkouts`, `countWorkoutsSince`, `getWorkoutDetail` (Task 5); `startWorkout`, `updateWorkoutMeta` (Task 6); `formatPerformedOn`, `startOfWeekMonday`, `todayInAppTimezone`, `localDateString` (Task 3); existing `logout` from `@/app/login/actions`.
- Produces: the `/workout/[id]` route that `startWorkout` redirects into; `<BottomTabs />` rendered by the root layout.

After this task the app is clickable end to end at the container level: start a workout, land on its page, edit its date/category/note, go back. Exercises and sets arrive in Tasks 8 and 9.

**A deliberate asymmetry, so it does not look like a bug in review:** `startWorkout` is handed the *browser's* local date, because the write path is where a wrong date persists. The Heute screen's week counter is computed server-side in `Europe/Berlin` via `todayInAppTimezone()`, because a server component has no access to the client clock. Worst case those disagree for a few hours a week while travelling, and the counter is display-only.

- [ ] **Step 1: Create `src/components/nav/bottom-tabs.tsx`**

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, Dumbbell } from "lucide-react";

import { cn } from "@/lib/utils";

const TABS = [
  { href: "/", label: "Heute", Icon: Dumbbell },
  { href: "/history", label: "Verlauf", Icon: CalendarDays },
];

export function BottomTabs() {
  const pathname = usePathname();

  // The login screen has no navigation.
  if (pathname.startsWith("/login")) return null;

  return (
    <nav className="fixed inset-x-0 bottom-0 border-t border-border bg-card">
      <div className="mx-auto flex w-full max-w-md">
        {TABS.map(({ href, label, Icon }) => {
          const isActive = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex min-h-14 flex-1 flex-col items-center justify-center gap-1 text-xs",
                isActive ? "text-primary" : "text-muted-foreground"
              )}
            >
              <Icon className="size-5" aria-hidden />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
```

- [ ] **Step 2: Render the tabs from `src/app/layout.tsx`**

Replace the whole file with:

```tsx
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

import { BottomTabs } from "@/components/nav/bottom-tabs";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "GymTrack",
  description: "Dein Trainings-Log",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="de" className={`${inter.variable} h-full antialiased`}>
      {/* pb-20 keeps the fixed tab bar from covering the last row of content. */}
      <body className="min-h-full flex flex-col pb-20">
        {children}
        <BottomTabs />
      </body>
    </html>
  );
}
```

`LayoutProps<"/">` is a global type this Next.js version generates from the route tree — keep it rather than hand-writing a `children` type.

- [ ] **Step 3: Create `src/components/workout/start-workout-button.tsx`**

```tsx
"use client";

import { useTransition } from "react";

import { Button } from "@/components/ui/button";
import { localDateString } from "@/lib/dates";
import { startWorkout } from "@/app/workout/actions";

export function StartWorkoutButton() {
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      size="lg"
      className="min-h-14 w-full text-base"
      disabled={isPending}
      onClick={() =>
        // The client's own date — see the note in the plan's Task 7 header.
        startTransition(() => {
          void startWorkout(localDateString(new Date()));
        })
      }
    >
      {isPending ? "Wird gestartet …" : "Workout starten"}
    </Button>
  );
}
```

- [ ] **Step 4: Replace `src/app/page.tsx` with the Heute screen**

```tsx
import Link from "next/link";

import { logout } from "@/app/login/actions";
import { StartWorkoutButton } from "@/components/workout/start-workout-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { countWorkoutsSince, listRecentWorkouts } from "@/lib/data/workouts";
import { formatPerformedOn, startOfWeekMonday, todayInAppTimezone } from "@/lib/dates";
import { createServerSupabase } from "@/lib/supabase/server";

export default async function HomePage() {
  const supabase = await createServerSupabase();
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .maybeSingle();

  const weekStart = startOfWeekMonday(new Date(`${todayInAppTimezone()}T12:00:00`));
  const [thisWeek, recent] = await Promise.all([
    countWorkoutsSince(weekStart),
    listRecentWorkouts(5),
  ]);

  return (
    <main className="mx-auto w-full max-w-md p-4">
      <header className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold">GymTrack</h1>
        <form action={logout}>
          <Button type="submit" variant="ghost" size="sm" className="text-muted-foreground">
            Abmelden
          </Button>
        </form>
      </header>

      <p className="mt-1 text-sm text-muted-foreground">
        Hallo {profile?.display_name ?? "du"}
      </p>

      <Card className="mt-6">
        <CardContent className="flex items-baseline gap-3 p-4">
          <span className="text-4xl font-bold tabular-nums">{thisWeek}</span>
          <span className="text-sm text-muted-foreground">
            {thisWeek === 1 ? "Workout diese Woche" : "Workouts diese Woche"}
          </span>
        </CardContent>
      </Card>

      <div className="mt-6">
        <StartWorkoutButton />
      </div>

      <section className="mt-8">
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Zuletzt
        </h2>

        {recent.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            Noch kein Workout geloggt. Starte dein erstes.
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {recent.map((workout) => (
              <li key={workout.id}>
                <Link
                  href={`/workout/${workout.id}`}
                  className="flex min-h-14 items-center justify-between rounded-xl bg-card px-4"
                >
                  <span className="font-medium">
                    {formatPerformedOn(workout.performed_on)}
                    {workout.category ? ` · ${workout.category}` : ""}
                  </span>
                  <span className="text-sm text-muted-foreground tabular-nums">
                    {workout.exerciseCount} Übungen · {workout.setCount} Sätze
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
```

- [ ] **Step 5: Create `src/components/workout/workout-header.tsx`**

```tsx
"use client";

import { useState, useTransition } from "react";

import { updateWorkoutMeta } from "@/app/workout/actions";
import { Button } from "@/components/ui/button";
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
              value={meta.performedOn}
              onChange={(event) => setMeta({ ...meta, performedOn: event.target.value })}
              onBlur={() => save(meta)}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="category">Kategorie</Label>
            <Input
              id="category"
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
```

- [ ] **Step 6: Create `src/app/workout/[id]/page.tsx`**

```tsx
import { notFound } from "next/navigation";

import { WorkoutHeader } from "@/components/workout/workout-header";
import { getWorkoutDetail } from "@/lib/data/workouts";

export default async function WorkoutPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // `params` is a Promise in this Next.js version — see the Global Constraints.
  const { id } = await params;

  // RLS means a foreign or missing id simply returns nothing.
  const workout = await getWorkoutDetail(id);
  if (!workout) notFound();

  return (
    <main className="mx-auto w-full max-w-md p-4">
      <WorkoutHeader
        workoutId={workout.id}
        performedOn={workout.performed_on}
        category={workout.category}
        note={workout.note}
      />

      <p className="mt-8 text-sm text-muted-foreground">
        Noch keine Übung in diesem Workout.
      </p>
    </main>
  );
}
```

- [ ] **Step 7: Verify locally**

```bash
npx tsc --noEmit && npm run build
```
Expected: both exit 0.

Then `npm run dev` and, signed in: the home page shows the week counter and "Workout starten"; tapping it lands on `/workout/<uuid>` showing today's date; expanding the header, changing the category and blurring, then reloading shows the category persisted; the bottom tab bar is visible on both screens and absent on `/login`. Stop the dev server.

- [ ] **Step 8: Commit**

```bash
git add src/app src/components
git commit -m "feat: add app shell, Heute screen, and workout page skeleton"
```

---

### Task 8: Exercise picker

**Files:**
- Create: `src/components/workout/exercise-picker.tsx`, `src/components/workout/exercise-card.tsx`
- Modify: `src/app/workout/[id]/page.tsx`

**Interfaces:**
- Consumes: `searchExercisesAction`, `addExerciseToWorkout`, `findOrCreateExercise` (Task 6); `ExerciseOption`, `WorkoutExerciseDetail` types.
- Produces: `<ExercisePicker workoutId={…} />`; `<ExerciseCard workoutExercise={…} workoutId={…} lastSummary={…} />`, which Task 9 fills with set rows.

The picker is a bottom-anchored `Dialog` rather than a `Drawer`: this project uses the `base-nova` shadcn style on Base UI, which has no vaul-backed drawer. `Dialog` gives the same focus trap, escape handling, and backdrop; the sheet look comes from positioning classes.

**Do not use `asChild`.** These components wrap Base UI, not Radix, and Base UI has no `asChild` prop — it uses a `render` prop instead. To avoid depending on either, the picker drives the dialog through `open` / `onOpenChange` state and puts its trigger button outside the dialog entirely.

- [ ] **Step 1: Add the dialog component**

```bash
npx shadcn@latest add dialog
```
Expected: `src/components/ui/dialog.tsx` is created. If the CLI reports the component already exists, keep the existing file.

- [ ] **Step 2: Create `src/components/workout/exercise-picker.tsx`**

```tsx
"use client";

import { useEffect, useState, useTransition } from "react";

import {
  addExerciseToWorkout,
  findOrCreateExercise,
  searchExercisesAction,
} from "@/app/workout/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { ExerciseOption } from "@/lib/types";

export function ExercisePicker({ workoutId }: { workoutId: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<ExerciseOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;
    // Debounced so typing does not queue one action per keystroke — this
    // Next.js version dispatches server actions sequentially per client.
    const timer = setTimeout(() => {
      searchExercisesAction(query).then((result) => {
        if (!cancelled) setOptions(result);
      });
    }, 150);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, isOpen]);

  const trimmedQuery = query.trim();
  const hasExactMatch = options.some(
    (option) => option.name.toLowerCase() === trimmedQuery.toLowerCase()
  );

  function addExisting(exerciseId: string) {
    startTransition(async () => {
      const result = await addExerciseToWorkout(workoutId, exerciseId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setError(null);
      setQuery("");
      setIsOpen(false);
    });
  }

  function createAndAdd() {
    startTransition(async () => {
      const created = await findOrCreateExercise(trimmedQuery);
      if (!created.ok) {
        setError(created.error);
        return;
      }
      const added = await addExerciseToWorkout(workoutId, created.data.id);
      if (!added.ok) {
        setError(added.error);
        return;
      }
      setError(null);
      setQuery("");
      setIsOpen(false);
    });
  }

  return (
    <>
      <Button
        size="lg"
        className="min-h-14 w-full text-base"
        onClick={() => setIsOpen(true)}
      >
        Übung hinzufügen
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="inset-x-0 bottom-0 top-auto mx-auto max-h-[85dvh] w-full max-w-md translate-x-0 translate-y-0 rounded-b-none rounded-t-2xl">
        <DialogHeader>
          <DialogTitle>Übung wählen</DialogTitle>
        </DialogHeader>

        <Input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Suchen oder neu anlegen"
          aria-label="Übung suchen"
        />

        <ul className="mt-2 flex max-h-[50dvh] flex-col overflow-y-auto">
          {options.map((option) => (
            <li key={option.id}>
              <button
                type="button"
                disabled={isPending}
                onClick={() => addExisting(option.id)}
                className="flex min-h-12 w-full items-center justify-between text-left"
              >
                <span>{option.name}</span>
                {option.note && (
                  <span className="text-sm text-muted-foreground">{option.note}</span>
                )}
              </button>
            </li>
          ))}

          {trimmedQuery.length > 0 && !hasExactMatch && (
            <li>
              <button
                type="button"
                disabled={isPending}
                onClick={createAndAdd}
                className="flex min-h-12 w-full items-center text-left text-primary"
              >
                ＋ „{trimmedQuery}" anlegen
              </button>
            </li>
          )}

          {options.length === 0 && trimmedQuery.length === 0 && (
            <li className="py-3 text-sm text-muted-foreground">
              Noch keine Übungen. Tippe einen Namen, um die erste anzulegen.
            </li>
          )}
        </ul>

        {error && <p className="text-sm text-destructive">{error}</p>}
      </DialogContent>
      </Dialog>
    </>
  );
}
```

- [ ] **Step 3: Create `src/components/workout/exercise-card.tsx`**

```tsx
"use client";

import { useTransition } from "react";

import { removeWorkoutExercise } from "@/app/workout/actions";
import { Button } from "@/components/ui/button";
import type { WorkoutExerciseDetail } from "@/lib/types";

type Props = {
  workoutId: string;
  workoutExercise: WorkoutExerciseDetail;
  /** "12. Aug: 80 × 8 · 82,5 × 6", or null when there is no previous session. */
  lastSummary: string | null;
};

export function ExerciseCard({ workoutId, workoutExercise, lastSummary }: Props) {
  const [isPending, startTransition] = useTransition();

  return (
    <article className="rounded-xl bg-card p-4">
      <header className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-medium">{workoutExercise.exercise.name}</h3>
          {lastSummary && (
            <p className="mt-1 text-sm text-muted-foreground tabular-nums">{lastSummary}</p>
          )}
        </div>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={isPending}
          className="text-muted-foreground"
          onClick={() =>
            startTransition(async () => {
              await removeWorkoutExercise(workoutId, workoutExercise.id);
            })
          }
        >
          Entfernen
        </Button>
      </header>
    </article>
  );
}
```

- [ ] **Step 4: Wire both into `src/app/workout/[id]/page.tsx`**

Replace the placeholder paragraph. The full file becomes:

```tsx
import { notFound } from "next/navigation";

import { ExerciseCard } from "@/components/workout/exercise-card";
import { ExercisePicker } from "@/components/workout/exercise-picker";
import { WorkoutHeader } from "@/components/workout/workout-header";
import { getWorkoutDetail } from "@/lib/data/workouts";

export default async function WorkoutPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const workout = await getWorkoutDetail(id);
  if (!workout) notFound();

  return (
    <main className="mx-auto w-full max-w-md p-4">
      <WorkoutHeader
        workoutId={workout.id}
        performedOn={workout.performed_on}
        category={workout.category}
        note={workout.note}
      />

      <div className="mt-6 flex flex-col gap-4">
        {workout.exercises.map((workoutExercise) => (
          <ExerciseCard
            key={workoutExercise.id}
            workoutId={workout.id}
            workoutExercise={workoutExercise}
            lastSummary={null}
          />
        ))}
      </div>

      {workout.exercises.length === 0 && (
        <p className="mt-6 text-sm text-muted-foreground">
          Noch keine Übung in diesem Workout.
        </p>
      )}

      <div className="mt-6">
        <ExercisePicker workoutId={workout.id} />
      </div>
    </main>
  );
}
```

`lastSummary` stays `null` until Task 9 loads last performances — the prop exists now so Task 9 only fills it in.

- [ ] **Step 5: Verify locally**

```bash
npx tsc --noEmit && npm run build
```
Expected: both exit 0.

Then `npm run dev`: on a workout page, "Übung hinzufügen" opens a sheet anchored to the bottom; typing "ben" finds the seeded "Bench Press"; selecting it closes the sheet and shows a card; typing a name that does not exist offers the create row and adding it works; typing an existing name in different casing (`bench press`) resolves to the existing exercise rather than creating a second one; adding the *same* exercise twice produces two independent cards (allowed by design — repeats and supersets are real); "Entfernen" removes a card. Stop the dev server.

- [ ] **Step 6: Commit**

```bash
git add src/app src/components
git commit -m "feat: add exercise picker and exercise cards"
```

---

### Task 9: Set logging with optimistic save and ghost values

**Files:**
- Create: `src/components/workout/set-row.tsx`, `src/components/workout/set-list.tsx`
- Modify: `src/components/workout/exercise-card.tsx`, `src/app/workout/[id]/page.tsx`

**Interfaces:**
- Consumes: `addSet`, `updateSet`, `deleteSet` (Task 6); `ghostForPosition`, `formatWeight`, `formatSetSummary` (Task 3); `getLastPerformances` (Task 5); `formatPerformedOn` (Task 3).
- Produces: `<SetList workoutId={…} workoutExerciseId={…} sets={…} lastPerformance={…} />` rendered inside `ExerciseCard`.

This is the heart of the app (`DESIGN_SYSTEM.md` §9.4). `SetList` owns the optimistic array and per-row save status; `SetRow` is a controlled presentational row.

- [ ] **Step 1: Create `src/components/workout/set-row.tsx`**

```tsx
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

      <span className="w-6 text-center" aria-live="polite">
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
            className="text-[hsl(38_92%_55%)]"
          >
            ●
          </button>
        )}
      </span>

      <button
        type="button"
        onClick={onDelete}
        aria-label={`Satz ${index + 1} löschen`}
        className="min-h-12 min-w-8 text-muted-foreground"
      >
        ×
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Create `src/components/workout/set-list.tsx`**

```tsx
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
```

- [ ] **Step 3: Render `SetList` from `ExerciseCard`**

Replace `src/components/workout/exercise-card.tsx` entirely:

```tsx
"use client";

import { useTransition } from "react";

import { removeWorkoutExercise } from "@/app/workout/actions";
import { SetList } from "@/components/workout/set-list";
import { Button } from "@/components/ui/button";
import type { LastPerformance, WorkoutExerciseDetail } from "@/lib/types";

type Props = {
  workoutId: string;
  workoutExercise: WorkoutExerciseDetail;
  /** "12. Aug: 80 × 8 · 82,5 × 6", or null when there is no previous session. */
  lastSummary: string | null;
  lastPerformance: LastPerformance;
};

export function ExerciseCard({
  workoutId,
  workoutExercise,
  lastSummary,
  lastPerformance,
}: Props) {
  const [isPending, startTransition] = useTransition();

  return (
    <article className="rounded-xl bg-card p-4">
      <header className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-medium">{workoutExercise.exercise.name}</h3>
          {lastSummary && (
            <p className="mt-1 text-sm text-muted-foreground tabular-nums">{lastSummary}</p>
          )}
        </div>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={isPending}
          className="text-muted-foreground"
          onClick={() =>
            startTransition(async () => {
              await removeWorkoutExercise(workoutId, workoutExercise.id);
            })
          }
        >
          Entfernen
        </Button>
      </header>

      <SetList
        workoutId={workoutId}
        workoutExerciseId={workoutExercise.id}
        sets={workoutExercise.sets}
        lastPerformance={lastPerformance}
      />
    </article>
  );
}
```

- [ ] **Step 4: Load last performances in `src/app/workout/[id]/page.tsx`**

Replace the file entirely:

```tsx
import { notFound } from "next/navigation";

import { ExerciseCard } from "@/components/workout/exercise-card";
import { ExercisePicker } from "@/components/workout/exercise-picker";
import { WorkoutHeader } from "@/components/workout/workout-header";
import { getLastPerformances } from "@/lib/data/exercises";
import { getWorkoutDetail } from "@/lib/data/workouts";
import { formatPerformedOn } from "@/lib/dates";
import { formatSetSummary } from "@/lib/sets";

export default async function WorkoutPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const workout = await getWorkoutDetail(id);
  if (!workout) notFound();

  // One batched query for every exercise in the workout — never one per card.
  const lastPerformances = await getLastPerformances(
    workout.exercises.map((workoutExercise) => workoutExercise.exercise.id),
    workout.performed_on,
    workout.id
  );

  return (
    <main className="mx-auto w-full max-w-md p-4">
      <WorkoutHeader
        workoutId={workout.id}
        performedOn={workout.performed_on}
        category={workout.category}
        note={workout.note}
      />

      <div className="mt-6 flex flex-col gap-4">
        {workout.exercises.map((workoutExercise) => {
          const lastPerformance =
            lastPerformances.get(workoutExercise.exercise.id) ?? null;
          const summary = lastPerformance ? formatSetSummary(lastPerformance.sets) : "";

          return (
            <ExerciseCard
              key={workoutExercise.id}
              workoutId={workout.id}
              workoutExercise={workoutExercise}
              lastPerformance={lastPerformance}
              lastSummary={
                lastPerformance && summary
                  ? `${formatPerformedOn(lastPerformance.performedOn)}: ${summary}`
                  : null
              }
            />
          );
        })}
      </div>

      {workout.exercises.length === 0 && (
        <p className="mt-6 text-sm text-muted-foreground">
          Noch keine Übung in diesem Workout.
        </p>
      )}

      <div className="mt-6">
        <ExercisePicker workoutId={workout.id} />
      </div>
    </main>
  );
}
```

- [ ] **Step 5: Verify locally**

```bash
npx tsc --noEmit && npm test && npm run build
```
Expected: all three exit 0.

Then `npm run dev` and check, in order:
1. On an exercise card, "Satz hinzufügen" adds an empty row; entering `80` and `8` and blurring shows the lime check.
2. Reloading the page keeps the set.
3. Editing the weight to `82,5` and blurring saves — the German comma is accepted.
4. The `W` toggle marks a warm-up and persists.
5. `×` deletes a row and it stays gone after reload.
6. Start a **second** workout, add the same exercise: the rows show the first session's numbers as grey placeholders, and the card header shows `<Datum>: 80 × 8 …`.
7. With the browser offline (DevTools → Network → Offline), entering a set leaves the value on screen with an amber dot; going back online and tapping the dot saves it.

Stop the dev server.

- [ ] **Step 6: Commit**

```bash
git add src/app src/components
git commit -m "feat: add set logging with optimistic save and ghost values"
```

---

### Task 10: History screen

**Files:**
- Create: `src/app/history/page.tsx`

**Interfaces:**
- Consumes: `listRecentWorkouts` (Task 5), `formatPerformedOn` (Task 3).
- Produces: the `/history` route that the Verlauf tab links to.

- [ ] **Step 1: Create `src/app/history/page.tsx`**

```tsx
import Link from "next/link";

import { listRecentWorkouts } from "@/lib/data/workouts";
import { formatPerformedOn } from "@/lib/dates";

export default async function HistoryPage() {
  const workouts = await listRecentWorkouts(100);

  return (
    <main className="mx-auto w-full max-w-md p-4">
      <h1 className="text-xl font-semibold">Verlauf</h1>

      {workouts.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">
          Noch keine Workouts. Sobald du eins loggst, steht es hier.
        </p>
      ) : (
        <ul className="mt-6 flex flex-col gap-2">
          {workouts.map((workout) => (
            <li key={workout.id}>
              <Link
                href={`/workout/${workout.id}`}
                className="flex min-h-14 items-center justify-between rounded-xl bg-card px-4"
              >
                <span className="font-medium">
                  {formatPerformedOn(workout.performed_on)}
                  {workout.category ? ` · ${workout.category}` : ""}
                </span>
                <span className="text-sm text-muted-foreground tabular-nums">
                  {workout.exerciseCount} Übungen · {workout.setCount} Sätze
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
```

- [ ] **Step 2: Verify locally**

```bash
npx tsc --noEmit && npm run build
```
Expected: both exit 0.

Then `npm run dev`: the Verlauf tab lists the workouts newest first, each entry opens its log screen with its data intact, and the tab shows as active while on `/history`. Stop the dev server.

- [ ] **Step 3: Commit**

```bash
git add src/app/history
git commit -m "feat: add history screen"
```

---

### Task 11: Release 2 — production deploy and acceptance (manual — Dominik)

**Files:** none.

**Interfaces:**
- Consumes: Tasks 3–10 on `staging`; the Vercel project from Task 1.
- Produces: the clickable prototype live on production; the tag `v0.2-core-loop`.

- [ ] **Step 1: Full local verification**

```bash
npm test && npm run build && git status --short
```
Expected: tests pass, build exits 0, working tree clean.

- [ ] **Step 2: Deploy the preview**

```bash
git push origin staging
```
Expected: Preview deployment READY.

- [ ] **Step 3: Fast-forward to production**

```bash
git checkout main && git merge --ff-only staging && git push origin main && git checkout staging
```
Expected: Production deployment READY.

- [ ] **Step 4: Run the acceptance checklist on the phone, against production**

| # | Check | Expected |
|---|---|---|
| 1 | Open production URL, log in | Heute screen with the week counter |
| 2 | Tap "Workout starten" | Lands on a workout dated **today** — verify after 22:00 CEST, when a UTC-based date would already show tomorrow |
| 3 | "Übung hinzufügen", type a partial name | The seeded exercise appears; selecting it adds a card |
| 4 | Enter weight and reps, blur | Value appears instantly with a lime check |
| 5 | Reload the page | The set is still there |
| 6 | Enable airplane mode, enter another set | Value stays on screen with an amber dot |
| 7 | Disable airplane mode, tap the dot | The set saves |
| 8 | Start a second workout, add the same exercise | Grey placeholders show session one's numbers; the card header shows the date and summary |
| 9 | Tap the check on a ghost row | A real set is created with those numbers |
| 10 | Verlauf tab | Both workouts listed newest first; each opens with its data intact |
| 11 | Anonymous REST probe (Task 2 Step 4, against `sets`) | `[]` |

- [ ] **Step 5: Tag the release**

```bash
git tag -a v0.2-core-loop -m "Clickable core workflow live on production" && git push origin v0.2-core-loop
```
