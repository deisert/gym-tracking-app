# GymTrack Monorepo + Installable PWA — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the repo as an npm-workspaces monorepo with a shared `@gymtrack/core` package, then turn the existing Next.js web app into an installable, connectivity-resilient PWA that lives on an iPhone 15 Pro home screen.

**Architecture:** The Next.js app moves wholesale into `apps/web`. The six pure-TypeScript modules it already owns (`types`, `validation`, `sets`, `dates`, `exercise-search`, `workout-summary`) plus their 83 vitest tests move into `packages/core`, consumed as source `.ts` via `transpilePackages` — no build step. `supabase/` and `docs/` stay at the repo root as the single source of schema and documentation. The PWA work is additive metadata plus a narrowly-scoped service worker; no data-layer or schema change anywhere.

**Everything in Tasks 1–10 is native-client-agnostic.** The choice between React Native and Swift/SwiftUI is an open fork (spec D9) resolved at the Phase 3 gate, and nothing in this plan commits to either. Read the note at the head of Task 2 before executing it — the *reason* `packages/core` is worth extracting differs between the two branches, and the plan is honest about the branch where that reason is weaker.

**Tech Stack:** Next.js 16.3.1 (App Router, Server Actions), React 19.2.8, Tailwind CSS v4, Supabase (`@supabase/ssr`), zod 4, vitest 1, npm workspaces, `sharp` (icon generation, dev-only).

**Spec:** `docs/superpowers/specs/2026-09-15-mobile-strategy.md`

## Global Constraints

- **Do not touch `supabase/migrations/`.** No schema change is required by any task in this plan.
- **Do not commit secrets.** `.env.local` moves but stays gitignored; `.env.example` remains the only env file in the repo.
- **Package name is `@gymtrack/core`**, version `0.0.0`, `private: true`. Use that exact string everywhere.
- **`packages/core` must not import React, Next.js, or Supabase.** Its only runtime dependency is `zod`. This is what makes it consumable by a React Native app later.
- **UI copy is German.** Match the existing tone in `src/app/login/page.tsx` and `src/components/`.
- **Theme colour is `#111317`** (the rendered value of `--background: hsl(220 15% 8%)`). Use that literal hex in manifest and viewport metadata.
- **Node/npm:** npm workspaces requires npm 7+. One lockfile at the repo root only.
- **Tests must stay green throughout.** The suite is **141 tests in 9 files**, measured after the dashboard landed, 2026-09-23. A task that reduces that count without deleting a behaviour is a regression.
- **`swipe-gesture.ts` stays in `apps/web`.** It has zero imports and is perfectly pure, so it looks like a `packages/core` candidate — but it is *web pointer-event* math (rubber-banding, tap slop, commit thresholds). Gesture handling on either native path is platform-native, so none of it transfers. Purity is not the criterion; portability is.
- **Read `node_modules/next/dist/docs/` before writing Next-specific code.** This is Next 16; APIs differ from older releases. Relevant guides: `01-app/02-guides/progressive-web-apps.md`, `01-app/02-guides/offline-support.md`, `01-app/03-api-reference/03-file-conventions/01-metadata/manifest.md`.

---

## External Setup — What Only You Can Do

Everything Claude cannot reach, in one place. Each item names the task that
needs it, so you can do them just-in-time rather than all up front.

### Before you start: nothing

Verified on this machine on 2026-09-15: Node v20.12.2 and npm 10.5.0. npm
workspaces needs npm 7+, so no upgrade is required. **Phases 1–2 need no
Xcode, no Apple ID, and no Apple Developer Program** — those belong to Phase 3
only. The whole PWA path runs on tools you already have.

### Vercel (blocks Task 3; deploys stay broken until done)

Do this in the browser at `vercel.com/dominiks-projects-5848510f/gym-tracking-app`.
Per project memory the Vercel MCP returns 404s for this project, so there is no
API path — and pushes to `main` are blocked for Claude by the permission
classifier.

1. **Settings → Build and Deployment → Root Directory** → `apps/web`.
2. On the same screen, leave **"Include files outside the root directory"
   enabled**. The build imports `packages/core`, which sits above `apps/web`.
   Disabling this is the most likely way to get a green local build and a red
   Vercel build.
3. **Framework Preset** must read **Next.js**. This project has regressed to a
   `build/`-output preset before.
4. **Settings → Environment Variables** — confirm all three exist for both
   Production *and* Preview:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `NEXT_PUBLIC_SITE_URL` ← **verify this one specifically.** It is documented
     in `.env.example` but is *not* set in local `.env.local`, where the
     `http://127.0.0.1:3000` fallback in `src/lib/site-url.ts` is correct. If it
     is also unset on Vercel, magic-link emails sent from production tell the
     recipient to visit `127.0.0.1:3000` and the login is dead. This is an
     existing condition, not something this plan introduces — check it while
     you are in the dashboard.

### Supabase (no change for Phases 1–2 — but verify one list)

No migration, no schema change, no key rotation. The one thing to check is the
auth redirect allow list, because it is what lets all environments coexist:

**Dashboard → Authentication → URL Configuration → Redirect URLs** must contain
an entry for every origin that sends a magic link. Confirm these three:

- `http://127.0.0.1:3000/**` — local dev
- `https://gym-tracking-app-git-staging-dominiks-projects-5848510f.vercel.app/**` — staging
- `https://gym-tracking-app-kohl.vercel.app/**` — production

A missing entry fails at *send* time with a redirect-not-allowed error, not at
click time, so it looks like a broken login form rather than a config problem.
Leave "Allow new users to sign up" **disabled** — that is a deliberate
decision recorded in project memory, and nothing in this plan needs it on.

### GitHub (Tasks 3 and 10)

`git push origin staging` and the `main` merge are yours — Claude is blocked
from both by the permission classifier. Exact commands are in Task 3 Steps 3
and 5.

### Your iPhone (Task 10)

Must be **Safari** — Chrome on iOS cannot add to the home screen. Use the
**production** URL, not staging: staging sits behind Vercel Authentication
(Standard Protection), which interferes with installation. Full walkthrough in
Task 10.

### What runs where, simultaneously

This is the "everything working at once" picture. All four columns share **one**
Supabase project and **one** user account — that is spec decision D4 working as
intended, not a compromise.

| Environment | URL | Env vars come from | Extra setup |
| ----------- | --- | ------------------ | ----------- |
| Local dev | `http://127.0.0.1:3000` | `apps/web/.env.local` | redirect-list entry |
| Staging preview | `…-git-staging-….vercel.app` | Vercel, Preview scope | redirect-list entry |
| Production | `gym-tracking-app-kohl.vercel.app` | Vercel, Production scope | redirect-list entry |
| Installed PWA | *same as production* | *same deployment* | **none** |

The last row is the point worth internalising: **the installed app is not a
fourth environment.** It is the production deployment rendered without browser
chrome. It has no build of its own, no env vars of its own, and no deploy step
of its own — shipping to production ships to the phone. The only thing that
behaves differently inside it is the cookie jar, which is exactly what Task 8
addresses.

So a set logged on the phone appears in local dev on the next refresh, because
all four talk to the same Postgres. If you ever want that *not* to be true —
scratch data locally without touching real workouts — that is a second Supabase
project and a different `.env.local`, and it is out of scope here.

---

## File Structure

**After Phase 1:**

