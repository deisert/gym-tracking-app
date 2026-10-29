import { describe, expect, it } from "vitest";
import { formatRestTime, restRemainingSeconds } from "./rest-timer";

describe("restRemainingSeconds", () => {
  const now = 1_000_000;

  it("rounds a partial second up", () => {
    expect(restRemainingSeconds(now + 83_200, now)).toBe(84);
  });

  it("reports the full duration at the start", () => {
    expect(restRemainingSeconds(now + 120_000, now)).toBe(120);
  });

  it("is 0 exactly at the end", () => {
    expect(restRemainingSeconds(now, now)).toBe(0);
  });

  it("never goes below 0 once the end has passed", () => {
    expect(restRemainingSeconds(now - 5_000, now)).toBe(0);
  });

  it("is right after a long gap with no ticks (phone locked)", () => {
    const start = 5_000_000;
    expect(restRemainingSeconds(start + 120_000, start + 90_000)).toBe(30);
  });
});

describe("formatRestTime", () => {
  it.each([
    [120, "2:00"],
    [84, "1:24"],
    [5, "0:05"],
    [0, "0:00"],
    [600, "10:00"],
    [-3, "0:00"],
    [NaN, "0:00"],
  ])("formats %s as %s", (seconds, expected) => {
    expect(formatRestTime(seconds)).toBe(expected);
  });
});
