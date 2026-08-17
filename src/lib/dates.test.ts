import { describe, expect, it } from "vitest";
import { formatPerformedOn, localDateString, startOfWeekMonday } from "@/lib/dates";

describe("localDateString", () => {
  it("formats a local date without shifting through UTC", () => {
    // 23:30 local on 17 Aug must stay 17 Aug, even though it is 18 Aug in UTC
    // for timezones east of Greenwich.
    expect(localDateString(new Date(2026, 7, 17, 23, 30))).toBe("2026-08-17");
  });

  it("zero-pads month and day", () => {
    expect(localDateString(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});

describe("startOfWeekMonday", () => {
  it("returns the same day for a Monday", () => {
    expect(startOfWeekMonday(new Date(2026, 7, 17))).toBe("2026-08-17"); // Monday
  });

  it("walks back to Monday from a Sunday", () => {
    expect(startOfWeekMonday(new Date(2026, 7, 23))).toBe("2026-08-17"); // Sunday
  });

  it("crosses a month boundary", () => {
    expect(startOfWeekMonday(new Date(2026, 8, 2))).toBe("2026-08-31"); // Wed 2 Sep
  });
});

describe("formatPerformedOn", () => {
  it("renders a short German date", () => {
    expect(formatPerformedOn("2026-08-12")).toBe("12. Aug");
  });

  it("strips the leading zero from the day", () => {
    expect(formatPerformedOn("2026-03-05")).toBe("5. Mär");
  });
});
