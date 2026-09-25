# GymTrack — v2+ Feature Backlog

Companion to `CONCEPT.md`. These are post-v1 ideas — nothing here blocks the v1 build. Brainstormed from three perspectives (PM / Designer / Engineer), then ranked.

---

## PM perspective

| # | Idea | Description | Impact | Effort |
|---|------|-------------|--------|--------|
| 1 | **Workout templates / routines** | One tap starts "Push Day" pre-filled with exercises and last session's weights. Attaches to the existing `category` field. Biggest retention lever. | H | M |
| 2 | ~~**Notes-file import**~~ ✅ done 2026-09-25 | Parse the existing notes file to backfill history; makes the dashboard valuable from day one. See `docs/superpowers/specs/2026-09-24-notes-import-design.md`. | H | M |
| 3 | **Progression hints** | "Last 3 sessions at 80×8 → try 82.5" based on simple double-progression rules over recent sets. | M | M |
| 4 | **PR detection & celebration** | Auto-detect weight / rep / est-1RM PRs at set entry; small celebratory moment in the UI. | M | L |
| 5 | **Weekly recap** | Auto-generated summary (volume, PRs, frequency vs. goal), optionally as email. | M | M |

## Designer perspective

| # | Idea | Description | Impact | Effort |
|---|------|-------------|--------|--------|
| 1 | **Rest timer with auto-start** | Starts when a set is saved, notifies when rest is over; lives inline in the log screen. | M | L |
| 2 | **Plate calculator** | Tap a weight → shows which plates to load per side. In-gym utility with delight factor. | M | L |
| 3 | **Frequency goal + streak framing** | Set a goal like "3×/week"; heatmap shows progress toward it. Encouraging, not guilt-driven. | M | L |
| 4 | **Exercise detail page** | One place per exercise: history, PRs, notes, variation filter; deep-linkable from the dashboard. | M | M |
| 5 | **Dark mode / gym-floor contrast** | High-contrast, large-type logging mode for harsh gym lighting. | L | L |

## Engineer perspective

| # | Idea | Description | Impact | Effort |
|---|------|-------------|--------|--------|
| 1 | **PWA + offline queue** | Installable app; sets queue locally and sync when reception returns. Properly solves the basement-gym connectivity problem (v1 only does optimistic save + retry). | H | H |
| 2 | **Body weight & measurements** | Separate lightweight table; enables relative-strength charts (e.g. bench ÷ body weight). | M | L |
| 3 | **CSV/JSON export** | Full data export anytime. Cheap trust feature, doubles as backup. | M | L |
| 4 | **Supersets as first-class grouping** | Group `workout_exercises` via a nullable `superset_group` column; UI renders grouped exercises interleaved. | L | M |
| 5 | **AI note summarizer** | Periodically distill per-instance exercise notes ("seat 4, wrists hurt at wide grip") into the exercise's permanent setup note. | L | M |

## Top 5 ranked

| Rank | Idea | Why | Quick win? |
|------|------|-----|------------|
| 1 | Workout templates | Directly removes the most friction from the actual weekly routine | No |
| 2 | ~~Notes-file import~~ ✅ done 2026-09-25 | Instantly makes dashboards meaningful; the data already exists | No |
| 3 | Rest timer + PR detection | Two small features that make daily logging feel great | Yes |
| 4 | PWA + offline queue | Reliability is existential for an in-gym tool | No |
| 5 | Body weight tracking + export | Cheap, rounds out "my data, my progress" | Yes |

## Schema safeguard worth adding in v1

Add a nullable `superset_group int` column to `workout_exercises` now — costs nothing today, avoids a migration when supersets arrive. Everything else on this list layers onto the v1 schema without changes.
