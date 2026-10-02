# Exercise detail page — one landing page per exercise

**Date:** 2026-09-30
**Status:** phase A implemented 2026-10-02 on `claude/exercise-detail-spec`; §11 taken with the
recommended defaults (§12), open to veto. Migration `20261002120000` written and checked
against a local Postgres, **not yet applied** to the Supabase project.
**Companions:** `docs/superpowers/specs/2026-09-03-dashboard-design.md` (§3 record
definitions, §5 phase 2, §10.6 „plain rows, no links“ — lifted by this page),
`docs/superpowers/specs/2026-09-03-total-volume-evaluation.md` (§5 what volume means),
`docs/superpowers/specs/2026-09-24-notes-import-design.md` (unclean reps, dropsets,
per-side weights, machine splits), `CONCEPT.md` §2.5–2.6 / §2.9, `DESIGN_SYSTEM.md` §2 / §5
(charts), `FEATURE_BACKLOG.md` designer #4

---

## 1. Why now

The dashboard answers three questions for the whole log: *Bleibe ich dran? Bewege ich mehr?
Werde ich stärker?* The third one is really a question about **one exercise at a time** — a
bench-press PR and a leg-press PR do not add up to anything. The dashboard spec already put
the answer on a separate page (§5: „Per-exercise progress … lives on the exercise detail
page; the dashboard links into it“) and deliberately left the rows unlinked until that page
exists (§10.6).

What changed since then is the data. The notes import (2026-09-25) put **149 workouts, 823
exercise entries and 2,224 sets** from 2024-04 onwards into the account — on average ~23
sessions per exercise, the main lifts far more. The dashboard spec's rule „charts once there
is a shape to see, roughly at 8–10 weeks“ is met for the core exercises today. A per-exercise
chart is no longer a promise; it is two years of history nobody can currently look at.

## 2. What the page is for

One question per block, in the order they are asked in the gym and on the couch:

| # | Question | Block | Needs |
|---|---|---|---|
| 1 | Wo stehe ich gerade? | §4.2 Letzte Session vs. Bestwert | 2 sessions |
| 2 | Werde ich stärker? | §4.3 Verlaufs-Chart | 3 sessions |
| 3 | Was ist mein Bestes — und bei welchem Gewicht? | §4.4 Bestwerte + Wdh. je Gewicht | 2 sessions |
| 4 | Was habe ich genau gemacht? | §4.5 Sessions | 1 session |

Same organising principle as the dashboard: **each block declares when its number starts
telling the truth**, and stays hidden (or says what it needs) until then.

Explicitly *not* a question this page answers: „Was mache ich heute?“ That is the log screen's
last-session line and ghost values (`CONCEPT.md` §2.3), and progression hints (dashboard §6)
are a later phase. The page is read on the couch, not mid-set.

## 3. Route and entry points

- **Route:** `/dashboard/exercises/[id]`, `id` = `exercises.id` (UUID). Not a name slug:
  renaming is explicitly safe (`CONCEPT.md` §2.5), and a slug would break every link on
  rename. Under `/dashboard` so the bottom tab stays on „Dashboard“ (`bottom-tabs.tsx` matches
  by prefix) — the page is a drill-down, not a third tab.
- **Index:** `/dashboard/exercises` — „Alle Übungen“, every exercise with at least one
  session, most recently trained first: `Bankdrücken · 46 Sessions · zuletzt 25. Sep`.
  Without it only the top 5 and the last month's record holders would be reachable, and the
  goal is a page for *every* exercise.
- **Links in** (all server-rendered `<Link>`s):
  1. „Deine Übungen“ rows → detail page (lifts dashboard §10.6 in the same PR that ships the
     route — no 404 window).
  2. „Neue Rekorde“ rows → detail page.
  3. „Alle Übungen →“ under „Deine Übungen“ → index.
- **Not linked (yet):** the exercise name on the log screen's card. That card is a swipe
  target mid-workout; a stray tap navigating away is exactly the interruption the log screen
  is designed against. See §11 Q5.
