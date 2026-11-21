import { describe, expect, it } from "vitest";
import {
  dealsWonSummary,
  funnelShares,
  monthLabel,
  monthName,
  niceTicks,
  recentWhen,
  revenueSummary,
  shortDay,
} from "./dashboard";

const months = [
  { month: "2025-12", revenue: 140_000, deals: 1 },
  { month: "2026-01", revenue: 0, deals: 0 },
  { month: "2026-05", revenue: 55_000, deals: 2 },
  { month: "2026-08", revenue: 140_000, deals: 1 },
  { month: "2026-11", revenue: 54_000, deals: 1 },
];

describe("month labels", () => {
  it("reads YYYY-MM as that month, whatever the time zone", () => {
    expect(monthLabel("2025-12")).toBe("Dec");
    expect(monthLabel("2026-01")).toBe("Jan");
    expect(monthName("2026-08")).toBe("August 2026");
  });
});

describe("chart summaries for screen readers (plan, Phase 8)", () => {
  it("revenue: the total and the highest month, the latest on a tie", () => {
    expect(revenueSummary(months)).toBe("Revenue won over the last 12 months: $389,000. Highest in August: $140,000.");
  });

  it("deals won: the total and the busiest month", () => {
    expect(dealsWonSummary(months)).toBe("Deals won over the last 12 months: 5. Most in May: 2.");
  });

  it("says plainly when nothing was won", () => {
    const none = months.map((m) => ({ ...m, revenue: 0, deals: 0 }));
    expect(revenueSummary(none)).toBe("Revenue won over the last 12 months: $0.");
    expect(dealsWonSummary(none)).toBe("Deals won over the last 12 months: 0.");
  });
});

describe("funnelShares", () => {
  it("is each step's value over the step before it, to a whole percent (decision 16)", () => {
    const steps = [{ value: 1_000 }, { value: 620 }, { value: 310 }, { value: 0 }, { value: 0 }];
    expect(funnelShares(steps)).toEqual([62, 50, 0, null]);
  });
});

describe("dates on the dashboard", () => {
  it("a follow-up's day is short: Nov 13", () => {
    expect(shortDay("2026-11-13")).toBe("Nov 13");
  });

  it("recent activity says today and yesterday in local time", () => {
    // 22:30 UTC on Nov 19 is 2:30 PM in Los Angeles, the tests' time zone.
    expect(recentWhen("2026-11-19T22:30:00Z", "2026-11-19")).toBe("Today, 2:30 PM");
    expect(recentWhen("2026-11-19T00:30:00Z", "2026-11-19")).toBe("Yesterday, 4:30 PM");
    expect(recentWhen("2026-11-16T23:20:00Z", "2026-11-19")).toBe("Nov 16, 3:20 PM");
    expect(recentWhen("2025-11-16T23:20:00Z", "2026-11-19")).toBe("Nov 16, 2025");
  });
});

describe("niceTicks", () => {
  it("steps in round amounts past the largest figure", () => {
    expect(niceTicks(140_000)).toEqual([0, 50_000, 100_000, 150_000]);
    expect(niceTicks(96_000)).toEqual([0, 25_000, 50_000, 75_000, 100_000]);
    expect(niceTicks(54_000)).toEqual([0, 20_000, 40_000, 60_000]);
    expect(niceTicks(1_200_000)).toEqual([0, 500_000, 1_000_000, 1_500_000]);
    expect(niceTicks(100_000)).toEqual([0, 25_000, 50_000, 75_000, 100_000]);
  });

  it("gives a plain axis when nothing was won", () => {
    expect(niceTicks(0)).toEqual([0, 1]);
  });
});
