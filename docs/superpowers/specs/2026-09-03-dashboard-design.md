# Dashboard tab — what it shows, in what order, and when

**Date:** 2026-09-03
**Status:** concept for discussion; nothing implemented yet
**Companions:** `CONCEPT.md` §2.9 / §6.5, `DESIGN_SYSTEM.md` §4 (3-tab navigation), `FEATURE_BACKLOG.md`,
`docs/superpowers/specs/2026-09-03-total-volume-evaluation.md` (where the aggregation belongs)

---

## 1. The problem with dashboards in a young log

A dashboard is the one screen that can be *empty and still correct*. With four logged
workouts, a 1RM trend line is noise, a heatmap is four dots, and "Volumen +18 %" compares
against a week that barely happened. Build the obvious version and the tab is dead for two
months — exactly the two months where showing up is hardest.

So the organizing principle here is not "which charts" but **when does a number start
telling the truth**. Everything below is ordered by that, and each block declares what it
needs before it appears.

Three questions, in order of how early they can be answered honestly:

| # | Question | Answerable from | Metric family |
|---|---|---|---|
| 1 | Bleibe ich dran? | week 1 | frequency, streak, calendar |
| 2 | Bewege ich mehr? | ~week 3 | volume per week |
| 3 | Werde ich stärker? | 2nd session of an exercise | records, e1RM |

Frequency first is not a compromise. `CONCEPT.md` names visit frequency as the project's
own goal, and it is the only family that works from day one.

## 2. Phase 1 — "trackbare Erfolge", no chart library

Everything in phase 1 is text, numbers, and a CSS grid. No Recharts, no new dependency.
That is not a limitation to apologize for: at this data volume, numbers beat charts.

Screen order, top to bottom:

### 2.1 Diese Woche — two stat tiles *(from week 1)*
`3 Workouts` and `12.480 kg bewegt`, each with a delta against the previous week
(`+1`, `+18 %`). Same two numbers the end-of-workout summary already speaks in, one level up.
Delta hidden until a previous week exists — a "+100 %" against zero is a lie.

### 2.2 Serie *(from week 2)*
`7 Wochen in Folge · Ø 2,4 pro Woche (letzte 8 Wochen)`.

**Weeks, not days.** A day-streak punishes rest days, which are part of training; it would
break every 48 hours and read as failure. A week counts as "in Serie" at ≥ 2 workouts —
make the threshold a constant, not a magic number, since §5 turns it into a goal later.
Tone per `DESIGN_SYSTEM.md` §7: neutral and encouraging, never "Ziel verfehlt".

### 2.3 12-Wochen-Raster *(from week 1, grows into itself)*
A 12 × 7 CSS grid, one cell per day, four intensity steps by day volume — the
contribution-graph shape. `DESIGN_SYSTEM.md` §2 already specifies the ramp
(`--muted` → lime, 4 steps) and §5 already says "Calendar-free custom heatmap (simple CSS
grid)". Needs a legend (`weniger` → `mehr`) and a per-cell `title`; it is the one block that
looks *better* the emptier it is early on, because it reads as a calendar, not a failed chart.

### 2.4 Neue Rekorde *(from the 2nd session of an exercise)*
The actual "trackbarer Erfolg", and a list — no chart could improve it:

```
Bankdrücken     85 kg × 5      bester Satz        28. Aug
Kreuzheben      140 kg × 3     bester e1RM 154    24. Aug
Klimmzüge       12 Wdh         meiste Wdh.        21. Aug
```

Last 30 days, newest first. Empty state names what it takes: *"Ab der zweiten Session einer
Übung erscheinen hier deine Bestwerte."* Definitions in §3 — they decide whether this list
is honest or flattering.

