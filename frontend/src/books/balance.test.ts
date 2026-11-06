import { describe, expect, it } from "vitest";

import { EVENT_WORDS, ROWS, effect, figures, stops, totals } from "./balance";

const line = (account: string, debit = 0, credit = 0) => ({ account, debit_cents: debit, credit_cents: credit });

describe("stops", () => {
  it("are 12, ending in today, on an ordinary day", () => {
    const found = stops("2026-11-06");
    expect(found).toHaveLength(12);
    expect(found.map((stop) => stop.day)).toEqual([
      "2025-12-31",
      "2026-01-31",
      "2026-02-28",
      "2026-03-31",
      "2026-04-30",
      "2026-05-31",
      "2026-06-30",
      "2026-07-31",
      "2026-08-31",
      "2026-09-30",
      "2026-10-31",
      "2026-11-06",
    ]);
    expect(found.map((stop) => stop.label)).toEqual([
      ...["Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct"],
      "Today",
    ]);
  });

  it("put the year on the first stop and each January's only", () => {
    expect(stops("2026-11-06").flatMap((stop) => (stop.year ? [[stop.label, stop.year]] : []))).toEqual([
      ["Dec", 2025],
      ["Jan", 2026],
    ]);
  });

  it("end in today on the 1st, with last month's end before it", () => {
    const found = stops("2026-11-01");
    expect(found.slice(-2).map((stop) => stop.day)).toEqual(["2026-10-31", "2026-11-01"]);
  });

  it("end in today on a month's last day, which is also that month's stop", () => {
    const found = stops("2026-10-31");
    expect(found.slice(-2).map((stop) => stop.day)).toEqual(["2026-09-30", "2026-10-31"]);
    expect(found[0].day).toBe("2025-11-30");
  });

  it("cross January and give it the year, even when it's today", () => {
    const found = stops("2027-01-15");
    expect(found[0]).toEqual({ day: "2026-02-28", label: "Feb", year: 2026 });
    expect(found[10]).toEqual({ day: "2026-12-31", label: "Dec" });
    expect(found[11]).toEqual({ day: "2027-01-15", label: "Today", year: 2027 });
  });

  it("end February on the 29th in a leap year and the 28th in other years", () => {
    expect(stops("2028-06-10").find((stop) => stop.label === "Feb")?.day).toBe("2028-02-29");
    expect(stops("2027-06-10").find((stop) => stop.label === "Feb")?.day).toBe("2027-02-28");
  });
});

const reply = (changes: Record<string, string> = {}) => {
  const base: Record<string, string> = {
    cash: "6830000",
    receivable: "2700000",
    payable: "900000",
    tax_payable: "180000",
    owners_equity: "4000000",
    revenue: "5000000",
    expense_software: "100000",
    expense_contractors: "200000",
    expense_travel: "50000",
    expense_office: "150000",
    expense_marketing: "20000",
    expense_other: "30000",
    ...changes,
  };
  return Object.entries(base).map(([key, balance_cents]) => ({ key, balance_cents }));
};

describe("figures", () => {
  it("are the six rows in the columns' order", () => {
    const found = figures(reply());
    expect(found.map((figure) => [figure.name, figure.side])).toEqual([
      ["Cash", "left"],
      ["Receivable", "left"],
      ["Payable", "right"],
      ["Tax payable", "right"],
      ["Owner's equity", "right"],
      ["Profit to date", "right"],
    ]);
    expect(found.slice(0, 5).map((figure) => figure.cents)).toEqual([6830000n, 2700000n, 900000n, 180000n, 4000000n]);
  });

  it("take Revenue less each of the six expense accounts for Profit to date", () => {
    expect(figures(reply())[5].cents).toBe(5000000n - 550000n);
  });

  it("keep a loss and an overdrawn Cash below zero", () => {
    const found = figures(reply({ revenue: "100000", cash: "-425000" }));
    expect(found[5].cents).toBe(-450000n);
    expect(found[0].cents).toBe(-425000n);
  });

  it("take a missing account as zero", () => {
    expect(figures([]).map((figure) => figure.cents)).toEqual([0n, 0n, 0n, 0n, 0n, 0n]);
  });

  it("give each account its own color and swatch", () => {
    expect(new Set(ROWS.map((row) => row.fill)).size).toBe(6);
    expect(new Set(ROWS.map((row) => row.swatch)).size).toBe(6);
    expect(ROWS.map((row) => row.fill)).toEqual([
      "var(--color-sea-green)",
      "var(--color-marigold)",
      "var(--color-coral)",
      "var(--color-cerulean)",
      "var(--color-ink)",
      "var(--color-bar-soft)",
    ]);
  });
});

