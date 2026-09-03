# Total moved weight ("Volumen") — where to compute it

**Date:** 2026-09-03
**Status:** evaluation + recommendation; step 1 implemented, the rest is a decision record for later
**Companions:** `CONCEPT.md` §2.9 / §4 (key queries), `FEATURE_BACKLOG.md`, `src/lib/workout-summary.ts`

---

## 1. Question

The end-of-workout summary should eventually show the total weight moved in a session
(`Σ weight_kg × reps`). What is the client-friendly way to compute that? Does it need a
serverless function, and do Vercel or Supabase offer a purpose-built mechanism?

## 2. Short answer

No serverless function, no Edge Function, no cron job, no extra column. **Sum it in the
server component that already loads the workout.** The arithmetic is free; the only thing
that ever costs anything is *fetching the sets*, and the log screen fetches them anyway.

Two numbers make this concrete:

- A hard session is ~6 exercises × ~5 sets = **~30 rows**. Summing 30 products is
  sub-microsecond work in any runtime.
- `getWorkoutDetail` already returns every one of those rows to render the log screen, so
  the summary adds **0 queries and 0 transferred bytes**.

That is what `summarizeWorkout()` in `src/lib/workout-summary.ts` does — it returns
`totalVolumeKg` today; only the display line is missing.

Worth naming, because it is the actual answer to "braucht es serverless functions?": on
Vercel, **a Next.js server component render already *is* a serverless function invocation**.
The page is `ƒ (Dynamic)` in the build output. Adding a Route Handler or a Supabase Edge
Function for the sum would not move the work "to the server" — it is already there — it
would only add a second network hop in front of it.

## 3. Options considered

### A. Server component render (chosen for the workout summary)

Sum during the RSC render, pass the result to the client component as a prop.

- **Cost:** one pass over an array that is already in memory.
- **Correctness:** counts exactly what is persisted, which is what "abgeschlossene Sätze"
  should mean. A half-typed row is deliberately not in it.
- **Client weight:** zero — no set data or summing logic is shipped to the browser for this.
- **Trade-off:** the number is a snapshot of the last render. Fine here: every set mutation
  calls `revalidatePath("/workout/[id]")`, so the props are refreshed after each save.

### B. Compute in the client

`SetList` holds the live draft rows, so the client *could* total them — but per exercise
card only; a workout total would need to be lifted into a context or store spanning cards.

- **Only worth it for one thing:** a live "Volumen heute" ticker that moves while you type,
  before the set is saved.
- If that is ever wanted, reuse the same function — `summarizeWorkout` is deliberately a
  pure function in `src/lib/` with no `server-only` import, so it runs in either runtime.
  Do not write a second implementation; two volume formulas that disagree is the worst
  outcome available here.

### C. Postgres does the aggregation (right answer for the dashboard, not for this screen)

Supabase's relevant mechanism is plain Postgres, and it comes in three shapes:

1. **Generated column** — `alter table sets add column volume_kg numeric(10,2)
   generated always as (weight_kg * reps) stored;` Makes per-set volume canonical in one
   place. Cheap and safe, but buys little while the app already multiplies two columns it
   has in hand.
2. **View + `sum(...) group by workout_id`**, queried through PostgREST like any table.
   ⚠️ Create it as `create view … with (security_invoker = on)`. A default view runs as its
   owner and would hand every user everyone else's rows — the RLS policies in
   `20260817000001_init.sql` are the app's whole tenancy model.
3. **RPC** — a `plpgsql`/`sql` function called via `supabase.rpc()`, for aggregates with
   parameters (date range, exercise, variation filter).

**When this becomes the right call:** the dashboard (`CONCEPT.md` §2.9) — volume per week
over a year, or volume per exercise across all sessions. There the alternative is shipping
thousands of set rows to the app just to add them up. Aggregating next to the data turns
~10.000 rows into ~52. That is a real transfer win; for one workout there is nothing to win.

### D. Denormalized `workouts.total_volume_kg`, maintained by trigger

Precompute on write so reads are free.

- **Verdict: no, and probably never.** At single-user scale the table stays in the low tens
  of thousands of rows; a `sum()` over an indexed workout is sub-millisecond. The cost is
  permanent: a trigger on insert/update/delete of `sets`, plus the risk of the stored value
  silently drifting from the rows it claims to summarize. Denormalize only after a measured
  slow query, never in anticipation of one.

### E. Supabase Edge Functions / Vercel Functions / cron

- **Edge Functions (Deno)** are for work that needs a secret or must not run in the client:
  webhooks, third-party APIs, `service_role` operations. Summing a user's own rows — rows
  RLS already lets them read — is none of those.
- **A separate Vercel Function / Route Handler** would only put an HTTP hop in front of
  code the page render can run directly.
- **Scheduled work** (Supabase `pg_cron`, Vercel Cron) earns its place when something must
  run with no user present. The first honest candidate on the roadmap is the weekly recap
  (`FEATURE_BACKLOG.md`, PM #5) — a job that computes and *emails*. Not this.

## 4. Recommendation by use case

| Use case | Where it belongs | Why |
|---|---|---|
| Volume in the end-of-workout summary | RSC render, `summarizeWorkout()` | Sets are already loaded — free |
| Live counter while logging | Client, **same** pure function | Needs unsaved draft values |
| Dashboard: volume per week / per exercise over time | Postgres view or RPC (`security_invoker = on`) | Ships ~n aggregated rows instead of every set |
| Weekly recap, notifications | `pg_cron` or Vercel Cron | Must run without a user present |
| Stored `total_volume_kg` column | Not planned | Only after a measured slow query |

## 5. Definitions to settle before the number goes on screen

These decide what the number *means*; they matter more than where it is computed.

1. **Warm-ups counted?** `summarizeWorkout` currently counts them: "bewegtes Gewicht" is
   read literally as total load moved. Note the inconsistency this creates with
   `formatSetSummary`, which is working-sets-only because warm-ups are not a comparison.
   If the summary is ever compared session-to-session, split the two numbers rather than
   quietly changing this one.
2. **Bodyweight exercises contribute 0.** `weight_kg = 0` is the bodyweight convention
   (`CONCEPT.md` §4, open question 4), so 12 pull-ups add nothing to the total — a
   pull-up-heavy day will read low. Fixing it properly needs body weight in the database
   (`FEATURE_BACKLOG.md`, engineer #2); until then it is a footnote, not a bug.
3. **Units.** Weight is stored in kg; `profiles.unit` is a display concern. Convert at the
   formatting boundary (`formatVolume`), never in the stored sum.
4. **Precision.** `weight_kg` is `numeric(6,2)`; JS sums it as a float, so
   `summarizeWorkout` rounds back to two decimals and `formatVolume` displays whole kilos.
   If aggregation ever moves into Postgres, `numeric` stays exact there — expect the two
   paths to agree only after rounding.
