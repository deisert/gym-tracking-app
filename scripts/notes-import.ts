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
import { isAbsolute, join, relative, resolve } from "node:path";

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

function isInside(dir: string, root: string): boolean {
  const rel = relative(root, dir);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}
const repoRoot = resolve(__dirname, "..");
if (isInside(resolve(outDir), repoRoot) || isInside(resolve(outDir), process.cwd())) {
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
const exercises = result.workouts.flatMap((workout) => workout.exercises);
const exerciseNames = [...new Set(exercises.map((exercise) => exercise.name))].sort();

// Render everything before touching the disk, so a throwing emitter writes nothing.
const outputs: [string, string][] = [
  ["preview.html", renderPreview({ result, fates: log.fates, lines, overrides: OVERRIDES })],
  ["dry-run.sql", emitImportSql(result.workouts, { userId, mode: "dry-run" })],
  ["import.sql", emitImportSql(result.workouts, { userId, mode: "commit" })],
  ["rollback.sql", emitRollbackSql({ userId, lastDate, generatedAt, exerciseNames })],
];
mkdirSync(outDir, { recursive: true });
for (const [name, content] of outputs) writeFileSync(join(outDir, name), content);

console.log(
  `workouts=${result.workouts.length} exercises=${exercises.length} ` +
    `sets=${exercises.reduce((total, exercise) => total + exercise.sets.length, 0)} ` +
    `names=${exerciseNames.length} ` +
    `range=${result.workouts[0].performedOn}..${lastDate}`
);