describe("totals", () => {
  it("add each side and say when they are equal", () => {
    expect(totals(figures(reply()))).toEqual({ left: 9530000n, right: 9530000n, difference: 0n, balanced: true });
  });

  it("give the difference when the left is higher", () => {
    expect(totals(figures(reply({ cash: "6842000" })))).toMatchObject({ difference: 12000n, balanced: false });
  });

  it("give a negative difference when the right is higher", () => {
    expect(totals(figures(reply({ cash: "6818000" })))).toMatchObject({ difference: -12000n, balanced: false });
  });

  it("see a difference of one cent", () => {
    expect(totals(figures(reply({ receivable: "2700001" })))).toMatchObject({ difference: 1n, balanced: false });
  });

  it("add exactly past 2^53 cents", () => {
    const big = (2n ** 53n + 1n).toString();
    const found = totals(
      figures([
        { key: "cash", balance_cents: big },
        { key: "payable", balance_cents: big },
      ]),
    );
    expect(found).toEqual({ left: 2n ** 53n + 1n, right: 2n ** 53n + 1n, difference: 0n, balanced: true });
  });
});

describe("effect", () => {
  it("adds a debit to an asset and takes a credit away", () => {
    expect(effect({ lines: [line("cash", 500)] }, "cash")).toBe(500n);
    expect(effect({ lines: [line("cash", 0, 200)] }, "cash")).toBe(-200n);
    expect(effect({ lines: [line("receivable", 300), line("revenue", 0, 300)] }, "receivable")).toBe(300n);
  });

  it("does the other way for a liability and for equity", () => {
    expect(effect({ lines: [line("payable", 0, 500)] }, "payable")).toBe(500n);
    expect(effect({ lines: [line("tax_payable", 100)] }, "taxPayable")).toBe(-100n);
    expect(effect({ lines: [line("owners_equity", 0, 900)] }, "ownersEquity")).toBe(900n);
  });

  it("adds a credit to Revenue to Profit to date and takes a debit to an expense away", () => {
    expect(effect({ lines: [line("revenue", 0, 1000)] }, "profit")).toBe(1000n);
    expect(effect({ lines: [line("expense_travel", 400)] }, "profit")).toBe(-400n);
  });

  it("adds both lines of an entry that has two of the accounts", () => {
    const entry = { lines: [line("revenue", 0, 1000), line("expense_other", 300), line("receivable", 700)] };
    expect(effect(entry, "profit")).toBe(700n);
  });

  it("ignores lines in other accounts", () => {
    expect(effect({ lines: [line("payable", 0, 500), line("expense_other", 500)] }, "cash")).toBe(0n);
  });

  it("gives a reversal the opposite of its entry", () => {
    const entry = { lines: [line("expense_software", 500), line("payable", 0, 500)] };
    const reversal = { lines: [line("expense_software", 0, 500), line("payable", 500)] };
    for (const id of ["profit", "payable"] as const) {
      expect(effect(entry, id) + effect(reversal, id)).toBe(0n);
    }
  });

  it("is exact past 2^53 cents", () => {
    expect(effect({ lines: [line("cash", Number.MAX_SAFE_INTEGER), line("cash", 2)] }, "cash")).toBe(
      BigInt(Number.MAX_SAFE_INTEGER) + 2n,
    );
  });
});

describe("EVENT_WORDS", () => {
  it("has a phrase for each of the twelve events", () => {
    expect(EVENT_WORDS).toEqual({
      invoice_issued: "Invoice issued",
      payment_recorded: "Payment recorded",
      bill_added: "Bill added",
      bill_paid: "Bill paid",
      opening_balance_set: "Opening balance set",
      invoice_voided: "Invoice voided",
      payment_deleted: "Payment deleted",
      bill_changed: "Bill changed",
      bill_unpaid: "Bill marked unpaid",
      bill_deleted: "Bill deleted",
      opening_balance_changed: "Opening balance changed",
      opening_balance_cleared: "Opening balance cleared",
    });
  });
});