```
gym-tracking-app/
  package.json                  workspace root: scripts proxy to apps/web
  package-lock.json             single lockfile (regenerated)
  .gitignore                    patterns un-anchored so they apply per-workspace
  apps/web/
    package.json                the current app manifest, minus vitest
    next.config.ts              + transpilePackages
    tsconfig.json               unchanged @/* paths
    components.json, eslint.config.mjs, postcss.config.mjs
    .env.local, .env.example, vercel.json
    public/
    src/                        moved wholesale; lib/{types,validation,sets,dates}.ts removed in Task 2
  packages/core/
    package.json                @gymtrack/core, exports ./src/index.ts
    tsconfig.json
    vitest.config.ts
    src/index.ts                barrel re-export
    src/{types,validation,sets,dates,exercise-search,workout-summary}.ts
    src/{validation,sets,dates,exercise-search,workout-summary}.test.ts
                                83 of the 141 tests; swipe-gesture and the dashboard tests stay in apps/web
  supabase/                     unchanged, stays at root
  docs/                         unchanged, stays at root
```

**Added in Phase 2 (all under `apps/web/`):**

```
  scripts/generate-icons.mjs    sharp rasteriser, run manually
  public/icon-source.svg        hand-authored master glyph
  public/icon-{192,512}.png, icon-512-maskable.png, apple-touch-icon.png
  public/sw.js                  static-asset cache + offline fallback
  src/app/manifest.ts           MetadataRoute.Manifest
  src/app/offline/page.tsx      static offline fallback route
  src/app/loading.tsx           prefetchable shell for `/` (Verlauf)
  src/app/dashboard/loading.tsx
  src/app/workout/[id]/loading.tsx
  src/components/pwa/offline-banner.tsx
  src/components/pwa/install-hint.tsx
  src/components/pwa/register-sw.tsx
```

**Added in Phase 2 (under `packages/core/`):**

```
  src/pwa.ts                    pure display-mode/platform predicate
  src/pwa.test.ts
```

Rationale: `packages/core` holds only logic with no environment dependency, which is exactly what a future React Native app can reuse. The `pwa.ts` predicates take their inputs as arguments rather than reading `navigator`, which keeps them pure and testable — the component does the reading.

---

## Task Right-Sizing Note

Two kinds of step appear below. Steps that add **logic** are test-first: write the failing test, watch it fail, implement, watch it pass. Steps that move files, generate binary assets, or change hosting config are not meaningfully unit-testable; those carry an explicit verification command whose expected output is stated. Do not fabricate unit tests for file moves.

---

# Phase 1 — Monorepo

## Task 1: Move the Next.js app into `apps/web` under npm workspaces

Nothing but file locations changes. No import in `src/` is edited: `@/*` still resolves because `src/` moves as a unit.

**Files:**
- Create: `package.json` (new workspace root), `apps/web/` (destination)
- Move: `src/`, `public/`, `next.config.ts`, `tsconfig.json`, `components.json`, `eslint.config.mjs`, `postcss.config.mjs`, `vercel.json`, `vitest.config.js`, `.env.local`, `.env.example` → `apps/web/`
- Move: `package.json` → `apps/web/package.json`
- Modify: `.gitignore`
- Delete: `package-lock.json` (regenerated), `.next/` (stale build output)

**Interfaces:**
- Consumes: nothing.
- Produces: a workspace root whose `npm run dev`, `npm run build`, `npm test`, and `npm run lint` proxy to `apps/web`. `.claude/launch.json` calls `npm run dev` and keeps working unchanged.

- [ ] **Step 1: Record the current green baseline**

```bash
npm test 2>&1 | tail -5
npx tsc --noEmit && echo "TSC CLEAN"
```

Expected: vitest reports `Tests  141 passed (141)` across 9 files, then `TSC CLEAN`. Write the exact test count down — every later task must still reach it. If this is not green, stop and report; do not start restructuring on a red tree.

- [ ] **Step 2: Move the app**

```bash
mkdir -p apps/web
git mv src public next.config.ts tsconfig.json components.json \
        eslint.config.mjs postcss.config.mjs vercel.json \
        vitest.config.js package.json apps/web/
mv .env.local .env.example apps/web/
rm -rf .next node_modules package-lock.json
```

`next-env.d.ts` is gitignored and regenerates itself — do not move it. `.env.local` is gitignored so `git mv` would fail on it; plain `mv` is correct.

- [ ] **Step 3: Write the workspace root `package.json`**

Create `package.json` at the repo root:

```json
{
  "name": "gymtrack",
  "version": "0.1.0",
  "private": true,
  "workspaces": [
    "apps/*",
    "packages/*"
  ],
  "scripts": {
    "dev": "npm run dev --workspace apps/web",
    "build": "npm run build --workspace apps/web",
    "start": "npm run start --workspace apps/web",
    "lint": "npm run lint --workspace apps/web",
    "test": "npm run test --workspaces --if-present",
    "typecheck": "npm run typecheck --workspaces --if-present"
  }
}
```

- [ ] **Step 4: Name the web workspace and add a typecheck script**

In `apps/web/package.json`, change the `name` field and add `typecheck`:

```json
{
  "name": "@gymtrack/web",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

Leave the `dependencies` and `devDependencies` blocks exactly as they are — they move with the file.

- [ ] **Step 5: Un-anchor the gitignore patterns**

Root-anchored patterns (`/node_modules`, `/.next/`) no longer match `apps/web/node_modules` or `apps/web/.next`. In `.gitignore`, replace the first two blocks:

```gitignore
# dependencies
node_modules
.pnp
.pnp.js

# next.js build output
.next/
out/
build/
```

Leave every other line untouched.

- [ ] **Step 6: Install and verify the move**

```bash
npm install
npm test 2>&1 | tail -5
npm run typecheck
npm run build 2>&1 | tail -20
```

Expected: `npm install` creates one root `package-lock.json` and a root `node_modules` with `apps/web` hoisted into it; vitest reports the same 141 passing tests as Step 1; typecheck is silent; `next build` completes with a route table including `/`, `/dashboard`, `/login`, `/workout/[id]`.

- [ ] **Step 7: Verify the dev server still runs through the launch config**

Start the preview with the `gymtrack-dev` configuration from `.claude/launch.json` (it runs the root `npm run dev`, which now proxies into `apps/web`). Load `/` and confirm it redirects to `/login` — that redirect is proof the middleware and the Supabase env vars in `apps/web/.env.local` are both being read from the new location. Check the server logs for compile errors.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "refactor: move Next.js app into apps/web under npm workspaces"
```

---

## Task 2: Extract `packages/core` and rewire the web app's imports

> **Since 2026-09-23 (dashboard phase 1):** `src/lib/dashboard-weeks.ts`,
> `dashboard-heatmap.ts`, `records.ts` and `src/lib/data/dashboard.ts` stay in
> `apps/web` — the dashboard is not in the native v1 scope (spec D7). They import
> `@/lib/dates`, `@/lib/sets`, `@/lib/types` and `@/lib/workout-summary`, which
> this task moves to `@gymtrack/core`, so the import rewiring must include them.
> `dates.ts` gained `addDays`/`mondayOf` and `workout-summary.ts` gained
> `formatMovedWeight`; both move with their modules.

> **Why this is still worth doing with the native fork open.** The original
> justification was "so the mobile app can import it" — true for React Native,
> **void for Swift**, which cannot import a TypeScript package. The decision
> survives on two grounds that do not depend on the fork:
>
> 1. **Asymmetric cost.** Doing this now and later choosing Swift wastes about an
>    hour of directory structure. *Not* doing it and later choosing React Native
>    means migrating a shared package out from under a running second app.
> 2. **It is right for the web app alone.** The 83 moved tests run in milliseconds
>    without booting Next, and the business rules live in one auditable place.
>
> On the Swift branch `packages/core` becomes an *executable specification*
> rather than a dependency: the Epley formula, ghost-value index mapping, German
> decimal formatting, Europe/Berlin date handling and validation bounds stated
> once, with 83 tests that become the conformance checklist for a Swift port.
> That is real, and weaker than direct reuse. Execute this task either way.

