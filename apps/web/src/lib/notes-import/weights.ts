/**
 * The cable stacks move in fixed steps, but the log writes the same step
 * several ways (21.8 / 21.85 / 21.875). Snap each written fraction to its real
 * step so one stack position is one value. Keys are the digits after the dot.
 */
const FRACTION_FIX: Record<string, string> = {
  "8": "875",
  "85": "875",
  "825": "875",
  "9": "875",
  "3": "375",
  "325": "375",
  "35": "375",
  "4": "375",
  "2": "25",
  "26": "25",
  "6": "5",
};

export function normalizeWeightTerm(term: string): number {
  const cleaned = term.trim().replace(",", ".");
  const [whole, fraction] = cleaned.split(".");
  if (fraction === undefined) return Number(whole);
  return Number(`${whole}.${FRACTION_FIX[fraction] ?? fraction}`);
}

/** `weight_kg` is numeric(6,2): 21.875 is stored as 21.88. */
export function roundKg(kg: number): number {
  return Math.round(kg * 100) / 100;
}

/** "25+15+10" → 50, "18.75+ 0.625" → 19.38, "21.85" → 21.88. */
export function parseWeight(text: string): number {
  const sum = text
    .split("+")
    .reduce((total, term) => total + normalizeWeightTerm(term), 0);
  return roundKg(sum);
}