- **Back:** always „← Dashboard“ at the top. Where the reader came from (dashboard or index)
  is not knowable in a server component, and the index is one tap away from the dashboard.
- **Not found:** RLS makes a foreign id and a missing id look the same — `notFound()`, same
  as `/workout/[id]`. An id that is not a UUID also ends there (Postgres rejects the cast;
  the data layer logs and returns null).
- **Archived exercises** keep their page (history must stay reachable — that is the point of
  archiving over deleting) with a muted „archiviert“ label.

## 4. Blocks, top to bottom

Sketch at phone width, data invented:

```
← Dashboard
Bankdrücken                                   (screen title)
46 Sessions seit Apr. 2024 · zuletzt vor 5 Tagen
„Sitz auf Stufe 4“                            (exercises.note, if any)

┌ LETZTE SESSION ──────┐ ┌ BESTWERT ────────────┐
│ 85 kg × 6            │ │ e1RM 108 kg          │
│ e1RM 102 · 25. Sep   │ │ 100 × 3 · 12. Mär 25 │
└──────────────────────┘ └──────────────────────┘

VERLAUF          [ e1RM | Top-Satz | Volumen ]
                 [ 3 M · 1 J · Alles ]
  ▁▂▃▃▅▄▆▆▇▆▇█  (line, date axis)

BESTWERTE
Schwerster Satz                 100 kg × 3     12. Mär 2025
Wiederholungen je Gewicht
   100 kg      3 Wdh.   12. Mär 2025
    90 kg      6 Wdh.   02. Sep 2026
    85 kg      8 Wdh.   18. Jul 2026
    80 kg     12 Wdh.   24. Jun 2026

SESSIONS
2026
25. Sep · Push                               e1RM 102
80 × 8 · 85 × 6 · 85 × 5
+2 unsauber · Griff: eng · „S3: langsam“
…
[ Alle 46 Sessions ]
```

### 4.1 Header *(always)*
Name, one context line (`n Sessions seit <Monat Jahr> · zuletzt vor x Tagen`), the
exercise's setup note (`exercises.note`) if present, „archiviert“ if archived. Zero sessions
(in the library, never trained): the header plus „Noch nicht trainiert.“ — nothing else.

### 4.2 Letzte Session vs. Bestwert *(from session 2)*
Two stat tiles, the existing `StatTiles` look:

- **Letzte Session** — its top set (`85 kg × 6`), its best e1RM and date.
- **Bestwert** — all-time best e1RM, the set that produced it and its date.

**No delta, no percentage.** Dashboard §10.2 dropped week-over-week deltas because irregular
training turns them into reports about gaps; a „−6 %“ against a best from 18 months ago is the
same problem with a longer lever. Two numbers side by side let the reader do the comparison
without the app passing judgment (`DESIGN_SYSTEM.md` §7: never „Ziel verfehlt“). When the
last session *is* the best, the right tile says so in words: „Bestwert — letzte Session“.

With one session both tiles would show the same set, so the block waits for the second.

### 4.3 Verlauf — the chart *(from 3 sessions in the selected range)*
The one chart on the page, and the first chart in the app (dashboard §5, phase 2).

**One point per session**, x = date, y = the selected metric. Segmented control above it,
exactly the three metrics `CONCEPT.md` §2.9 and dashboard §5 name:

| Metric | Per session | Form | Colour | Why |
|---|---|---|---|---|
| **e1RM** *(default)* | best Epley value of any working set | line | `--chart-2` sky | The honest strength trend (dashboard §3.3): `100 × 5` beats `105 × 1`, so rep-range changes don't read as regressions. |
| **Top-Satz** | heaviest working set (tie → more reps), tooltip shows reps | line | `--chart-1` lime | What you actually put on the bar. Easy to read, easy to game with a single — which is why it is not the default. |
| **Volumen** | Σ weight × reps, **every set incl. warm-ups** | bars | `--chart-3` violet | Workload, not strength. Bars because it is a quantity that starts at zero (`DESIGN_SYSTEM.md` §2: „Volume bars“). |

