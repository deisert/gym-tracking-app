import { describe, expect, it } from "vitest";
import {
  detectSessionRecords,
  e1rm,
  formatRecordHits,
  type RecordBaseline,
} from "./records";

const baseline: RecordBaseline = {
  maxWeightKg: 80,
  maxE1rmKg: 101.3, // 80 × 8
  maxRepsAtWeight: { "60": 12, "80": 8 },
};

const work = (weight_kg: number, reps: number) => ({ weight_kg, reps, is_warmup: false });
const kinds = (hits: { kind: string }[]) => hits.map((hit) => hit.kind);

describe("e1rm", () => {
  it("is Epley rounded to one decimal, like the SQL view", () => {
    expect(e1rm(80, 8)).toBe(101.3);
    expect(e1rm(0, 10)).toBe(0);
  });
});

describe("detectSessionRecords", () => {
  it("never flags anything without history", () => {
    expect(detectSessionRecords(null, [work(100, 5)])).toEqual([[]]);
  });

  it("flags a heavier set as a weight record, with the previous best", () => {
    const [hits] = detectSessionRecords(baseline, [work(82.5, 6)]);
    // 82,5 × 6 = e1RM 99 — below 101,3, so weight only.
    expect(hits).toEqual([{ kind: "weight", previous: 80 }]);
  });

  it("matching an old best is not a record", () => {
    expect(detectSessionRecords(baseline, [work(80, 8)])).toEqual([[]]);
  });

  it("flags more reps at an already-trained weight", () => {
    const [hits] = detectSessionRecords(baseline, [work(60, 13)]);
    expect(hits).toEqual([{ kind: "reps", previous: 12 }]);
  });

  it("needs an earlier session at exactly that weight for a reps record", () => {
    expect(detectSessionRecords(baseline, [work(70, 10)])).toEqual([[]]);
  });

  it("ignores warm-ups", () => {
    expect(
      detectSessionRecords(baseline, [{ weight_kg: 100, reps: 5, is_warmup: true }])
    ).toEqual([[]]);
  });

  it("bodyweight can only be a reps record", () => {
    const bw: RecordBaseline = { maxWeightKg: 0, maxE1rmKg: 0, maxRepsAtWeight: { "0": 10 } };
    expect(kinds(detectSessionRecords(bw, [work(0, 11)])[0])).toEqual(["reps"]);
    expect(detectSessionRecords(bw, [work(0, 10)])).toEqual([[]]);
  });

  it("celebrates a climb once, on its highest set", () => {
    const result = detectSessionRecords(baseline, [work(82.5, 5), work(85, 5), work(87.5, 4)]);
    expect(kinds(result[0])).toEqual([]);
    expect(kinds(result[1])).toEqual([]);
    expect(kinds(result[2])).toContain("weight");
    expect(result[2].find((hit) => hit.kind === "weight")?.previous).toBe(80);
  });

  it("keeps result index-aligned with the input, warm-ups included", () => {
    const result = detectSessionRecords(baseline, [
      { weight_kg: 40, reps: 10, is_warmup: true },
      work(90, 3),
    ]);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual([]);
    expect(kinds(result[1])).toContain("weight");
  });
});

describe("formatRecordHits", () => {
  it("lists each record with the value it beat", () => {
    expect(
      formatRecordHits(
        [
          { kind: "weight", previous: 80 },
          { kind: "e1rm", previous: 101.3 },
        ],
        work(85, 8)
      )
    ).toBe("Neuer Rekord · Gewicht 85 kg (vorher 80) · e1RM 107,7 kg (vorher 101,3)");
  });

  it("words a reps record with weight and reps", () => {
    expect(formatRecordHits([{ kind: "reps", previous: 12 }], work(60, 13))).toBe(
      "Neuer Rekord · 13 Wdh. bei 60 kg (vorher 12)"
    );
  });
});
