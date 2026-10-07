import { describe, expect, it } from "vitest";
import { clampDragX, isTap, resolveSwipeOutcome, TAP_SLOP } from "@/lib/swipe-gesture";

describe("clampDragX", () => {
  it("passes through a small leftward drag unchanged", () => {
    expect(clampDragX(-30, 88)).toBe(-30);
  });

  it("never allows a positive (rightward) offset", () => {
    expect(clampDragX(20, 88)).toBe(0);
  });

  it("clamps exactly at maxDrag", () => {
    expect(clampDragX(-88, 88)).toBe(-88);
  });

  it("rubber-bands past maxDrag instead of hard-stopping", () => {
    // 30px past the max becomes only 10px of extra travel (÷3).
    expect(clampDragX(-118, 88)).toBeCloseTo(-98, 5);
  });
});

describe("resolveSwipeOutcome", () => {
  it("stays closed under half the reveal width", () => {
    expect(resolveSwipeOutcome(-30, 88, 200)).toBe("closed");
  });

  it("opens past half the reveal width", () => {
    expect(resolveSwipeOutcome(-50, 88, 200)).toBe("open");
  });

  it("treats exactly half the reveal width as open", () => {
    expect(resolveSwipeOutcome(-44, 88, 200)).toBe("open");
  });

  it("commits a delete past the commit threshold", () => {
    expect(resolveSwipeOutcome(-210, 88, 200)).toBe("delete");
  });

  it("treats exactly the commit threshold as a delete", () => {
    expect(resolveSwipeOutcome(-200, 88, 200)).toBe("delete");
  });

  it("documents that resolving against the rubber-banded value instead of raw travel makes the commit threshold nearly unreachable", () => {
    // 200px commit threshold clamped through an 88px reveal width needs ~424px of
    // raw finger travel before clamping brings it down to -200 — resolveSwipeOutcome
    // must always be called with the RAW pointer delta, never with clampDragX's output.
    expect(resolveSwipeOutcome(clampDragX(-220, 88), 88, 200)).not.toBe("delete");
    expect(resolveSwipeOutcome(-220, 88, 200)).toBe("delete");
  });
});

describe("isTap", () => {
  it("treats a still finger as a tap", () => {
    expect(isTap(0)).toBe(true);
  });

  it("treats jitter under the slop as a tap", () => {
    expect(isTap(6)).toBe(true);
  });

  it("treats real travel as a drag", () => {
    expect(isTap(20)).toBe(false);
  });

  it("ignores direction", () => {
    expect(isTap(-6)).toBe(true);
    expect(isTap(-20)).toBe(false);
  });

  it("treats exactly the slop as a drag", () => {
    expect(isTap(TAP_SLOP)).toBe(false);
  });
});

describe("resolveSwipeOutcome with startedOpen", () => {
  it("closes on a short rightward pull from the open position", () => {
    // Open at -88, pulled 30px right -> -58. The closed-row rule would keep it
    // open (58 >= 44); the intent was plainly to put it back.
    expect(resolveSwipeOutcome(-58, 88, 200, { startedOpen: true })).toBe("closed");
  });

  it("keeps it open when the finger barely moved right", () => {
    expect(resolveSwipeOutcome(-78, 88, 200, { startedOpen: true })).toBe("open");
  });

  it("treats exactly the close threshold as closed", () => {
    expect(resolveSwipeOutcome(-64, 88, 200, { startedOpen: true })).toBe("closed");
  });

  it("still commits a delete when swiped further left from open", () => {
    expect(resolveSwipeOutcome(-220, 88, 200, { startedOpen: true })).toBe("delete");
  });

  it("stays open when dragged further left without reaching the commit threshold", () => {
    expect(resolveSwipeOutcome(-120, 88, 200, { startedOpen: true })).toBe("open");
  });

  it("leaves the closed-row rules untouched", () => {
    expect(resolveSwipeOutcome(-58, 88, 200)).toBe("open");
    expect(resolveSwipeOutcome(-30, 88, 200)).toBe("closed");
  });

  it("never commits a delete a row cannot reach with an infinite threshold", () => {
    // Workout rows opt out of full-swipe-through: only a tap on the revealed
    // button may delete a whole session.
    expect(resolveSwipeOutcome(-400, 88, Number.POSITIVE_INFINITY)).toBe("open");
  });
});
