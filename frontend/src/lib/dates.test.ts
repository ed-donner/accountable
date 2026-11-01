import { afterEach, describe, expect, it, vi } from "vitest";

import { formatDate, formatDateTime, formatShortDate, todayIso } from "./dates";

afterEach(() => {
  vi.unstubAllEnvs();
});

const ZONES = ["America/Los_Angeles", "America/New_York", "UTC", "Asia/Tokyo", "Asia/Kolkata", "Pacific/Auckland"];

describe("plain dates", () => {
  it("read as written", () => {
    expect(formatDate("2026-10-31")).toBe("Oct 31, 2026");
    expect(formatShortDate("2026-10-31")).toBe("Oct 31");
  });

  it.each(ZONES)("don't shift near midnight in %s", (zone) => {
    vi.stubEnv("TZ", zone);
    expect(formatDate("2026-01-01")).toBe("Jan 1, 2026");
    expect(formatDate("2026-12-31")).toBe("Dec 31, 2026");
  });
});

describe("times", () => {
  it("show as local time", () => {
    vi.stubEnv("TZ", "America/New_York");
    expect(formatDateTime("2026-10-31T19:20:00Z")).toBe("Oct 31, 3:20 PM");
  });

  it("show as local time on the other side of the world", () => {
    vi.stubEnv("TZ", "Asia/Tokyo");
    expect(formatDateTime("2026-10-31T19:20:00Z")).toBe("Nov 1, 4:20 AM");
  });
});

describe("todayIso", () => {
  it("uses the local date, not the UTC one", () => {
    vi.stubEnv("TZ", "America/Los_Angeles");
    expect(todayIso(new Date("2026-11-01T03:00:00Z"))).toBe("2026-10-31");
  });
});
