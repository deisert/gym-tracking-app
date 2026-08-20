import { describe, expect, it } from "vitest";
import { clampDragX, resolveSwipeOutcome } from "@/lib/swipe-gesture";

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
