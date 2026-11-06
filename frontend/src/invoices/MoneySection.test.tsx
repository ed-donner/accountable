import { act, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { mockApi, renderApp, type Call } from "../test-utils";
import { InvoicesMoney } from "./MoneySection";
import type { Money } from "./queries";

const LABELS = ["Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov"];

const MONEY: Money = {
  owed: { cents: "4825000", count: 14 },
  overdue: { cents: "912000", count: 5 },
  groups: [
    { key: "not_due", cents: "3913000", count: 9 },
    { key: "1_30", cents: "480000", count: 2 },
    { key: "31_60", cents: "232000", count: 1 },
    { key: "61_90", cents: "100000", count: 1 },
    { key: "over_90", cents: "100000", count: 1 },
  ],
  payments: LABELS.map((label, index) => ({
    month: `${index === 0 ? 2025 : 2026}-${String(index === 0 ? 12 : index).padStart(2, "0")}`,
    label,
    cents: String((index + 1) * 100000),
    count: index + 1,
  })),
};

const EMPTY: Money = {
  owed: { cents: "0", count: 0 },
  overdue: { cents: "0", count: 0 },
  groups: MONEY.groups.map((group) => ({ ...group, cents: "0", count: 0 })),
  payments: MONEY.payments.map((month) => ({ ...month, cents: "0", count: 0 })),
};

afterEach(() => vi.useRealTimers());

async function open(money: Money | (() => { body: Money })) {
  const calls: Call[] = mockApi({ "GET /invoices/money": money });
  renderApp(<InvoicesMoney />);
  await screen.findByRole("region", { name: "Owed to us" });
  return calls;
}

describe("invoices' side of the Money section", () => {
  it("shows what's owed and what's overdue, each with how many invoices, Overdue linking to Invoices showing it", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date(2026, 10, 5, 12, 0) });
    await open(MONEY);
    const owed = within(await screen.findByRole("region", { name: "Owed to us" }));
    expect(owed.getByText("$48,250.00")).toBeTruthy();
    expect(owed.getByText("14 invoices")).toBeTruthy();
    const overdue = owed.getByRole("link", { name: /Overdue/ });
    expect(overdue.getAttribute("href")).toBe("/invoices?status=overdue");
    expect(overdue.textContent).toBe("Overdue$9,120.005 invoices");
  });

  it("shows the five groups of How late, each with its amount and count, bars sized against the largest", async () => {
    await open(MONEY);
    const groups = within(await screen.findByRole("list", { name: "How late" })).getAllByRole("listitem");
    expect(groups.map((group) => group.textContent)).toEqual([
      "Not yet due$39,130.009",
      "1 to 30 days$4,800.002",
      "31 to 60 days$2,320.001",
      "61 to 90 days$1,000.001",
      "Over 90 days$1,000.001",
    ]);
    const bars = groups.map((group) => group.querySelector<HTMLElement>("span > span"));
    expect(bars[0]!.style.width).toBe("100%");
    expect(bars.map((bar) => bar!.style.backgroundColor)).toEqual([
      "var(--color-cerulean)",
      "var(--color-marigold)",
      "var(--color-coral)",
      "var(--color-raspberry)",
      "var(--color-deep-raspberry)",
    ]);
  });

  it("shows the payments received this month beside last month's, over a chart of the 12 months", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date(2026, 10, 5, 12, 0) });
    await open(MONEY);
    const received = within(await screen.findByRole("region", { name: "Payments received" }));
    expect(received.getByRole("heading", { name: "Payments received in November" })).toBeTruthy();
    expect(received.getByTestId("paid-this-month").textContent).toBe("$12,000.00");
    expect(received.getByTestId("paid-last-month").textContent).toBe("October $11,000.00");
    expect(received.getByRole("img").getAttribute("aria-label")).toBe(
      "Payments received each month for the last 12 months, with $12,000.00 so far this month",
    );
  });

  it("shows sums past 2^53 cents to the cent, as the backend sends them in digits", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date(2026, 10, 5, 12, 0) });
    const past = "9200000000000001";
    await open({
      ...MONEY,
      owed: { cents: past, count: 47 },
      overdue: { cents: past, count: 47 },
      groups: MONEY.groups.map((group) => (group.key === "1_30" ? { ...group, cents: past, count: 47 } : group)),
      payments: MONEY.payments.map((month, index) => (index === 11 ? { ...month, cents: past } : month)),
    });
    const owed = within(await screen.findByRole("region", { name: "Owed to us" }));
    // Owed to us, Overdue, and How late's 1 to 30 days.
    expect(owed.getAllByText("$92,000,000,000,000.01")).toHaveLength(3);
    expect(owed.getByRole("link", { name: /Overdue/ }).textContent).toBe("Overdue$92,000,000,000,000.0147 invoices");
    const late = within(screen.getByRole("list", { name: "How late" })).getAllByRole("listitem")[1];
    expect(late.textContent).toBe("1 to 30 days$92,000,000,000,000.0147");
    expect(screen.getByTestId("paid-this-month").textContent).toBe("$92,000,000,000,000.01");
  });

  it("shows $0.00 owed with Nothing owed in place of How late, and No payments, with nothing divided by zero", async () => {
    await open(EMPTY);
    expect(await screen.findByText("Nothing owed.")).toBeTruthy();
    const owed = within(screen.getByRole("region", { name: "Owed to us" }));
    expect(owed.getAllByText("$0.00")).toHaveLength(2);
    expect(owed.getAllByText("0 invoices")).toHaveLength(2);
    expect(owed.getByRole("heading", { name: "How late" })).toBeTruthy();
    expect(owed.queryByRole("list", { name: "How late" })).toBeNull();
    expect(screen.getByText("No payments in the last 12 months.")).toBeTruthy();
    expect(screen.queryByText(/NaN|Infinity/)).toBeNull();
  });

  it("reads its figures again when the day changes", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date(2026, 10, 5, 23, 59) });
    let reads = 0;
    await open(() => {
      reads += 1;
      return { body: reads === 1 ? EMPTY : MONEY };
    });
    expect(await screen.findByText("Nothing owed.")).toBeTruthy();
    vi.setSystemTime(new Date(2026, 10, 6, 0, 1));
    act(() => window.dispatchEvent(new Event("focus")));
    expect(await screen.findByText("$48,250.00")).toBeTruthy();
    expect(reads).toBe(2);
  });
});