**Files:**
- Create: `packages/core/package.json`, `packages/core/tsconfig.json`, `packages/core/vitest.config.ts`, `packages/core/src/index.ts`
- Move: `apps/web/src/lib/{types,sets,dates,validation,exercise-search,workout-summary}.ts` → `packages/core/src/`
- Move: `apps/web/src/lib/{sets,dates,validation,exercise-search,workout-summary}.test.ts` → `packages/core/src/`
- Modify: `apps/web/next.config.ts`, `apps/web/package.json`, and the **14 files** carrying the **26 import lines** listed in Step 9
- Delete: `apps/web/vitest.config.js`

**Interfaces:**
- Consumes: the `apps/web` workspace from Task 1.
- Produces: `@gymtrack/core` exporting, from `./src/index.ts`:
  - types `SetRecord`, `LastPerformance`, `ExerciseOption`, `WorkoutSummary`, `WorkoutExerciseDetail`, `WorkoutDetail`, `GhostValue`
  - `ghostForPosition(last: LastPerformance, index: number): GhostValue | null`
  - `formatWeight(kg: number): string`, `formatSetSummary`, `nextPosition`
  - `localDateString(date: Date): string`, `startOfWeekMonday`, `todayInAppTimezone`, `formatPerformedOn`
  - zod schemas `setInputSchema`, `workoutMetaSchema`, `exerciseNameSchema`, `authEmailSchema`, `authNameSchema`
  - `type ExercisePickerOption`, `sortByRecency`, `filterExercises`
  - `type ExerciseSummary`, `type WorkoutSummaryStats`, `summarizeWorkout`, `formatKilos`, `formatVolume`

  The exact export list must be read off the moved files, not guessed — re-export everything each module currently exports.

- [ ] **Step 1: Create the package manifest**

Create `packages/core/package.json`. Pointing `main`/`types`/`exports` at raw `.ts` means no build step: Next transpiles it via `transpilePackages`, and Metro would do the same for a future React Native app.

```json
{
  "name": "@gymtrack/core",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "zod": "^4.4.3"
  },
  "devDependencies": {
    "typescript": "^5",
    "vitest": "^1.0.4"
  }
}
```

- [ ] **Step 2: Create the package tsconfig**

Create `packages/core/tsconfig.json`. No `dom` lib and no `jsx` — this package must stay environment-agnostic, and dropping `dom` makes an accidental `window` reference a compile error.

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020"],
    "module": "esnext",
    "moduleResolution": "bundler",
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "isolatedModules": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 3: Create the package vitest config**

Create `packages/core/vitest.config.ts`. The `vite-tsconfig-paths` plugin is deliberately dropped — inside the package all imports become relative, so there are no path aliases left to resolve.

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
```

- [ ] **Step 4: Move the modules and their tests**

```bash
mkdir -p packages/core/src
git mv apps/web/src/lib/types.ts \
       apps/web/src/lib/sets.ts \
       apps/web/src/lib/dates.ts \
       apps/web/src/lib/validation.ts \
       apps/web/src/lib/exercise-search.ts \
       apps/web/src/lib/workout-summary.ts \
       packages/core/src/
git mv apps/web/src/lib/sets.test.ts \
       apps/web/src/lib/dates.test.ts \
       apps/web/src/lib/validation.test.ts \
       apps/web/src/lib/exercise-search.test.ts \
       apps/web/src/lib/workout-summary.test.ts \
       packages/core/src/