Rules, each one a decision:

- **Date axis, not session index.** Training is irregular; a two-month break must look like
  one. Evenly spaced sessions would draw a steady climb across a gap in which strength was
  probably lost.
- **Lines don't start at zero; bars do.** An e1RM between 85 and 108 on a 0–110 axis is a flat
  line. Volume bars on a cropped axis lie.
- **Range chips `3 M · 1 J · Alles`**, default `1 J` when the history is longer than a year,
  else `Alles`. A chip is only shown if its range holds ≥ 3 sessions and differs from `Alles`.
  Two years of every session compress the recent months — the ones that matter — into the
  right edge.
- **No smoothing, no trend line, no second series.** One series is the point (dashboard §5);
  a regression line over irregular sessions invents precision. Last point gets the filled
  dot (`DESIGN_SYSTEM.md` §5), no other dots.
- **Tooltip:** date, top set (`85 kg × 6`), e1RM, volume — the card surface.
- **`sr-only` data table** with the same points (`DESIGN_SYSTEM.md` §8).
- **Below 3 sessions in range:** no chart, one line: „Ab drei Sessions zeigt sich hier dein
  Verlauf.“ Two points are a claim of a trend, not a trend.

**Volume definition is not reopened.** The volume evaluation (§5.1) decided warm-ups count and
warned that „two volume formulas that disagree is the worst outcome available“. The per-exercise
bars use the same formula as the end-of-workout summary and `v_workout_stats`. If a
working-set-only volume is ever wanted, it becomes a *second* metric, not a redefinition.

### 4.4 Bestwerte *(from session 2)*
Built on the dashboard's record definitions (§3, §10.3–10.4), but shown as **current bests**,
not as record events:

- **Schwerster Satz** — heaviest working set ever, its reps, its date.
- **Wiederholungen je Gewicht** — for each working weight: the most reps ever done at exactly
  that weight, and when. This is the Wiederholungs-PR table the dashboard computes one row
  of; spread out, it is the most useful table on the page, because it answers the question
  double progression asks: *at 80 kg, what is the number to beat?* Rows: weights used in the
  last 6 months, heaviest first, at most 8; „Alle Gewichte“ expands to the rest.

The best e1RM is already the right tile of §4.2 and is not repeated here.

Ties go to the **earliest** date — the first time a value was reached is when it became the
best („strictly greater, everywhere“, dashboard §10.4). With that rule the current best of
each kind is exactly the newest record event `exercise_records()` would return for it, so the
page and the dashboard can never name different dates for the same best — without the page
calling the record function at all (§7).

Bodyweight exercises (§6): the block is left out — its only best, „Meiste Wdh.“, is already the
right tile of §4.2.

### 4.5 Sessions *(from session 1)*
Reverse-chronological, a year heading when the year changes (two years of history), the
**10 newest** by default, „Alle n Sessions“ below (a `?sessions=alle` search param,
server-rendered — no client state for a list).

Each session:

- **Date · category**, links to `/workout/[id]` (edit lives there, not here).
- **Working sets** via `formatSetSummary` — the exact line the log screen shows, so the two
  screens speak the same notation. Warm-ups as a muted count („+2 Aufwärmsätze“), not listed.
- **Extras**, only when present: unclean reps summed („+3 unsauber“, notes import §4),
  „Dropset“, variation attributes as text („Griff: eng“), the instance note
  (`workout_exercises.note` — the imported „S2: 90%“ annotations live here).
- **Right side:** the session's best e1RM, tabular.
- A session in which the same exercise appears twice is **one** session (grouped by
  workout), sets in the order they were logged. Same grouping as `exercise_records()`.

## 5. Which numbers count — inherited, not reinvented

