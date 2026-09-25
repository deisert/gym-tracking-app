import { parseWeight } from "./weights";
import type { RawSet, Side } from "./types";

export type SetLine =
  | { kind: "set"; set: Omit<RawSet, "line"> }
  | { kind: "unknown-reps"; weightKg: number }
  | { kind: "bare"; value: number }
  | { kind: "none" };

const WEIGHT = String.raw`\d+(?:[.,]\d+)?(?:\s*\+\s*\d+(?:[.,]\d+)?)*`;
const SET_START = new RegExp(String.raw`^(${WEIGHT})\s*/\s*(.*)$`);
// reps, optional "-N" (range, or old-style unclean when N is smaller),
// optional "_N" / "+N" unclean reps, stray "?", then free text.
const REPS = /^(\d+(?:[.,]\d+)?)(?:\s*-\s*(\d+))?\s*(?:_+\s*(\d+)|\+\s*(\d+))?\s*\?*\s*(.*)$/;
const BARE = /^\d+(?:[.,]\d+)?$/;

type Annotation = {
  text: string | null;
  isWarmup: boolean;
  isDropset: boolean;
  uncleanReps: number;
  perSide: boolean;
  perSideWeightKg: number | null;
  side: Side | null;
};

/** Pulls the known markers out of the text after the reps; what is left is the note. */
export function parseAnnotation(input: string): Annotation {
  let text = ` ${input} `;
  const take = (pattern: RegExp): RegExpExecArray | null => {
    const match = pattern.exec(text);
    if (match) text = text.replace(match[0], " ");
    return match;
  };

  const isDropset = take(/\bdrop\s*set\b|\bdropset\b|\bdrop\b/i) !== null;
  const isWarmup = !/\bno\s+warm-?up\b/i.test(text) && take(/\bwarm-?up\b/i) !== null;

  let uncleanReps = 0;
  const halves = take(/(\d+)\s*halbe\b/i);
  if (halves) uncleanReps += Number(halves[1]);
  const halfRange = take(/\(?\s*(\d+)\s*-\s*(\d+)\s*half\s*\)?/i);
  if (halfRange) uncleanReps += Math.floor((Number(halfRange[1]) + Number(halfRange[2])) / 2);

  const each = take(/\(?\s*(?:(\d+(?:[.,]\d+)?)\s+)?each(?:\s+side)?\s*\)?/i);
  const sideMatch = take(/(?:^|[\s/])([lr])\s*$/i);

  const rest = text.replace(/[()]/g, " ").replace(/\s+/g, " ").trim();
  return {
    text: rest === "" ? null : rest,
    isWarmup,
    isDropset,
    uncleanReps,
    perSide: each !== null,
    perSideWeightKg: each?.[1] ? parseWeight(each[1]) : null,
    side: sideMatch ? (sideMatch[1].toUpperCase() as Side) : null,
  };
}

export function parseSetLine(input: string): SetLine {
  const text = input
    .trim()
    .replace(/\/{2,}/g, "/")
    .replace(/(\d):(\d)/g, "$1/$2");

  const start = SET_START.exec(text);
  if (!start) {
    return BARE.test(text) ? { kind: "bare", value: parseWeight(text) } : { kind: "none" };
  }

  const weightKg = parseWeight(start[1]);
  const reps = REPS.exec(start[2].trim());
  if (!reps) return { kind: "unknown-reps", weightKg };

  const [, first, second, underscore, plus, tail] = reps;
  let clean = Number(first.replace(",", "."));
  let unclean = Number(underscore ?? plus ?? 0);
  if (second !== undefined) {
    const upper = Number(second);
    // "10-12" is a range; "7-3" is how unclean reps were written before "_3".
    if (upper >= clean) clean = Math.floor((clean + upper) / 2);
    else unclean += upper;
  }
  if (!Number.isInteger(clean)) {
    // "11.5" = 11 clean reps and one half rep.
    clean = Math.floor(clean);
    unclean += 1;
  }
  if (clean < 1) return { kind: "unknown-reps", weightKg };

  const note = parseAnnotation(tail);
  return {
    kind: "set",
    set: {
      weightKg,
      perSideWeightKg: note.perSideWeightKg,
      perSide: note.perSide,
      reps: clean,
      uncleanReps: unclean + note.uncleanReps,
      isWarmup: note.isWarmup,
      isDropset: note.isDropset,
      side: note.side,
      annotation: note.text,
    },
  };
}

function bodyweightSet(reps: number, uncleanReps: number): SetLine {
  return {
    kind: "set",
    set: {
      weightKg: 0,
      perSideWeightKg: null,
      perSide: false,
      reps,
      uncleanReps,
      isWarmup: false,
      isDropset: false,
      side: null,
      annotation: null,
    },
  };
}

/** Leg raises: "7 straight 4 bent" = 7 clean (straight legs) + 4 unclean (bent). */
export function parseBodyweightLine(input: string): SetLine {
  const text = input.trim().toLowerCase();

  let match = /^(\d+)(?:\s*_+\s*(\d+))?$/.exec(text);
  if (match) return bodyweightSet(Number(match[1]), Number(match[2] ?? 0));

  match = /^(\d+)\s+straight(?:\s+leg)?(?:\s+(\d+)(?:\s+bent)?)?$/.exec(text);
  if (match) return bodyweightSet(Number(match[1]), Number(match[2] ?? 0));

  match = /^straight\s+(\d+)$/.exec(text);
  if (match) return bodyweightSet(Number(match[1]), 0);

  if (/^(\?|straight|bent)/.test(text)) return { kind: "unknown-reps", weightKg: 0 };
  return { kind: "none" };
}
