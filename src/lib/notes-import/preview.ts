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
