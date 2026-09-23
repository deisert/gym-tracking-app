import { describe, expect, it } from "vitest";
import { addDays, formatPerformedOn, localDateString, mondayOf, startOfWeekMonday } from "@/lib/dates";

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

describe("addDays", () => {
  it("moves forward and backward across month and year boundaries", () => {
    expect(addDays("2026-09-23", 1)).toBe("2026-09-24");
    expect(addDays("2026-08-31", 1)).toBe("2026-09-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("2027-01-01", -1)).toBe("2026-12-31");
  });

  it("is not shifted by the daylight-saving switch", () => {
    expect(addDays("2026-03-29", 1)).toBe("2026-03-30"); // EU clocks go forward on 29 Mar
    expect(addDays("2026-10-25", 1)).toBe("2026-10-26"); // and back on 25 Oct
  });

  it("spans whole weeks", () => {
    expect(addDays("2026-09-21", -77)).toBe("2026-07-06");
  });
});

describe("mondayOf", () => {
  it("keeps a Monday and walks back from any other day", () => {
    expect(mondayOf("2026-09-21")).toBe("2026-09-21"); // Monday
    expect(mondayOf("2026-09-23")).toBe("2026-09-21"); // Wednesday
    expect(mondayOf("2026-08-23")).toBe("2026-08-17"); // Sunday
    expect(mondayOf("2026-09-02")).toBe("2026-08-31"); // across a month
  });

  it("agrees with startOfWeekMonday for every day of a month", () => {
    for (let day = 1; day <= 31; day++) {
      const iso = `2026-08-${String(day).padStart(2, "0")}`;
      expect(mondayOf(iso)).toBe(startOfWeekMonday(new Date(2026, 7, day)));
    }
  });
});
