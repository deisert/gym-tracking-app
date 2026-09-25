import { describe, expect, it } from "vitest";
import { normalizeWeightTerm, parseWeight, roundKg } from "@/lib/notes-import/weights";

describe("normalizeWeightTerm", () => {
  it.each([
    ["80", 80],
    ["82.5", 82.5],
    ["82,5", 82.5],
    ["21.25", 21.25],
    ["21.625", 21.625],
    ["21.8", 21.875],
    ["21.85", 21.875],
    ["26.825", 26.875],
    ["28.9", 28.875],
    ["29.3", 29.375],
    ["29.325", 29.375],
    ["29.35", 29.375],
    ["29.4", 29.375],
    ["21.2", 21.25],
    ["26.26", 26.25],
    ["87.6", 87.5],
  ])("%s → %s", (input, expected) => {
    expect(normalizeWeightTerm(input)).toBe(expected);
  });
});

describe("parseWeight", () => {
  it("rounds to the numeric(6,2) column", () => {
    expect(parseWeight("21.85")).toBe(21.88);
    expect(parseWeight("29.325")).toBe(29.38);
    expect(parseWeight("21.625")).toBe(21.63);
  });

  it("adds summed weights", () => {
    expect(parseWeight("25+15+10")).toBe(50);
    expect(parseWeight("18.75+ 0.625")).toBe(19.38);
  });
});

describe("roundKg", () => {
  it("rounds half up at the cent", () => {
    expect(roundKg(21.875)).toBe(21.88);
    expect(roundKg(12.5)).toBe(12.5);
  });
});