### 2.5 Deine Übungen *(from ~3 workouts)*
Top 5 by frequency, each with its best working set and when it happened. Rows are the
natural entry point for the per-exercise detail page (`FEATURE_BACKLOG.md`, designer #4),
so build them as links from the start, even while the target is still phase 2.

### 2.6 Seit Beginn *(always)*
`42 Workouts · 618 Sätze · 214 t bewegt`. The odometer. Never zero for anyone who has logged
once, monotonically increasing, and the only block that is guaranteed to say something on
day one. Tonnes rather than kilos past 10.000 kg — "214 t" is a number you feel.

## 3. Record definitions — pin these down before building

A records list that quietly redefines its own terms is worse than no records list.

1. **Working sets only** (`is_warmup = false`). This is the deliberate opposite of the
   volume decision (2026-09-03: warm-ups *do* count toward moved weight). A total counts
   every kilo; a record is a performance claim, and no warm-up is a performance.
2. **Gewichts-PR** — heaviest working set, any rep count. Simple to read, easy to game with
   a single. Which is why it is never the only one shown.
3. **e1RM-PR** — Epley, `weight × (1 + reps/30)`, already fixed in `CONCEPT.md` §2.9. The
   honest strength trend: it lets `100 × 5` beat `105 × 1`.
4. **Wiederholungs-PR** — most reps at a weight previously lifted. This is what carries
   bodyweight exercises, where §4's zero-kg problem otherwise hides all progress.
5. **Session-Volumen-PR** per exercise — best `Σ weight × reps` in one session.
6. **The first session of an exercise is never a record.** Otherwise every new exercise
   fires four PRs at once and the list stops meaning anything.
7. **Records are always derived from history, never stored incrementally.** Backdating is a
   first-class feature (`CONCEPT.md` §2.4, and the notes import will insert years of it) — a
   stored "current PR" would be wrong the moment an older, heavier session is entered.

## 4. Known distortions to state, not hide

- **Bodyweight sets weigh 0.** A pull-up day adds no volume (`CONCEPT.md` §4, open
  question 4). The end-of-workout dialog already says this out loud; the dashboard must too,
  or the weekly volume number silently punishes calisthenics. Real fix: body weight in the
  database (`FEATURE_BACKLOG.md`, engineer #2).
- **Backdating moves history.** Entering last Tuesday's session today changes last week's
  numbers. Correct, and worth a word in the UI if a delta ever looks impossible.
- **Category is free text.** "Push" and "push " are two categories. Normalize on read
  before any category split is shown (same class of bug as `CONCEPT.md` §2.5 exercise names).

## 5. Phase 2 — charts, once there is a shape to see

Recharts (`CONCEPT.md` §5), roughly at 8–10 weeks of data:

- **Per-exercise progress** — line chart with the metric toggle from `CONCEPT.md` §2.9:
  Top-Satz / e1RM / Volumen. Lives on the exercise detail page; the dashboard links into it.
- **Wochenvolumen** — bars, 12 weeks, one hue. The chart form for §2.1's number.
- **Kategorie-Split** — only worth a chart at 3+ categories in regular use.

Chart rules: one series is the point, so no dual axis, no rainbow; `--chart-1/2/3` are
already assigned in `DESIGN_SYSTEM.md` §2; every chart gets an `sr-only` data table (§8).

## 6. Phase 3 — from measurement to intent

- **Frequenzziel** ("3× pro Woche") — turns §2.2's constant into a user setting and the
  heatmap into progress-against-goal. `FEATURE_BACKLOG.md`, designer #3.
- **Progression hints** — "3 Sessions bei 80 × 8 → versuch 82,5". PM #3.
- **Weekly recap** — the first genuine use for scheduled server work (§7).

## 7. Where the numbers get computed

This is where the volume evaluation's recommendation flips, and it is worth being explicit
about why.

For one workout, summing in the server component was free: the page had already loaded every
set. **The dashboard has no such luxury** — every block spans the whole history. Fetching all
sets to add them up in the app is precisely the case that document said belongs in Postgres.

**Recommendation: views with `security_invoker = on`, queried like tables.**

```sql
-- security_invoker is not optional: a default view runs as its owner and would
-- serve every user everyone else's rows, straight past the RLS policies.
create view v_workout_stats with (security_invoker = on) as
  select w.id as workout_id, w.user_id, w.performed_on, w.category,
         count(s.id) as set_count,
         coalesce(sum(s.weight_kg * s.reps), 0) as volume_kg
    from workouts w
    left join workout_exercises we on we.workout_id = w.id
    left join sets s on s.workout_exercise_id = we.id
   group by w.id;
```

A second view rolls that up per ISO week for §2.1–2.3; a third (`distinct on (exercise_id)`
over working sets, ordered by the metric) serves §2.4–2.5. Records that need parameters —
"best set for exercise X before date Y" — are better as an RPC than a view.

Budget the page at 3–4 queries, all in the server component. Still no serverless function,
no Edge Function: the page render already is one.

**When does this become necessary?** Not today — a few hundred sets aggregate fine in the
app. It becomes necessary the moment the notes import lands (`FEATURE_BACKLOG.md`, PM #2),
which drops years of history in at once. Building the views with the dashboard is cheaper
than retrofitting them under a working screen.

Scheduled work (`pg_cron`, Vercel Cron) stays out until §6's recap, which has to run with no
user present. A stored `total_volume_kg` column stays out until a query is measurably slow.

## 8. Explicitly not in the dashboard

- **Anything needed per set while training.** That is the log screen; duplicating it here
  splits attention during a workout.
- **Badges, levels, confetti.** `DESIGN_SYSTEM.md` §1.4 — "No gamification noise — the data
  is the motivation." Records are results, not trophies.
- **Metrics the schema cannot support** (calories, heart rate, sleep). Not in the data
  model, and inventing them would make every other number look invented too.
- **A second copy of "Workouts diese Woche".** It is already on Today. The dashboard shows
  it *in context* (delta, average, streak); Today keeps the bare glance number.

## 9. Open questions

1. Does the third tab replace Today's week counter, or do both stay? (Recommendation: both —
   different jobs, same number.)
2. Week boundary: Monday, per `startOfWeekMonday`. Confirm — it silently defines every
   weekly number on the screen.
3. Streak threshold: is a week "in Serie" at ≥ 1 or ≥ 2 workouts? Decides how often the
   number resets, i.e. whether it encourages or nags.
4. Records window: last 30 days, or "since you last opened the dashboard"? The second is
   more of a moment, but needs a stored timestamp.
