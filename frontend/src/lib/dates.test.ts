import { describe, expect, it } from "vitest";
import { addDaysTo, daysLate, localInputToUtc, parseDay, utcToLocalInput } from "./dates";

describe("dates", () => {
  it("reads YYYY-MM-DD as a local day", () => {
    const day = parseDay("2026-11-19");
    expect([day.getFullYear(), day.getMonth(), day.getDate()]).toEqual([2026, 10, 19]);
    expect(day.getHours()).toBe(0);
  });

  it("turns a local date-time into UTC and back unchanged", () => {
    // Los Angeles is UTC-8 in November.
    expect(localInputToUtc("2026-11-19T14:30")).toBe("2026-11-19T22:30:00Z");
    expect(utcToLocalInput("2026-11-19T22:30:00Z")).toBe("2026-11-19T14:30");
    expect(utcToLocalInput(localInputToUtc("2026-07-04T09:05"))).toBe("2026-07-04T09:05");
  });

  it("counts days late", () => {
    expect(daysLate("2026-11-13", "2026-11-19")).toBe(6);
    expect(daysLate("2026-11-19", "2026-11-19")).toBe(0);
    expect(daysLate("2026-11-25", "2026-11-19")).toBe(0);
    // Across the clocks changing (Nov 1, 2026 in the US).
    expect(daysLate("2026-10-31", "2026-11-02")).toBe(2);
  });

  it("adds days across months and years", () => {
    expect(addDaysTo("2026-11-19", 30)).toBe("2026-12-19");
    expect(addDaysTo("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDaysTo("2026-11-19", -30)).toBe("2026-10-20");
  });
});
