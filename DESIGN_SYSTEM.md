# GymTrack — Design System & Design Language

Companion to `CONCEPT.md` (screens: section 6) and `FEATURE_BACKLOG.md`. This is the visual and interaction source of truth for the prototype. Implementation targets **Tailwind CSS + shadcn/ui**; all tokens map to CSS variables so shadcn components pick them up automatically.

---

## 1. Design principles

1. **Thumb-first.** Every primary action reachable one-handed in the bottom half of the screen. Logging a set never requires precision-tapping.
2. **Numbers are the interface.** Weights and reps are the content users care about — they get the largest type, everything else recedes.
3. **Dark by default.** Gyms have harsh mixed lighting; a dark, high-contrast UI reads better mid-set and doesn't blind in dim corners. Light mode is a v2 nicety.
4. **Calm energy.** One loud accent color for progress and actions; everything else near-monochrome. No gamification noise — the data is the motivation.
5. **Never block, never lose.** No modals during logging where a sheet works; every entry saves instantly; destructive actions are undoable (archive, not delete).

**Personality in three words:** focused · sturdy · encouraging.

## 2. Color

Dark-first palette. Accent is a vivid lime — high contrast on dark, reads "energy/progress" without being aggressive.

### Core tokens (CSS variables, shadcn convention, HSL)