git rm apps/web/vitest.config.js
```

- [ ] **Step 5: Rewrite intra-package imports as relative**

Eight files inside `packages/core/src/` still use the `@/lib/...` alias, which no longer exists here. Line numbers are against `24e6c2d`; trust the grep in the next step over the numbers:

- `sets.ts:1` — `from "@/lib/types"` → `"./types"`
- `exercise-search.ts:1` — `from "@/lib/types"` → `"./types"`
- `workout-summary.ts:1` — `from "@/lib/types"` → `"./types"`
- `sets.test.ts` — `"@/lib/sets"` → `"./sets"`, `"@/lib/types"` → `"./types"`
- `dates.test.ts:2` — `"@/lib/dates"` → `"./dates"`
- `validation.test.ts:9` — `"@/lib/validation"` → `"./validation"`
- `exercise-search.test.ts:3-4` — both `"@/lib/exercise-search"` → `"./exercise-search"`
- `workout-summary.test.ts:3-4` — `"@/lib/workout-summary"` → `"./workout-summary"`, `"@/lib/types"` → `"./types"`

Verify none are left:

```bash
grep -rn "@/lib" packages/core/src/ && echo "STILL ALIASED" || echo "CLEAN"
```

Expected: `CLEAN`.

- [ ] **Step 6: Write the barrel**

Create `packages/core/src/index.ts`. Read each module's actual `export` statements and re-export all of them — do not abbreviate.

```ts
export * from "./types";
export * from "./dates";
export * from "./sets";
export * from "./validation";
export * from "./exercise-search";
export * from "./workout-summary";
```

`export *` does not forward type-only exports in every configuration, so confirm the type names survive in Step 8's typecheck. If a type goes missing, add an explicit `export type { ... } from "./types";` line.

- [ ] **Step 7: Run the package tests in their new home**

```bash
npm test --workspace packages/core 2>&1 | tail -5
```

Expected: PASS, `Tests  83 passed (83)` — dates 12, sets 17, validation 25, exercise-search 14, workout-summary 15. The remaining 58 are in `apps/web` (swipe-gesture 22, dashboard-weeks 17, dashboard-heatmap 12, records 7). If `vitest` is not found, run `npm install` at the root first so the workspace dependency is linked.

- [ ] **Step 8: Point the web app at the package**

Add the dependency to `apps/web/package.json`. `*` is the npm-workspaces convention for "the local workspace, whatever version it claims":

```json
"dependencies": {
  "@gymtrack/core": "*",
```

Then tell Next to transpile it, since it ships as `.ts` rather than compiled JS. Replace `apps/web/next.config.ts` entirely:

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @gymtrack/core is published as raw TypeScript source (no build step),
  // so Next has to run it through its own compiler rather than assume
  // node_modules is pre-compiled JavaScript.
  transpilePackages: ["@gymtrack/core"],
};

export default nextConfig;
```

Then relink:

```bash
npm install
```

- [ ] **Step 9: Rewrite the web app's imports**

Replace every `@/lib/{types,sets,dates,validation,exercise-search,workout-summary}` specifier with `@gymtrack/core`. Verified against `24e6c2d`: **26 lines across 14 files**.

```
src/app/page.tsx                                  dates
src/app/login/actions.ts                          validation
src/app/workout/actions.ts                        dates, sets, types, validation
src/app/workout/[id]/page.tsx                     dates, sets, workout-summary
src/components/workout/end-workout-button.tsx     workout-summary ×2
src/components/workout/exercise-card.tsx          types
src/components/workout/exercise-picker.tsx        exercise-search ×2
src/components/workout/set-list.tsx               sets, types
src/components/workout/set-row.tsx                sets ×2
src/components/workout/start-workout-button.tsx   dates
src/components/workout/workout-header.tsx         dates
src/components/workout/workout-list.tsx           dates, types
src/lib/data/exercises.ts                         exercise-search ×2, types
src/lib/data/workouts.ts                          types
```

Several files import from two or more modules (`workout/actions.ts` from four). Merge those into a single `@gymtrack/core` import per file rather than leaving duplicate specifiers — ESLint's `no-duplicate-imports` will otherwise flag them. Keep `import type` on the lines that have it.

Mechanical first pass, then fix the duplicates by hand:

```bash
cd apps/web && grep -rl "@/lib/\(types\|sets\|dates\|validation\|exercise-search\|workout-summary\)" src \
  | xargs sed -i '' 's|"@/lib/\(types\|sets\|dates\|validation\|exercise-search\|workout-summary\)"|"@gymtrack/core"|g'
```

- [ ] **Step 10: Verify no stale references remain**

```bash
grep -rn "@/lib/\(types\|sets\|dates\|validation\|exercise-search\|workout-summary\)" apps/web/src && echo "STALE" || echo "CLEAN"
```

Expected: `CLEAN`. `@/lib/utils`, `@/lib/supabase/*`, `@/lib/data/*`, `@/lib/site-url` and `@/lib/swipe-gesture` stay where they are and must still appear in other greps — they are web-only.

- [ ] **Step 11: Full verification**

```bash
npm test 2>&1 | tail -10
npm run typecheck
npm run lint
npm run build 2>&1 | tail -20
```

Expected: 141 tests still pass, now split 83 in `packages/core` and 58 in `apps/web`; typecheck and lint silent, build succeeds with the same route table as Task 1 Step 6.

- [ ] **Step 12: Verify at runtime, not just at build time**

Start the dev server and exercise the one flow that touches every moved module: log in, start a workout, add an exercise (the picker's recency ordering is `exercise-search.ts`), log a set, then end the workout (the summary is `workout-summary.ts`). Ghost values come from `sets.ts`, German weight formatting from `formatWeight`, the date header from `dates.ts`, set validation from `validation.ts`. A green build with a broken barrel export is possible; this step is what catches it.

- [ ] **Step 13: Commit**

```bash
git add -A
git commit -m "refactor: extract shared logic into @gymtrack/core workspace package"
```

---

## Task 3: Repoint Vercel at `apps/web` (manual — Dominik)

Claude cannot do this: per project memory the Vercel MCP returns 404s for this project, and pushes to `main` are blocked by the permission classifier. Deploys will fail until this is done, because Vercel will look for a Next.js app at the repo root and find a workspace stub.

**Files:** none in the repo. `apps/web/vercel.json` already carries `{"framework": "nextjs"}` and moved with the app in Task 1 — that is where Vercel expects it once Root Directory is set.

- [ ] **Step 1: Change the Root Directory**

In the browser at `vercel.com/dominiks-projects-5848510f/gym-tracking-app` → Settings → Build and Deployment → Root Directory: set to `apps/web` and save. Leave "Include files outside the root directory" **enabled** — the build needs `packages/core`, which lives above `apps/web`.

- [ ] **Step 2: Confirm the framework preset**

Same settings page: Framework Preset must read **Next.js**. This project has regressed to a `build/`-output preset before; `apps/web/vercel.json` should now pin it, but confirm visually.

- [ ] **Step 3: Push the branch and watch the Preview build**

```bash
git push origin staging
```

Expected: the Preview deployment at `gym-tracking-app-git-staging-dominiks-projects-5848510f.vercel.app` builds green. If it fails with "No Next.js version detected", Root Directory did not save — repeat Step 1.

- [ ] **Step 4: Verify the deployed app**

Open the staging URL (Vercel Authentication will prompt for login — expected, Standard Protection is on) and confirm `/` redirects to `/login`. That proves env vars still resolve from the new root.

- [ ] **Step 5: Merge to production when green**

```bash
git checkout main && git merge --ff-only staging && git push origin main
```

---

# Phase 2 — Installable PWA

## Task 4: Generate the app icons

iOS ignores the manifest's `icons` array for the home-screen glyph and uses `<link rel="apple-touch-icon">` at 180×180 — so both paths must exist. `public/` currently holds only leftover `create-next-app` SVGs; there is no icon to reuse.

**Files:**
- Create: `apps/web/public/icon-source.svg`, `apps/web/scripts/generate-icons.mjs`
- Create (generated): `apps/web/public/icon-192.png`, `icon-512.png`, `icon-512-maskable.png`, `apple-touch-icon.png`
- Modify: `apps/web/package.json` (add `sharp` to devDependencies)
- Delete: `apps/web/public/{file,globe,next,vercel,window}.svg`

**Interfaces:**
- Consumes: nothing.
- Produces: four PNGs at the paths above, referenced by name in Task 5.

- [ ] **Step 1: Author the source glyph**

Create `apps/web/public/icon-source.svg` — a dumbbell in the theme's lime primary on the app background. 512×512 with the glyph inside the middle 60%, so the maskable variant survives iOS's and Android's circular crops.

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <rect width="512" height="512" fill="#111317"/>
  <g stroke="#b8f43d" stroke-width="26" stroke-linecap="round" fill="none">
    <line x1="176" y1="256" x2="336" y2="256"/>
    <line x1="152" y1="206" x2="152" y2="306"/>
    <line x1="360" y1="206" x2="360" y2="306"/>
    <line x1="112" y1="226" x2="112" y2="286"/>
    <line x1="400" y1="226" x2="400" y2="286"/>
  </g>
</svg>
```

`#b8f43d` is `hsl(84 85% 55%)`, the existing `--primary`.

- [ ] **Step 2: Add the rasteriser dependency**

```bash
npm install --save-dev --workspace apps/web sharp
```

- [ ] **Step 3: Write the generation script**

Create `apps/web/scripts/generate-icons.mjs`:

```js
// Rasterises public/icon-source.svg into the PNG sizes iOS and Android need.
// Run manually after editing the SVG: node scripts/generate-icons.mjs
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import sharp from "sharp";

const publicDir = join(dirname(fileURLToPath(import.meta.url)), "..", "public");
const source = await readFile(join(publicDir, "icon-source.svg"));

// apple-touch-icon must be exactly 180x180 and must not be transparent —
// iOS composites it on a white card otherwise.
const targets = [
  { file: "icon-192.png", size: 192 },
  { file: "icon-512.png", size: 512 },
  { file: "icon-512-maskable.png", size: 512 },
  { file: "apple-touch-icon.png", size: 180 },
];

for (const { file, size } of targets) {
  const png = await sharp(source)
    .resize(size, size)
    .flatten({ background: "#111317" })
    .png()
    .toBuffer();
  await writeFile(join(publicDir, file), png);
  console.log(`wrote ${file} (${size}x${size}, ${png.length} bytes)`);
}
```

- [ ] **Step 4: Generate and verify the dimensions**

```bash
cd apps/web && node scripts/generate-icons.mjs
```

Expected: four `wrote …` lines. Then confirm the bytes on disk really carry those dimensions:

```bash
cd apps/web && node -e "
const sharp=require('sharp');
for (const f of ['icon-192.png','icon-512.png','icon-512-maskable.png','apple-touch-icon.png']) {
  sharp('public/'+f).metadata().then(m=>console.log(f, m.width+'x'+m.height, 'alpha='+m.hasAlpha));
}"
```

Expected: `192x192`, `512x512`, `512x512`, `180x180`, each with `alpha=false`.

- [ ] **Step 5: Remove the create-next-app leftovers**

```bash
cd apps/web && git rm public/file.svg public/globe.svg public/next.svg public/vercel.svg public/window.svg
```

Confirm nothing referenced them:

```bash
grep -rn "file.svg\|globe.svg\|next.svg\|vercel.svg\|window.svg" apps/web/src && echo "REFERENCED" || echo "UNUSED"
```

Expected: `UNUSED`.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(pwa): add app icons and remove scaffold assets"
```

---

## Task 5: Web app manifest and iOS home-screen metadata

**Files:**
- Create: `apps/web/src/app/manifest.ts`
- Modify: `apps/web/src/app/layout.tsx`

**Interfaces:**
- Consumes: the PNG filenames from Task 4.
- Produces: a `/manifest.webmanifest` route and the `<meta>`/`<link>` tags iOS needs. Task 6 depends on `viewportFit: "cover"` being set here.

- [ ] **Step 1: Write the manifest**

Create `apps/web/src/app/manifest.ts`:

```ts
import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "GymTrack — Dein Trainings-Log",
    short_name: "GymTrack",
    description: "Trainings schnell und einhändig protokollieren.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#111317",
    theme_color: "#111317",
    lang: "de",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
```

- [ ] **Step 2: Add the viewport and Apple metadata**

In `apps/web/src/app/layout.tsx`, add a `Viewport` import and a `viewport` export, and extend the existing `metadata`. Do not move `themeColor` into `metadata` — in Next 16 it belongs to the `viewport` export and is a type error on `Metadata`.

```tsx
import type { Metadata, Viewport } from "next";

export const viewport: Viewport = {
  themeColor: "#111317",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  // Lets the app paint into the notch and home-indicator areas. Task 6 adds
  // the safe-area padding that keeps content out from under them.
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: "GymTrack",
  description: "Dein Trainings-Log",
  applicationName: "GymTrack",
  appleWebApp: {
    capable: true,
    title: "GymTrack",
    // The status bar area becomes part of the page, which is what makes an
    // installed PWA look full-bleed rather than letterboxed.
    statusBarStyle: "black-translucent",
  },
  icons: {
    apple: "/apple-touch-icon.png",
  },
};
```

- [ ] **Step 3: Verify the manifest is served correctly**

```bash
npm run build && npm run start
```

Then, in another shell:

```bash
curl -s localhost:3000/manifest.webmanifest | head -20
```

Expected: the JSON above, served with `content-type: application/manifest+json`. Then confirm the head tags:

```bash
curl -s localhost:3000/login | grep -o '<meta name="theme-color"[^>]*>\|<link rel="manifest"[^>]*>\|<link rel="apple-touch-icon"[^>]*>\|<meta name="apple-mobile-web-app-capable"[^>]*>'
```

Expected: all four present.

- [ ] **Step 4: Verify installability in the browser**

Open the running app in the preview browser, then check the manifest parsed without warnings:

```js
await fetch('/manifest.webmanifest').then(r => r.json())
```

Expected: the parsed object with three icons. A 404 here means the file is in the wrong directory — `manifest.ts` must sit directly in `src/app/`, not in a route group.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(pwa): add web app manifest and iOS home-screen metadata"
```

---

## Task 6: Respect the safe-area insets

`viewport-fit: cover` from Task 5 means the page now extends under the notch and the home indicator. The fixed tab bar currently sits flush at `bottom-0`, so on an iPhone 15 Pro its labels land under the home indicator. This task is what stops the installed app from looking broken.

**Files:**
- Modify: `apps/web/src/app/layout.tsx`, `apps/web/src/components/nav/bottom-tabs.tsx`

**Interfaces:**
- Consumes: `viewportFit: "cover"` from Task 5.
- Produces: no new exports.

- [ ] **Step 1: Pad the tab bar's inner row**

`bottom-tabs.tsx` still holds exactly two tabs, now `/` ("Verlauf") and `/dashboard` — the Today/History merge in `a304779` replaced one pair with another. The `TABS` array is not touched by this task and the `<nav>` element below is byte-identical to what is in the file.

The `<nav>` keeps `fixed inset-x-0 bottom-0` so its background still bleeds to the screen edge; the padding goes on the inner row so the touch targets move up but the colour does not stop short:

```tsx
<nav className="fixed inset-x-0 bottom-0 border-t border-border bg-card pb-[env(safe-area-inset-bottom)]">
```

- [ ] **Step 2: Extend the body's bottom padding by the same inset**

In `layout.tsx`, the existing `pb-20` reserves 5rem for the tab bar but does not know about the indicator. Replace it:

```tsx
{/* pb keeps the fixed tab bar from covering content: 5rem for the bar
    itself, plus the home-indicator inset that viewport-fit=cover exposes. */}
<body className="min-h-full flex flex-col pb-[calc(5rem+env(safe-area-inset-bottom))]">
```

- [ ] **Step 3: Verify the computed padding resolves**

Run the dev server, open the app, and read the computed values:

```js
[getComputedStyle(document.body).paddingBottom,
 getComputedStyle(document.querySelector('nav')).paddingBottom]
```

Expected on a desktop browser: `["80px", "0px"]` — `env()` resolves to `0` with no notch, which is the correct no-op. The value that matters is that it is **not** an empty string or `auto`; either of those means Tailwind did not emit the arbitrary value and the class name has a typo.

- [ ] **Step 4: Verify in an emulated iPhone viewport**

Resize the preview to the mobile preset, reload, and screenshot. The tab bar labels must be fully visible and horizontally centred, with the bar's background still reaching the bottom edge of the screen.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "fix(pwa): keep the tab bar clear of the home indicator"
```

---

## Task 7: Offline-aware UI and automatic Server Action retry

Next 16 ships `experimental.useOffline`: a Server Action whose fetch fails on a dead connection no longer rejects — it stays pending and re-runs when connectivity returns. That is exactly the gym-basement case `CONCEPT.md` §2.8 describes, without building a sync engine.

**This does not replace the existing retry logic in `set-list.tsx`.** The flag intercepts *transport* failures. An action that returns `{ ok: false, kind: "transient" }` is a *successful* HTTP request carrying a database failure, and `set-list.tsx` is still the only thing that handles it. Do not delete that code.

**Files:**
- Modify: `apps/web/next.config.ts`, `apps/web/src/app/layout.tsx`
- Create: `apps/web/src/components/pwa/offline-banner.tsx`, `apps/web/src/app/loading.tsx`, `apps/web/src/app/dashboard/loading.tsx`, `apps/web/src/app/workout/[id]/loading.tsx`

**Interfaces:**
- Consumes: `transpilePackages` already present in `next.config.ts` from Task 2 — extend that object, do not replace it.
- Produces: `<OfflineBanner />`, a client component taking no props.

- [ ] **Step 1: Enable the flag**

In `apps/web/next.config.ts`, add the `experimental` block alongside the existing `transpilePackages`:

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@gymtrack/core"],
  experimental: {
    // Failed navigations and Server Actions stay pending and retry when the
    // connection returns, instead of rejecting. See CONCEPT.md §2.8 —
    // never lose a logged set to bad gym reception.
    useOffline: true,
  },
};

export default nextConfig;
```

- [ ] **Step 2: Write the offline banner**

Create `apps/web/src/components/pwa/offline-banner.tsx`:

```tsx
"use client";

import { useOffline } from "next/offline";

/**
 * `useOffline` is more trustworthy than `navigator.onLine`, which reports true
 * for a phone on gym WiFi that has no route upstream. It flips on a failed
 * framework fetch as well as on the browser's `offline` event.
 */
export function OfflineBanner() {
  const isOffline = useOffline();

  if (!isOffline) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-0 top-0 z-50 bg-destructive px-4 py-2 text-center text-sm text-foreground"
      style={{ paddingTop: "calc(0.5rem + env(safe-area-inset-top))" }}
    >
      Offline – Eingaben werden gesendet, sobald du wieder Empfang hast.
    </div>
  );
}
```

Note the colour pairing: `globals.css` maps `--color-destructive` inside its `@theme inline` block, but **not** `--color-destructive-foreground`. In Tailwind v4 an unmapped token generates no class, so `text-destructive-foreground` would silently produce unstyled text. `text-foreground` is mapped and reads correctly on the red — use it.

- [ ] **Step 3: Mount it in the root layout**

In `layout.tsx`, import and render it as the first child of `<body>`, above `{children}`:

```tsx
import { OfflineBanner } from "@/components/pwa/offline-banner";
```

```tsx
<body className="min-h-full flex flex-col pb-[calc(5rem+env(safe-area-inset-bottom))]">
  <OfflineBanner />
  {children}
  <BottomTabs />
</body>
```

- [ ] **Step 4: Add the loading shells the retry needs**

The docs are explicit: offline navigation only works into a route whose shell has been prefetched, and `loading.tsx` is what defines that shell without adopting Cache Components. Create three files.

`apps/web/src/app/loading.tsx`:

```tsx
export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-md flex-1 px-4 py-6">
      <div className="h-8 w-40 animate-pulse rounded bg-card" />
      <div className="mt-4 h-24 animate-pulse rounded bg-card" />
    </main>
  );
}
```

`apps/web/src/app/dashboard/loading.tsx` and `apps/web/src/app/workout/[id]/loading.tsx`: same content. Duplicating eight lines is cheaper here than a shared component, and each route is free to diverge later.

There is no `/history` route. `a304779` merged Today and History into the single Verlauf screen at `/`, and `/dashboard` took the second tab. The three routes worth a shell are `/`, `/dashboard` and `/workout/[id]`; `/login` needs none, since it is never reached by a soft navigation from inside the app.

- [ ] **Step 5: Verify the flag took effect**

The docs warn that dev mode is not a reliable reference for offline behaviour — build and start for real:

```bash
npm run build && npm run start
```

Expected: the build log shows no unknown-option warning for `experimental.useOffline`. A warning here means the key is misspelled or this Next version predates the flag — check `node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/useOffline.md` exists before debugging further.

- [ ] **Step 6: Verify the banner appears and the retry works**

With the production server running, log in and open a workout. Then, in the preview browser:

```js
window.dispatchEvent(new Event('offline'))
```

Expected: the German offline banner appears at the top within a second.

Now the real test. Put the browser in offline mode via DevTools (not just the event), type a set, and submit it. Expected: the row stays in its pending state and does **not** show the `Speichern fehlgeschlagen` error. Restore connectivity. Expected: the set commits on its own, with no tap from you, and the banner disappears.

- [ ] **Step 7: Confirm the existing retry path is untouched**

```bash
grep -c "transient" apps/web/src/components/workout/set-list.tsx apps/web/src/app/workout/actions.ts
```

Expected: non-zero for both. If either is zero, the `kind: "transient"` handling was deleted — restore it.

- [ ] **Step 8: Run the full suite**

```bash
npm test 2>&1 | tail -5
npm run typecheck
npm run lint
```

Expected: 141 tests still passing, typecheck and lint silent.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(pwa): retry blocked requests and surface offline state"
```

---

## Task 8: Warn about magic links inside the installed app

> **Scope reduced after re-checking the tree.** This task was written to reorder
> the login forms so password came first inside standalone mode. **That is
> already done** — commit `0c4b1b4` made password the default for both forms,
> and `auth-card.tsx` says so in its own comment: *"Password is the default for
> both forms; magic link is the secondary, passwordless fallback."* Both
> `signupUsePassword` and `loginUsePassword` initialise to `true` unless an
> error arrived from the magic path itself.
>
> The hazard is therefore already mitigated for the default path: you no longer
> reach for a magic link without deliberately switching to it. What remains is
> the narrow case — you *do* switch to the magic sub-form while running as an
> installed app, and get stranded with no visible cause. This task adds a
> warning there and nothing else.
>
> **It is legitimate to skip this task entirely.** It buys one sentence of
> explanation for a path you have to go out of your way to reach. Decide before
> executing rather than during.

**Files:**
- Create: `packages/core/src/pwa.ts`, `packages/core/src/pwa.test.ts`
- Modify: `packages/core/src/index.ts`, `apps/web/src/components/auth/auth-card.tsx`

**Interfaces:**
- Consumes: `@gymtrack/core` from Task 2.
- Produces: `magicLinkWillStrand(env: DisplayEnvironment): boolean` and
  `type DisplayEnvironment = { isIOS: boolean; isStandalone: boolean }`, both
  exported from `@gymtrack/core`.

The predicate takes its inputs as an argument rather than reading `navigator`
itself. That keeps it pure, keeps `packages/core` free of DOM types per the
Global Constraints, and lets the component do the reading.

- [ ] **Step 1: Write the failing test**

Create `packages/core/src/pwa.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { magicLinkWillStrand } from "./pwa";

describe("magicLinkWillStrand", () => {
  it("strands the user inside an installed iOS app", () => {
    expect(magicLinkWillStrand({ isIOS: true, isStandalone: true })).toBe(true);
  });

  it("is fine in mobile Safari, where the redirect lands in the same browser", () => {
    expect(magicLinkWillStrand({ isIOS: true, isStandalone: false })).toBe(false);
  });

  it("is fine in an installed non-iOS app, which shares its cookie jar", () => {
    expect(magicLinkWillStrand({ isIOS: false, isStandalone: true })).toBe(false);
  });

  it("is fine on the desktop web", () => {
    expect(magicLinkWillStrand({ isIOS: false, isStandalone: false })).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npm test --workspace packages/core 2>&1 | tail -15
```

Expected: FAIL — `Failed to resolve import "./pwa"`.

- [ ] **Step 3: Implement**

Create `packages/core/src/pwa.ts`:

```ts
/** What the client knows about how it is being displayed. Passed in rather
 *  than read here, so this module stays free of DOM globals. */
export type DisplayEnvironment = {
  isIOS: boolean;
  isStandalone: boolean;
};

/**
 * True when following a magic link would leave the user logged out.
 *
 * An installed iOS PWA keeps a cookie jar separate from Safari's. The link in
 * the email opens in Safari, so the session is created there and the installed
 * app never sees it — the user taps the link, sees "logged in", returns to the
 * app and is still at the login screen, with nothing on screen explaining why.
 * Other platforms share cookies between the installed app and the browser, so
 * the round trip completes normally there.
 */
export function magicLinkWillStrand(env: DisplayEnvironment): boolean {
  return env.isIOS && env.isStandalone;
}
```

- [ ] **Step 4: Run it and watch it pass**

```bash
npm test --workspace packages/core 2>&1 | tail -10
```

Expected: PASS, `Tests  87 passed (87)` — the 83 from Task 2 plus these four.

- [ ] **Step 5: Export it from the barrel**

Add to `packages/core/src/index.ts`:

```ts
export * from "./pwa";
```

- [ ] **Step 6: Show the warning on the magic sub-form**

`auth-card.tsx` is already a `"use client"` component holding `mode`,
`signupUsePassword` and `loginUsePassword` state, so this is an edit in place.

Detection must run in an effect, not during render: it touches `navigator` and
`matchMedia`, which do not exist during SSR, and the first render must match the
server's HTML or React logs a hydration mismatch.

```tsx
import { useEffect, useState } from "react";
import { magicLinkWillStrand } from "@gymtrack/core";

// ...inside the component:
const [magicStrands, setMagicStrands] = useState(false);

useEffect(() => {
  setMagicStrands(
    magicLinkWillStrand({
      isIOS: /iPad|iPhone|iPod/.test(navigator.userAgent),
      isStandalone: window.matchMedia("(display-mode: standalone)").matches,
    })
  );
}, []);
```

Render this inside each magic-link sub-form — the branches guarded by
`!signupUsePassword` and `!loginUsePassword` — and nowhere else:

```tsx
{magicStrands && (
  <p className="text-xs text-muted-foreground">
    Der Link öffnet sich in Safari, nicht in dieser App. Du bleibst hier dann
    abgemeldet – nimm lieber dein Passwort.
  </p>
)}
```

`useState(false)` means the server-rendered output is unchanged, so nothing
shifts for web visitors.

- [ ] **Step 7: Verify both states**

Run the dev server and open `/login`. Expected: the password form, unchanged, no
note. Switch to the magic sub-form: still no note, because a desktop browser is
neither iOS nor standalone.

Then temporarily hard-code `setMagicStrands(true)`, reload, and switch to the
magic sub-form. Expected: the German warning appears there, and **only** there —
not on the password form. Undo the hard-coding before committing.

- [ ] **Step 8: Check the console for hydration warnings**

Read the browser console. Expected: no "Hydration failed" or "Text content did
not match" entries. Any such warning means the detection leaked into render —
move it into the effect.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(pwa): warn that magic links strand the installed iOS app"
```

---

## Task 9: Service worker for static assets and an offline fallback

Deliberately narrow. **Do not cache HTML or RSC payloads.** A cached RSC payload serves a stale workout — exactly the data you cannot afford to be wrong about mid-session — and Next's streaming responses do not survive naive `cache.put()`. Caching only content-hashed `/_next/static/*` is safe by construction: those URLs change whenever their content does.

Installability does not require this task; the Next PWA guide notes install prompts work without offline support. Its value is fast repeat launches and a comprehensible screen instead of Safari's dinosaur.

**Files:**
- Create: `apps/web/public/sw.js`, `apps/web/src/app/offline/page.tsx`, `apps/web/src/components/pwa/register-sw.tsx`
- Modify: `apps/web/src/app/layout.tsx`, `apps/web/next.config.ts`, `apps/web/src/middleware.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks except the layout.
- Produces: `<RegisterSW />`, a client component taking no props and rendering nothing.

- [ ] **Step 1: Write the offline fallback page**

Create `apps/web/src/app/offline/page.tsx`. It must be fully static — no Supabase call, no `cookies()` — or it cannot be pre-cached.

```tsx
export default function OfflinePage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-3 px-4 py-6 text-center">
      <h1 className="text-xl font-semibold">Kein Empfang</h1>
      <p className="text-sm text-muted-foreground">
        GymTrack braucht kurz Verbindung. Sobald du wieder Empfang hast, lädt
        die Seite von selbst weiter.
      </p>
    </main>
  );
}
```

- [ ] **Step 2: Let `/offline` through the auth middleware**

`middleware.ts` redirects every unauthenticated request to `/login`, which would make the fallback unreachable exactly when it is needed. Extend `isPublicPath`:

```ts
const isPublicPath =
  request.nextUrl.pathname.startsWith("/login") ||
  request.nextUrl.pathname.startsWith("/offline") ||
  request.nextUrl.pathname.startsWith("/auth/confirm");
```

- [ ] **Step 3: Write the service worker**

Create `apps/web/public/sw.js`:

```js
// Scope is deliberately narrow: content-hashed build assets and the offline
// page only. HTML and RSC payloads are never cached — a stale workout is
// worse than no workout, and Next's streamed responses do not round-trip
// through the Cache API intact.
const CACHE = "gymtrack-static-v1";
const OFFLINE_URL = "/offline";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll([OFFLINE_URL])).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Content-hashed and immutable: cache-first is always correct here.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((response) => {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
            return response;
          })
      )
    );
    return;
  }

  // Page loads: always go to the network, fall back to the offline page only
  // when the network is genuinely unreachable.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match(OFFLINE_URL))
    );
  }
});
```

- [ ] **Step 4: Write the registration component**

Create `apps/web/src/components/pwa/register-sw.tsx`:

```tsx
"use client";

