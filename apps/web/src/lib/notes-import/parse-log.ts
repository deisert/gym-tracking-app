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
    if ("replace" in override && override.replace.length === 0) {
      throw new Error(`Override for line ${override.line} replaces the line with nothing`);
    }
  }
  const byLine = new Map<number, Override>();
  for (const override of overrides) {
    if (byLine.has(override.line)) {
      throw new Error(`Duplicate override for line ${override.line}`);
    }
    byLine.set(override.line, override);
  }

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

/**
 * Whether a line looks like a set in either grammar (weighted or bodyweight),
 * independent of which exercise it falls under. Used to decide whether a
 * date line after this one starts a new workout (spec §5.1).
 */
function isSetShaped(text: string): boolean {
  const asWeighted = parseSetLine(text).kind;
  if (asWeighted === "set" || asWeighted === "unknown-reps") return true;
  return parseBodyweightLine(text).kind === "set";
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
      // Before any exercise, a set-shaped line is a remark ("3/10 müde").
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

    if (v.kind === "text" && isSetShaped(v.text)) block.hasSet = true;
    block.lines.push(v);
  }
  blocks.push(block);

  return { workouts: blocks.map((b) => parseBlock(b, fates)), fates };
}