| Number | Sets it counts | Source of the rule |
|---|---|---|
| e1RM, Top-Satz, Bestwerte, Wdh. je Gewicht | working sets (`is_warmup = false`), dropsets included | dashboard §3.1 |
| Volumen | every set, warm-ups included | volume evaluation §5.1 |
| Reps | clean reps only (`reps`); `unclean_reps` count nowhere, shown in §4.5 | notes import §3 |
| e1RM formula | Epley `weight × (1 + reps/30)`, rounded to 0.1 kg — **computed in SQL only** (§7) | `CONCEPT.md` §2.9, `v_working_sets` |
| Session | a workout with ≥ 1 working set of the exercise | `top_exercises()` |

## 6. Known distortions — stated, not hidden

- **Bodyweight exercises (0 kg).** Weight, e1RM and volume are all 0. An exercise whose
  working sets are *all* 0 kg switches the page into **reps mode**: tiles show reps, the chart
  metrics become „Meiste Wdh.“ (best set, line) and „Wdh. gesamt“ (clean working reps summed,
  bars), Bestwerte shows only „Meiste Wdh.“. A mixed exercise (dips, some with +10 kg) stays
  in weight mode and its 0-kg sessions sit at the bottom of the chart — correct but ugly;
  proper fix is body weight in the database (`FEATURE_BACKLOG.md`, engineer #2).
- **Assisted exercises run backwards.** The notes import kept the assisted-pull-up weight as
  written (import spec §1, out of scope there): more assistance = more kg = *easier*. On this
  page its line goes up when strength goes down. Fix needs a per-exercise flag; §11 Q6.
- **Epley overestimates past ~12 reps.** For high-rep isolation work (leg raises, lateral
  raises at 20 reps) e1RM is a comparison number, not a max anyone could lift. The tile says
  „e1RM“, never „Maximum“; an ⓘ line under the chart says „geschätzt aus Gewicht × Wdh.“.
- **Dropsets are working sets.** A dropset at a weight lifted before can set a
  Wiederholungs-best at that weight. The dashboard counts them the same way today, and the
  two screens must agree — changing it means changing `v_working_sets` for both (§11 Q4).
- **Per-side weights are stored as written** (import spec §5.3). Within one exercise the
  notation was consistent, so the trend is valid; comparing absolute kilos to another
  exercise is not.
- **Estimated dates.** Imported workouts without a date got the midpoint of their neighbours
  and the note „Datum geschätzt“. Their points sit on an invented day. Harmless at chart
  resolution; the session list shows the workout note, which says so.
- **Machine changes are separate exercises** („Row tower (neue Maschine)“, import spec §5.5).
  Their history starts in 2026-06 and is not joined to the old machine's. Correct — the
  weights are not comparable — but worth one sentence if it ever confuses.

## 7. Where the numbers come from

The dashboard moved aggregation into Postgres because every block spans *every* exercise
(dashboard §7). This page spans one exercise, and — the deciding fact — **the session list
needs the individual sets anyway**. That is the volume evaluation's case A one level up: once
the rows are loaded for display, aggregating them is free.

**Recommendation: one new view that delivers every set of one exercise, e1RM precomputed in
SQL; pure TypeScript groups and aggregates.**

```sql
-- security_invoker is not optional (see 20260923200014_dashboard_views.sql).
create view v_exercise_sets with (security_invoker = on) as
  select w.user_id,
         we.exercise_id,
         w.id as workout_id,
         w.performed_on,
         w.created_at as workout_created_at,
         w.category,
         w.note as workout_note,
         we.id as workout_exercise_id,
         we.position as exercise_position,
         we.note,
         we.attributes,
         s.id as set_id,
         s.position,
         s.weight_kg,
         s.reps,
         s.unclean_reps,
         s.is_warmup,
         s.is_dropset,
         s.weight_kg * s.reps as volume_kg,
         round(s.weight_kg * (1 + s.reps / 30.0), 1) as e1rm_kg
    from sets s
    join workout_exercises we on we.id = s.workout_exercise_id
    join workouts w on w.id = we.workout_id;
```

- **Epley and volume stay in SQL**, identical expressions to `v_working_sets` /
  `v_workout_stats`. TypeScript only takes max and sum of numbers Postgres computed — there is
  no second implementation of either formula to drift.
- **Size:** the biggest exercise is a few hundred sets, ~30 KB between Supabase and the
  server render. What reaches the phone is only the derived output (≤ ~150 chart points and
  10 rendered sessions). Same region, one round trip.
- **Records without the record function.** Current bests (§4.4) need only max-with-earliest-
  date, which by the strictly-greater rule equals the newest record event. The rule machinery
  of `exercise_records()` is not needed until record *events* are shown (phase B, §9).

**Index view** — PostgREST cannot `group by`, so the „Alle Übungen“ page gets its own:

```sql
create view v_exercise_overview with (security_invoker = on) as
  select e.id as exercise_id, e.user_id, e.name, e.is_archived,
         count(distinct ws.workout_id) as session_count,
         min(ws.performed_on) as first_performed_on,
         max(ws.performed_on) as last_performed_on
    from exercises e
    join v_working_sets ws on ws.exercise_id = e.id
   group by e.id;
```

Both purely additive — one database for staging and production (dashboard §10.9). Grants as in
the dashboard migration: revoke from `anon`, select to `authenticated`. The leak check in
`supabase/checks/` gets two more views to prove.

**Page budget: 2 queries, in parallel** — the `exercises` row (name, note, archived) and
`v_exercise_sets` filtered by `exercise_id`, ordered by `performed_on, workout_created_at,
exercise_position, position`. Each block degrades on its own like the dashboard: a failed
sets query shows the header and `BlockError`, not a blank page.

## 8. Chart implementation

- **Recharts**, as `CONCEPT.md` §5 and `DESIGN_SYSTEM.md` §5 already decided — a new runtime
  dependency, and the reason the dashboard deferred charts.
- The chart is the page's **only client component** (metric toggle and range chips are local
  state; all points are passed as a prop — ~150 numbers). Everything else stays server-
  rendered, like the dashboard.