import { useEffect } from "react";

/** Registers the service worker after mount. Renders nothing. */
export function RegisterSW() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .catch((error) => console.error("service worker registration failed", error));
  }, []);

  return null;
}
```

- [ ] **Step 5: Mount it**

In `layout.tsx`, import and render `<RegisterSW />` next to `<OfflineBanner />`:

```tsx
import { RegisterSW } from "@/components/pwa/register-sw";
```

```tsx
<body className="min-h-full flex flex-col pb-[calc(5rem+env(safe-area-inset-bottom))]">
  <OfflineBanner />
  <RegisterSW />
  {children}
  <BottomTabs />
</body>
```

- [ ] **Step 6: Send the right headers for `sw.js`**

A cached service worker cannot be replaced, which makes a bad deploy permanent. Add a `headers()` block to `apps/web/next.config.ts`, keeping the existing keys:

```ts
const nextConfig: NextConfig = {
  transpilePackages: ["@gymtrack/core"],
  experimental: {
    useOffline: true,
  },
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          // Never cache the worker itself, or a broken one can never be
          // replaced on devices that already fetched it.
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
};
```

- [ ] **Step 7: Verify registration over HTTPS**

Service workers need a secure context. `localhost` counts, but test the way the phone will see it:

```bash
npm run build && npm run start
```

In the preview browser:

```js
await navigator.serviceWorker.getRegistration().then(r => r && r.active && r.active.state)
```

Expected: `"activated"`. `undefined` means registration failed — read the console for the error thrown in Step 4's `.catch`.

- [ ] **Step 8: Verify the offline fallback and that pages are not cached**

Go offline in DevTools and reload. Expected: the German "Kein Empfang" page, not Safari's error page. Go back online, reload, and confirm the real page returns.

Then confirm nothing dangerous was cached:

```js
await caches.open('gymtrack-static-v1').then(c => c.keys()).then(ks => ks.map(k => new URL(k.url).pathname))
```

Expected: `/offline` plus `/_next/static/...` entries only. **If any workout, dashboard, or login path appears in that list, the fetch handler is wrong — fix it before committing.** Serving a cached workout page would show stale sets.

- [ ] **Step 9: Full suite**

```bash
npm test 2>&1 | tail -5
npm run typecheck
npm run lint
```

Expected: 145 tests passing (141 after dashboard phase 1 + 4 from Task 8), split 87 in `packages/core` and 58 in `apps/web`; typecheck and lint silent.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat(pwa): cache static assets and serve an offline fallback"
```

