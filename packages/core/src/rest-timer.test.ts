import { describe, expect, it } from "vitest";
import {
  clampRestSeconds,
  DEFAULT_REST_TIMER_PREFS,
  formatRestTime,
  parseRestTimerPrefs,
  REST_TIMER_SECONDS,
  restRemainingSeconds,
} from "./rest-timer";

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

describe("clampRestSeconds", () => {
  it("keeps values on the 15 s grid inside the bounds", () => {
    expect(clampRestSeconds(90)).toBe(90);
    expect(clampRestSeconds(15)).toBe(15);
    expect(clampRestSeconds(600)).toBe(600);
  });

  it("snaps to the nearest 15 s step", () => {
    expect(clampRestSeconds(97)).toBe(90);
    expect(clampRestSeconds(98)).toBe(105);
  });

  it("clamps to the bounds", () => {
    expect(clampRestSeconds(0)).toBe(15);
    expect(clampRestSeconds(-30)).toBe(15);
    expect(clampRestSeconds(3600)).toBe(600);
  });

  it("falls back to the default for non-numbers", () => {
    expect(clampRestSeconds(NaN)).toBe(REST_TIMER_SECONDS);
    expect(clampRestSeconds(Infinity)).toBe(REST_TIMER_SECONDS);
  });
});

describe("parseRestTimerPrefs", () => {
  it("defaults when nothing is stored", () => {
    expect(parseRestTimerPrefs(null)).toEqual(DEFAULT_REST_TIMER_PREFS);
    expect(parseRestTimerPrefs("")).toEqual(DEFAULT_REST_TIMER_PREFS);
  });

  it("reads a stored value", () => {
    expect(parseRestTimerPrefs('{"seconds":90,"sound":false}')).toEqual({
      seconds: 90,
      sound: false,
    });
  });

  it("defaults on broken JSON or a non-object", () => {
    expect(parseRestTimerPrefs("{")).toEqual(DEFAULT_REST_TIMER_PREFS);
    expect(parseRestTimerPrefs("42")).toEqual(DEFAULT_REST_TIMER_PREFS);
    expect(parseRestTimerPrefs("null")).toEqual(DEFAULT_REST_TIMER_PREFS);
  });

  it("keeps the usable field when the other is wrong", () => {
    expect(parseRestTimerPrefs('{"seconds":"90","sound":false}')).toEqual({
      seconds: REST_TIMER_SECONDS,
      sound: false,
    });
    expect(parseRestTimerPrefs('{"seconds":9999}')).toEqual({ seconds: 600, sound: true });
  });
});