- Fixed height (~200 px) so the page doesn't shift while Recharts measures its container.
- Styling per `DESIGN_SYSTEM.md` §5: `--border` gridlines, muted axis labels, 2 px lines,
  German number and date format via the existing `formatWeight` / `formatPerformedOn`.
- Respect `prefers-reduced-motion` (existing hook) — Recharts animates by default.

## 9. Phases

**Phase A — ship together** (the page is thin without any one of them):
index page, detail route, links from both dashboard lists, §4.1–4.5, reps mode, the two views,
Recharts.

**Phase B — once A has been used for a while:**
- **Variation filter** (`CONCEPT.md` §2.5–2.6): chips „Alle · weit · eng · lateral“ above the
  chart when an exercise has ≥ 2 attribute values with ≥ 2 sessions each; filters every block
  via a search param. The data is already there (`attributes` in `v_exercise_sets`); the
  import produced grip attributes for pulldowns and pushdowns.
- **Record markers** on the chart (amber `--warning`, which `DESIGN_SYSTEM.md` §2 reserves for
  „PR highlight (v2)“) and a „Rekord-Verlauf“ list — this needs record *events*, i.e. an
  `exercise_record_events(p_exercise_id)` function built from the same CTEs as
  `exercise_records()`, with a conformance check that the two agree.
- **Link from the log screen** if §11 Q5 says yes.

**Later, and deliberately not here:** progression hints (dashboard §6 — this page is their
natural home), effort chart (the `effort` column exists but no screen writes it; a chart of it
would be empty), relative strength (needs body weight), editing the exercise (library screen,
`CONCEPT.md` §6.4), comparing two exercises.

## 10. Files (phase A, for the plan)

