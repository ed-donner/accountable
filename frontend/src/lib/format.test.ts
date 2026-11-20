import { describe, expect, it } from "vitest";
import {
  countLine,
  dashboardDate,
  dueLabel,
  formatDate,
  formatDateTime,
  formatLocalDate,
  initials,
  money,
  percent,
  plural,
  shortMoney,
} from "./format";

describe("money", () => {
  it("shows whole dollars with the sign and separators", () => {
    expect(money(48500)).toBe("$48,500");
    expect(money(1011000)).toBe("$1,011,000");
  });

  it("shows zero as $0, never with cents", () => {
    expect(money(0)).toBe("$0");
    expect(money(24250.5)).not.toContain(".");
  });
});

describe("short money for chart axes", () => {
  it.each([
    [1_200_000, "$1.2M"],
    [1_000_000, "$1M"],
    [48_500, "$48.5k"],
    [50_000, "$50k"],
    [150_000, "$150k"],
    [950, "$950"],
    [0, "$0"],
  ])("%d is %s", (value, expected) => {
    expect(shortMoney(value)).toBe(expected);
  });
});

describe("dates", () => {
  it("shows a day as Nov 19, 2026", () => {
    expect(formatDate("2026-11-19")).toBe("Nov 19, 2026");
  });

  it('keeps "2026-11-19" on Nov 19, even west of UTC', () => {
    expect(formatDate("2026-11-19")).toContain("19");
    expect(formatDate("2026-01-01")).toBe("Jan 1, 2026");
  });

  it("shows a UTC date-time in local time", () => {
    // 22:30 UTC is 2:30 PM in Los Angeles.
    expect(formatDateTime("2026-11-19T22:30:00Z")).toBe("Nov 19, 2026, 2:30 PM");
    // 03:00 UTC on Nov 20 is still Nov 19 there.
    expect(formatLocalDate("2026-11-20T03:00:00Z")).toBe("Nov 19, 2026");
  });

  it("writes the dashboard's date line", () => {
    expect(dashboardDate("2026-11-19")).toBe("Thursday, November 19");
  });

  it("labels follow-up dates", () => {
    expect(dueLabel("2026-11-13", "2026-11-19")).toBe("6 days late");
    expect(dueLabel("2026-11-18", "2026-11-19")).toBe("1 day late");
    expect(dueLabel("2026-11-19", "2026-11-19")).toBe("Today");
    expect(dueLabel("2026-11-20", "2026-11-19")).toBe("Tomorrow");
    expect(dueLabel("2026-11-23", "2026-11-19")).toBe("Monday");
    expect(dueLabel("2026-12-01", "2026-11-19")).toBe("Dec 1, 2026");
  });
});

describe("counts", () => {
  it("uses the singular for one", () => {
    expect(plural(1, "contact")).toBe("1 contact");
    expect(plural(40, "contact")).toBe("40 contacts");
    expect(plural(1, "activity")).toBe("1 activity");
    expect(plural(6, "activity")).toBe("6 activities");
    expect(plural(0, "deal")).toBe("0 deals");
  });

  it("writes the table's count line", () => {
    expect(countLine(40, 40, "contact")).toBe("40 contacts");
    expect(countLine(3, 40, "contact")).toBe("3 of 40 contacts");
    expect(countLine(1, 1, "deal")).toBe("1 deal");
  });

  it("shows percentages and initials", () => {
    expect(percent(50)).toBe("50%");
    expect(initials("Sarah Chen")).toBe("SC");
    expect(initials("Marcus van der Webb")).toBe("MW");
    expect(initials("Cher")).toBe("C");
  });
});

describe("the time zone setting", () => {
  it("runs the tests in America/Los_Angeles, so UTC mistakes show up", () => {
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe("America/Los_Angeles");
    // Midnight UTC on Nov 19 is still Nov 18 in Los Angeles.
    expect(new Date("2026-11-19T00:00:00Z").getDate()).toBe(18);
  });
});