---

## Task 10: Install it on the iPhone 15 Pro (manual — Dominik)

**Files:** none.

- [ ] **Step 1: Ship to production**

```bash
git push origin staging
```

Merge to `main` once the Preview build is green, as in Task 3 Step 5. HTTPS is required for service workers and for Add to Home Screen — the Vercel production domain provides it; `localhost` will not help here. Note that staging sits behind Vercel Authentication, which interferes with installation; use the production URL.

- [ ] **Step 2: Install**

On the iPhone, open `gym-tracking-app-kohl.vercel.app` **in Safari** (Chrome on iOS cannot add to the home screen). Share → Add to Home Screen → Add.

- [ ] **Step 3: Verify it looks installed**

Launch from the home screen. Confirm all four:

1. The icon is the lime dumbbell, not a screenshot of the page.
2. There is no Safari address bar or toolbar.
3. The tab bar labels sit clear of the home indicator.
4. The status bar area is dark, matching the app background.

- [ ] **Step 4: Verify login works in standalone**

Sign in. The password form should be first, with the German note about magic links. Confirm the session survives closing and relaunching the app.

- [ ] **Step 5: Verify the real-world case**

At the gym, or with airplane mode on: log a set. Expected: the row sits pending without an error. Turn the connection back on. Expected: the set commits on its own. Then check the web app in a desktop browser — the same set is there, because it is the same database. That is D4 from the spec, confirmed end to end.