| File | Change |
|---|---|
| `supabase/migrations/<version>_exercise_detail_views.sql` | `v_exercise_sets`, `v_exercise_overview`, grants |
| `supabase/checks/dashboard_views.sql` (or a sibling) | leak + correctness check for both views |
| `src/lib/types.ts` | `ExerciseSetRow`, `ExerciseSession`, `ExerciseDetail`, `ExerciseOverviewRow` |
| `src/lib/exercise-detail.ts` (+ test) | pure: group sets → sessions, chart series per metric, bests, reps table, reps-mode detection, range chips |
| `src/lib/data/exercise-detail.ts` | `server-only`: the two queries, `Number(...)` on every numeric, per-block `null` |
| `src/app/dashboard/exercises/page.tsx` | index |
| `src/app/dashboard/exercises/[id]/page.tsx` | detail, `params` is a Promise (Next 16 — read `node_modules/next/dist/docs/` first, `AGENTS.md`) |
| `src/components/exercise/*.tsx` | header, tiles, `progress-chart` (client), bests, session list |
| `src/components/dashboard/exercise-list.tsx`, `records-list.tsx` | rows become links; „Alle Übungen →“ |
| `package.json` | `recharts` |
| `docs/superpowers/plans/2026-09-15-monorepo-and-pwa.md` | note the new web-only modules, like the dashboard did |

Tests: Vitest for everything in `src/lib/exercise-detail.ts` (grouping, earliest-date ties,
reps mode, range chips hiding, a same-exercise-twice workout). `npm run lint && npm run test &&
npm run build` before the PR against `staging`.

## 11. Open decisions — for Dominik

Each has a recommendation; the page is designed around it.

1. **Scope of phase A** — all of §4 plus the index, or detail page only first?
   *Recommended: all.* Without the index most exercises have no entry point.
2. **Default chart metric** — e1RM or Top-Satz?
   *Recommended: e1RM* (dashboard §3.3's „honest strength trend“), Top-Satz one tap away.
3. **Default range** — `1 J` or `Alles`?
   *Recommended: `1 J`* once the history is longer than a year.
4. **Dropsets in records** — keep counting them as working sets (today's dashboard behaviour)
   or exclude them from every best/record?
   *Recommended: keep for now*, both screens identical; excluding means a `create or replace`
   of `v_working_sets`, which is its own small change for both screens at once.
5. **Link from the log screen's exercise name** to this page?
   *Recommended: no* for phase A — mid-workout taps should not navigate away.
6. **Assisted exercises** — accept the inverted line for now, or add an `is_assisted` flag on
   `exercises` in phase A?
   *Recommended: accept for now* and state it in §6; a schema flag earns its place once a
   second assisted exercise exists.
7. **Language of the route** — `/dashboard/exercises/[id]` (matches `/workout/[id]`) or German
   `/dashboard/uebungen/[id]`?
   *Recommended: English*, like every existing route; the UI text is German regardless.

## 12. Decisions — 2026-10-02

Dominik started the implementation without answering §11 one by one, so every question
was taken with its recommendation. *(Claude's defaults, open to veto.)*

1. Phase A ships whole, index included.
2. e1RM is the default metric.
3. `1 J` is the default range once the history is longer than a year.
4. Dropsets keep counting as working sets, on both screens.
5. No link from the log screen's exercise name.
6. Assisted exercises keep the inverted line; stated in §6.
7. English route: `/dashboard/exercises/[id]`.

Taken while building, beyond §11:

8. **Y-axis ticks are round steps** (1/2/2,5/5 × 10ⁿ, never 2,5 for reps), and the axis
   spans exactly those ticks. Recharts' own ticks on a non-zero domain read „59 · 74 · 89“.
9. **Bodyweight sessions read „8 · 7 Wdh.“**, not „0 × 8 · 0 × 7“ — the `formatLift` rule,
   applied to the session line.
10. **„Alle Gewichte“ and the per-weight table use a native `<details>`**; „Alle Sessions“ is
    the `?sessions=alle` search param. Neither needs client JavaScript.
11. **The sets query pages in 1000-row steps** on a unique ordering, so PostgREST's
    max-rows cap can never silently cut an exercise's history short.
