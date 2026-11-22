// TF01: money and dates as the spec shows them.
import { formatDate, longDate, money, relativeDay, shortDate, shortMoney } from "./format";
import { localToday } from "./today";

test("money in whole US dollars", () => {
  expect(money(48200)).toBe("$48,200");
  expect(money(0)).toBe("$0");
  expect(money(1234567890)).toBe("$1,234,567,890");
  expect(money(99.6)).toBe("$100");
});

test("short money for chart axes", () => {
  expect(shortMoney(1_200_000)).toBe("$1.2M");
  expect(shortMoney(80_000)).toBe("$80K");
  expect(shortMoney(12_500)).toBe("$12.5K");
  expect(shortMoney(0)).toBe("$0");
  expect(shortMoney(950)).toBe("$950");
  expect(shortMoney(2_000_000_000)).toBe("$2000M");
});

test("dates as 16 Nov 2026", () => {
  expect(formatDate("2026-11-16")).toBe("16 Nov 2026");
  expect(formatDate("2026-01-05T10:42:00")).toBe("5 Jan 2026");
  expect(formatDate(null)).toBe("");
  expect(shortDate("2026-11-09")).toBe("9 Nov");
  expect(longDate("2026-11-16")).toBe("Monday 16 November 2026");
});

test("days relative to today", () => {
  expect(relativeDay("2026-11-16T10:42:00", "2026-11-16")).toBe("Today");
  expect(relativeDay("2026-11-15", "2026-11-16")).toBe("Yesterday");
  expect(relativeDay("2026-02-28", "2026-03-01")).toBe("Yesterday");
  expect(relativeDay("2026-11-12", "2026-11-16")).toBe("12 Nov");
});

test("today is the computer's local date", () => {
  expect(localToday(new Date(2026, 10, 16, 23, 59))).toBe("2026-11-16");
  expect(localToday(new Date(2026, 0, 1, 0, 1))).toBe("2026-01-01");
});
