import { describe, expect, it } from "vitest";
import { exerciseNameSchema, setInputSchema, workoutMetaSchema } from "@/lib/validation";

describe("setInputSchema", () => {
  it("accepts a normal working set", () => {
    expect(setInputSchema.safeParse({ weight_kg: 82.5, reps: 6, is_warmup: false }).success).toBe(true);
  });

  it("accepts 0 kg as bodyweight", () => {
    expect(setInputSchema.safeParse({ weight_kg: 0, reps: 12, is_warmup: false }).success).toBe(true);
  });

  it("rejects negative weight", () => {
    expect(setInputSchema.safeParse({ weight_kg: -1, reps: 5, is_warmup: false }).success).toBe(false);
  });

  it("rejects weight above the numeric(6,2) ceiling", () => {
    expect(setInputSchema.safeParse({ weight_kg: 10000, reps: 5, is_warmup: false }).success).toBe(false);
    expect(setInputSchema.safeParse({ weight_kg: 9999.99, reps: 5, is_warmup: false }).success).toBe(true);
  });

  it("rejects more than two decimal places", () => {
    expect(setInputSchema.safeParse({ weight_kg: 80.125, reps: 5, is_warmup: false }).success).toBe(false);
  });

  it("accepts two decimal places that float arithmetic handles badly", () => {
    expect(setInputSchema.safeParse({ weight_kg: 0.07, reps: 5, is_warmup: false }).success).toBe(true);
  });

  it("rejects zero or fractional reps", () => {
    expect(setInputSchema.safeParse({ weight_kg: 80, reps: 0, is_warmup: false }).success).toBe(false);
    expect(setInputSchema.safeParse({ weight_kg: 80, reps: 5.5, is_warmup: false }).success).toBe(false);
  });

  it("rejects NaN weight, which is what an empty input parses to", () => {
    expect(setInputSchema.safeParse({ weight_kg: NaN, reps: 5, is_warmup: false }).success).toBe(false);
  });
});

describe("exerciseNameSchema", () => {
  it("trims surrounding whitespace", () => {
    expect(exerciseNameSchema.parse("  Bankdrücken  ")).toBe("Bankdrücken");
  });

  it("rejects an empty or whitespace-only name", () => {
    expect(exerciseNameSchema.safeParse("").success).toBe(false);
    expect(exerciseNameSchema.safeParse("   ").success).toBe(false);
  });

  it("rejects names longer than 80 characters", () => {
    expect(exerciseNameSchema.safeParse("x".repeat(81)).success).toBe(false);
  });
});

describe("workoutMetaSchema", () => {
  it("accepts a full set of fields", () => {
    const result = workoutMetaSchema.safeParse({
      performed_on: "2026-08-17",
      category: "Push",
      note: "gut gelaufen",
    });
    expect(result.success).toBe(true);
  });

  it("accepts null category and note", () => {
    expect(
      workoutMetaSchema.safeParse({ performed_on: "2026-08-17", category: null, note: null }).success
    ).toBe(true);
  });

  it("rejects a malformed date", () => {
    expect(
      workoutMetaSchema.safeParse({ performed_on: "17.08.2026", category: null, note: null }).success
    ).toBe(false);
  });

  it("rejects an impossible date", () => {
    expect(
      workoutMetaSchema.safeParse({ performed_on: "2026-13-01", category: null, note: null }).success
    ).toBe(false);
  });
});