- [ ] **Step 6: Record the outcome**

Note what the PWA cannot do that you actually miss. That list, not a general preference for native, is what unlocks Phase 3.

---

# Phase 3 — Native Client (gated; fork unresolved, not planned in detail)

**Do not start this phase from this document,** and do not start it on either
branch without first completing Task 11. It is deliberately not broken into
executable tasks: writing forty steps of Expo or Xcode detail for work that may
never happen is waste, and both toolchains move faster than a plan written in
advance stays accurate. Every command in a future Phase 3 plan must be
re-validated against current documentation when that plan is written.

**Entry gate (spec D1, D9):** Phase 3 opens only when the PWA has been used for
real workouts and a specific, named deficiency exists. "It feels less native" is
not sufficient — and is also not enough information to resolve the fork.

## Task 11: Resolve the React Native vs. Swift fork (decision, not code)

This is a real task with a real deliverable: an appended decision record in
`docs/superpowers/specs/2026-09-15-mobile-strategy.md` promoting D9 from
"deferred" to a choice with a stated reason. Everything downstream depends on
it, and doing it implicitly — by opening Xcode one afternoon — is how a
codebase acquires a direction nobody argued for.

- [ ] **Step 1: Write down the named deficiency**

From Task 10 Step 6. One or two sentences describing what the PWA could not do
that you actually missed during real workouts. If this is empty, the gate has
not opened; stop here and keep using the PWA.