| Token | Value | Usage |
|---|---|---|
| `--background` | `220 15% 8%` (#111318) | App background |
| `--card` | `220 14% 12%` (#1a1d24) | Cards, list rows |
| `--muted` | `220 12% 18%` (#272b34) | Input backgrounds, inactive chips |
| `--border` | `220 10% 24%` (#363b45) | Hairlines, dividers |
| `--foreground` | `220 15% 93%` (#e9ebef) | Primary text |
| `--muted-foreground` | `220 8% 62%` (#979da8) | Secondary text, labels, ghost values |
| `--primary` | `84 85% 55%` (#a3e635 – lime) | CTAs, active states, progress lines |
| `--primary-foreground` | `220 15% 8%` | Text on primary |
| `--destructive` | `0 72% 55%` | Delete/remove (rare) |
| `--ring` | same as `--primary` | Focus rings |

### Semantic extras

| Token | Value | Usage |
|---|---|---|
| `--success` | `152 60% 45%` | Saved-state confirmation, sync ok |
| `--warning` | `38 92% 55%` (amber) | PR highlight (v2), unsynced set |
| `--chart-1` | lime `#a3e635` | Top-set weight line |
| `--chart-2` | sky `#38bdf8` | Est. 1RM line |
| `--chart-3` | violet `#a78bfa` | Volume bars |
| Heatmap-Skala | `--muted` → lime in 4 Stufen | Consistency heatmap |

**Rules:** Lime is reserved for *actions and progress* — never for decoration. Warm-up sets render in `--muted-foreground`. Ghost values (pre-filled last-session numbers) use `--muted-foreground` at placeholder weight, becoming `--foreground` once confirmed.

## 3. Typography

| Role | Font | Size / weight | Notes |
|---|---|---|---|
| UI text | **Inter** (variable, `next/font`) | 16px / 400–500 | Base size never below 16px (iOS zoom!) |
| Numerals (weights, reps, timer) | Inter with `font-variant-numeric: tabular-nums` | 24–28px / 600 | Tabular so set rows align in columns |
| Screen title | Inter | 20px / 600 | One per screen, left-aligned |
| Section label | Inter | 13px / 500, uppercase, `tracking-wide`, muted | e.g. "SETS", "EFFORT" |
| Dashboard hero number | Inter | 36px / 700 | Workouts/week, streak |

Scale (Tailwind): `text-xs 13 · text-sm 14 · base 16 · lg 18 · xl 20 · 2xl 24 · 3xl 28 · 4xl 36`. Line-height 1.5 for text, 1.1 for numerals.

## 4. Spacing, layout, shape

- **Grid:** 4px base. Screen padding `px-4` (16px), section gaps `gap-6` (24px), inside cards `p-4`.
- **Layout:** single column, max-width `28rem` centered on desktop (it's a phone app that happens to run on desktop).
- **Navigation:** bottom tab bar, 2 tabs — **Verlauf · Dashboard**. Verlauf merges the former Today/History split: "Start workout" pinned at the top (this week's count directly under it), followed by the reverse-chronological workout list — one screen, no separate landing page. Library and settings live behind the profile icon in the header.
- **Radius:** `--radius: 12px` for cards and inputs; pills (chips, category) fully rounded; buttons 12px.
- **Elevation:** flat. Hierarchy comes from surface color steps (background → card → muted), not shadows. Single exception: bottom sheets get a subtle top shadow.
- **Tap targets:** minimum 44×44px, 48px for set-row controls.

## 5. Core components

Built from shadcn/ui primitives; customizations below.

### Buttons
- **Primary** (lime, bold, full-width on mobile): one per screen max — "Start workout", "Add exercise".
- **Secondary**: `--muted` background, foreground text — "Add set".
- **Ghost/icon**: warm-up toggle, edit, overflow menus.

### Set row (the most important component)
A horizontal row: `#  |  weight input  |  ×  |  reps input  |  warm-up toggle`.
- Inputs: large tabular numerals (24px), `inputmode="decimal"` / `"numeric"`, background `--muted`, no visible borders, focus = lime ring.
- **Steppers** on focus: ±2.5 kg for weight, ±1 for reps, rendered as large touch buttons flanking the input.
- Ghost values from the last session appear as placeholders; tapping the row's check confirms them as real values in one tap.
- Last-session summary line under the exercise header: `12 Aug: 80×8 · 80×8 · 82.5×6` in `text-sm` muted.
- Save state: brief lime check pulse per row on successful save; amber dot if a save is retrying.

### Effort slider (per exercise)
5 discrete steps, labeled at the ends only: "locker" ←→ "alles gegeben". Track muted, filled portion lime, thumb 28px. Optional — unset state is visually quiet.

### Exercise card (in workout log)
Card = exercise header (name, variation chips, overflow) + set rows + "Add set" + effort/note footer (collapsed until tapped).

### Exercise picker
Bottom sheet (shadcn `Drawer`), search field autofocused, "recently used" list first, inline create as the last row ("＋ 'Kurzhantel Rudern' anlegen"). Full-height sheet, dismiss by swipe.

### Chips / dropdowns
Variation attributes (grip etc.) as chip-triggered dropdowns in the exercise header — never a separate settings page mid-workout.

### Charts (Recharts)
Dark axes (`--border` gridlines, muted labels), 2px lines, no dots except on the last point (lime, filled), tooltip = card surface. Metric toggle as segmented control above the chart.

### Empty states
One line of guidance + one primary action. E.g. Dashboard, no data: "Noch keine Workouts geloggt. Starte dein erstes und die Charts füllen sich." → \[Start workout].

## 6. Motion

Minimal and functional, 150–200ms, `ease-out`:
- Sheets slide up; list items animate in with slight fade only.
- Set-saved: 200ms lime check pulse.
- No page-transition animations, no loading spinners for <300ms operations (optimistic UI instead).
- Respect `prefers-reduced-motion`.

## 7. Voice & tone (microcopy)

- **Sprache: Deutsch**, informelles "du". Kurz, aktiv, körperlich: "Satz hinzufügen", "Workout starten", "Alles gespeichert".
- Zahlen-Format: `80 × 8`, Gewicht mit Komma (`82,5 kg`), Datum kurz (`12. Aug`).
- Ermutigend, nie belehrend. Kein "Du hast dein Ziel verfehlt" — stattdessen neutral: "2 von 3 Workouts diese Woche".
- Fehler konkret + Ausweg: "Speichern fehlgeschlagen – wird automatisch wiederholt."

## 8. Accessibility

- Contrast ≥ 4.5:1 for all text (the palette above passes on its surfaces; verify lime-on-dark for small text — use lime only ≥ 18px or bold).
- Focus visible everywhere (lime ring); full keyboard operability on desktop.
- Slider and toggles with proper `aria` labels; charts get a data-table fallback (`sr-only`).
- Hit targets ≥ 44px; no information conveyed by color alone (warm-up sets also get a "W" badge).

## 9. Implementation notes for Claude Code

1. Put all tokens from section 2 into `globals.css` as the shadcn `:root`/`.dark` variable block (dark values are the default theme; `.dark` and `:root` identical for v1).
2. `tailwind.config.ts`: map semantic colors to the CSS variables (standard shadcn setup), set `fontFamily.sans` to Inter via `next/font`, add `borderRadius` from `--radius`.
3. Use shadcn components: `Button`, `Input`, `Drawer` (picker), `Slider` (effort), `Tabs`/segmented (chart metric), `Badge` (chips), `Calendar`-free custom heatmap (simple CSS grid).
4. Build the **set row** as a dedicated component first — it's the heart of the app; everything else is standard.
