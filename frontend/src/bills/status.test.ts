import { describe, expect, it } from "vitest";

import { billStatus } from "./status";

const TODAY = "2026-10-31";

describe("a bill's status", () => {
  it("is unpaid while it's due today or later", () => {
    expect(billStatus({ due_date: "2026-10-31", paid_on: null }, TODAY)).toBe("unpaid");
    expect(billStatus({ due_date: "2026-11-30", paid_on: null }, TODAY)).toBe("unpaid");
  });

  it("is overdue once its due date is before today", () => {
    expect(billStatus({ due_date: "2026-10-30", paid_on: null }, TODAY)).toBe("overdue");
    expect(billStatus({ due_date: "2025-12-31", paid_on: null }, TODAY)).toBe("overdue");
  });

  it("turns overdue when the day changes, with nothing else changing", () => {
    const bill = { due_date: "2026-10-31", paid_on: null };
    expect(billStatus(bill, "2026-10-31")).toBe("unpaid");
    expect(billStatus(bill, "2026-11-01")).toBe("overdue");
  });

  it("is paid once it has a paid date, and never overdue", () => {
    expect(billStatus({ due_date: "2026-10-01", paid_on: "2026-10-20" }, TODAY)).toBe("paid");
    expect(billStatus({ due_date: "2026-11-30", paid_on: "2026-10-31" }, TODAY)).toBe("paid");
  });
});