- [ ] **Step 2: Answer the one question that can end the argument**

Will an Android phone ever need this app? If yes, choose React Native and skip
to Step 5 — it wins outright and no other criterion outranks this.

- [ ] **Step 3: Classify the deficiency**

- Names **Live Activities / Dynamic Island** (a rest timer on the 15 Pro's
  always-on display), **Apple Health**, **widgets**, or **real haptics** →
  argues for Swift. React Native reaches these only through native modules,
  which is where its abstraction stops paying and starts costing.
- Names **input handling or screen feel** (the number pad dismissing between
  sets, scroll behaviour, transitions) → either path serves it; fall through to
  Step 4.

- [ ] **Step 4: Weigh what actually differs**

Discard the three non-differentiators first: **both paths need Xcode, both need
the same ~$99/yr for a long-lived device install, and both rebuild every
screen.** React Native shares this app's *logic*, never its components —
`src/components/` is JSX over DOM elements and Tailwind classes, none of which
exist in React Native.

| | React Native (Expo) | Swift / SwiftUI |
| - | ------------------- | --------------- |
| Language | TypeScript — already known | Swift — genuinely new |
| `packages/core` | Imported directly | Ported by hand, tests as checklist |
| Android, ever | Nearly free | Never, without a third codebase |
| Native depth | Good | Maximum |
| Toolchain | Expo SDK + Metro + Xcode | Xcode only |
| Ongoing upkeep | Periodic Expo SDK upgrades | Annual iOS release cycle |

The spec's leaning is Swift for a single-user, iOS-only gym app. Treat that as
the position to argue against, not as the answer.

- [ ] **Step 5: Record the decision and commit**

Append to the spec: the named deficiency, the branch chosen, and the one
sentence of reasoning that decided it. Then:

```bash
git add docs/superpowers/specs/2026-09-15-mobile-strategy.md
git commit -m "docs: resolve D9 — native client will be <React Native|Swift>"
```

- [ ] **Step 6: Write the Phase 3 plan**

Use superpowers:writing-plans against whichever branch sketch below applies.
Do not execute from the sketch — it is scope, not steps.

---

## What Phases 1–2 already paid for (both branches)

The database, RLS policies, auth configuration, and the entire Supabase setup
need nothing. Spec D4 holds: one project, one database, the native client is
simply another authenticated reader and writer of the same rows.

Spec D5 also holds on both branches — `supabase-js` and `supabase-swift` are
both first-party and both authenticate against the same RLS policies, so the
native client talks to Supabase directly rather than through a re-exposed API.

## Branch 3A — React Native (Expo)

1. `apps/mobile` scaffolded with Expo, using a **development build**
   (`expo-dev-client`), not Expo Go — Expo Go cannot load the native modules
   this needs.
2. Supabase auth on-device: `@supabase/supabase-js` with `expo-secure-store` as
   the session store, plus a deep-link scheme (`gymtrack://auth-callback`) added
   to Supabase Auth's redirect allow list. `@supabase/ssr`, which the web app
   uses, is server-side only and does not apply here.
3. `@gymtrack/core` added as a workspace dependency. Metro resolves the
   workspace symlink the same way Next does; no build step, no duplication.
4. Every screen rebuilt: login, the Verlauf overview, workout logging, dashboard.
5. Rewriting the data layer. `src/lib/data/*` and `src/app/**/actions.ts` are
   `server-only` and Server Actions respectively; per D5 the app calls Supabase
   directly.
6. Distribution, and the ~$99/yr decision deferred by D6.

## Branch 3B — Swift / SwiftUI

1. `apps/ios` as an Xcode project. It needs no workspace entry — npm ignores
   directories without a `package.json`, so the existing `apps/*` glob is safe.
2. `supabase-swift` via Swift Package Manager: auth with the Keychain as the
   session store, PostgREST for queries, and the same deep-link scheme added to
   Supabase Auth's redirect allow list.
3. **Port `packages/core` to Swift, using its 83 tests as the conformance
   checklist.** This is the concrete cost of this branch over 3A. Budget for the
   parts that are easy to get subtly wrong: the Europe/Berlin date handling
   (`localDateString` deliberately avoids `toISOString`, which is UTC), the
   German decimal comma in `formatWeight`, and the ghost-value index mapping
   that lines row *i* up with row *i* of the last session.
4. Every screen rebuilt in SwiftUI.
5. Same data-layer rewrite as 3A item 5, for the same reason.
6. Distribution, and the ~$99/yr decision deferred by D6.

**The honest warning, unchanged by the fork:** a native client is a second UI to
build and then keep in sync with the web app forever. Branch 3B adds a second
copy of the business rules to that. Have the named deficiency from Task 10
Step 6 in hand before agreeing to either.

---

## Self-Review

**Spec coverage:** D1 → Phases 2 and 3 ordering. D2/D3 → Tasks 1–2, with D2's revised justification reproduced at the head of Task 2. D4 → no schema change anywhere; verified in Task 10 Step 5, restated in Phase 3's shared preamble. D5 → Phase 3's shared preamble plus item 5 of both branch sketches. D6 → item 6 of both branch sketches, and Task 11 Step 4's note that the fee is not a differentiator. D7 → item 4 of both branch sketches (parity is a Phase 3 obligation; the PWA has parity by construction, being the same app). D8 → Task 7. D9 → Task 11 end to end. Hazard 1 → largely pre-empted by `0c4b1b4`; the residual case is Task 8, which is explicitly marked skippable. Hazard 2 → Task 6. Hazard 3 → Task 7's preamble and Step 7. Hazard 4 → Task 9's preamble and Step 8. The manual Vercel and device steps are Tasks 3 and 10, both marked.

**Type consistency:** `DisplayEnvironment` and `magicLinkWillStrand` are defined in Task 8 Step 3 and used with matching field names (`isIOS`, `isStandalone`) in Step 6. `@gymtrack/core` is spelled identically in Tasks 2, 7, 8 and both Phase 3 branch sketches. Cache name `gymtrack-static-v1` matches between Task 9 Step 3 and Step 8. Icon filenames match between Task 4 Step 3 and Task 5 Step 1. `transpilePackages` is introduced in Task 2 Step 8 and extended — never replaced — in Task 7 Step 1 and Task 9 Step 6.

**Test-count ledger** (re-measured 2026-09-23, after dashboard phase 1): **141** at baseline in 9 files — dates 12, sets 17, validation 25, exercise-search 14, workout-summary 15, swipe-gesture 22, dashboard-weeks 17, dashboard-heatmap 12, records 7. Still 141 after Task 2, now split **83 in `packages/core` + 58 in `apps/web`** (swipe-gesture and the dashboard modules stay). **145** after Task 8 adds four. Task 9 Step 9 expects 145.

Phase 3 Branch 3B cites 83 tests as the Swift port's conformance checklist — the `packages/core` count at the end of Task 2, excluding both the four PWA-only `magicLinkWillStrand` tests and the 58 web-gesture and dashboard tests, none of which have a Swift equivalent.

**Fork neutrality:** Tasks 1–10 name no native framework. Task 11 is a decision with a written deliverable, not code. Branches 3A and 3B are scope sketches, marked not-executable.
