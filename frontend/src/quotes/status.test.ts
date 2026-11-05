import { describe, expect, it } from "vitest";

import type { Accepted, QuoteStatus } from "./queries";
import { acceptChanges, acceptedMessage, dealValue, figures, shownStatus } from "./status";

describe("a quote's shown status", () => {
  it("is Sent on its valid-until date and Expired from the day after (Q7)", () => {
    const sent = { status: "sent" as const, valid_until: "2026-12-05" };
    expect(shownStatus(sent, "2026-12-04")).toBe("sent");
    expect(shownStatus(sent, "2026-12-05")).toBe("sent");
    expect(shownStatus(sent, "2026-12-06")).toBe("expired");
    expect(shownStatus(sent, "2027-01-01")).toBe("expired");
  });

  it.each<QuoteStatus>(["draft", "accepted", "declined"])("never expires when %s", (status) => {
    expect(shownStatus({ status, valid_until: "2026-01-01" }, "2026-12-06")).toBe(status);
  });
});

describe("the figures above the Quotes table", () => {
  const today = "2026-11-05";
  const rows = [
    { status: "draft" as const, valid_until: "2026-12-01", subtotal_cents: 100_00 },
    { status: "draft" as const, valid_until: "2026-10-01", subtotal_cents: 250_50 },
    { status: "sent" as const, valid_until: "2026-11-05", subtotal_cents: 1_000_00 },
    { status: "sent" as const, valid_until: "2026-11-04", subtotal_cents: 40_00 },
    { status: "accepted" as const, valid_until: "2026-10-01", subtotal_cents: 4_800_050 },
  ];

  it("count and add up the value of every quote and each status, expired apart from sent (Q34)", () => {
    expect(figures(rows, today)).toEqual({
      all: { count: 5, value_cents: 4_939_100 },
      draft: { count: 2, value_cents: 350_50 },
      sent: { count: 1, value_cents: 1_000_00 },
      expired: { count: 1, value_cents: 40_00 },
      accepted: { count: 1, value_cents: 4_800_050 },
      declined: { count: 0, value_cents: 0 },
    });
  });

  it("are all nought with no quotes", () => {
    expect(figures([], today).all).toEqual({ count: 0, value_cents: 0 });
  });
});

describe("accepting", () => {
  it.each([
    [4_800_049, 48_000],
    [4_800_050, 48_001],
    [4_800_099, 48_001],
    [0, 0],
  ])("makes a subtotal of %i cents a deal worth $%i, halves rounding up", (cents, dollars) => {
    expect(dealValue(cents)).toBe(dollars);
  });

  it("asks first, naming the deal, its value and any quote it will decline (Q22)", () => {
    expect(acceptChanges("Harbor & Pine renewal", 4_800_050, ["QT-0003"])).toBe(
      "Harbor & Pine renewal will move to Won with a value of $48,001, and QT-0003 will be marked declined. This can't be undone.",
    );
    expect(acceptChanges("Renewal", 1_200_000, [])).toBe(
      "Renewal will move to Won with a value of $12,000. This can't be undone.",
    );
    expect(acceptChanges("Renewal", 100, ["QT-0001", "QT-0002"])).toContain(
      "QT-0001 and QT-0002 will be marked declined",
    );
  });

  const accepted = (changes: Partial<Accepted["changes"]>) =>
    ({
      deal: { id: 12, name: "Harbor & Pine renewal", value: 48001 },
      changes: { close_date: "2026-11-05", new_customer: "Sam Carter", declined: [], ...changes },
    }) as unknown as Accepted;

  it("says what changed after, each part only when it applies", () => {
    expect(acceptedMessage(accepted({}))).toBe(
      "Quote accepted. Harbor & Pine renewal is now Won at $48,001. Close date set to today. Sam Carter is now a customer.",
    );
    expect(acceptedMessage(accepted({ new_customer: null }))).toBe(
      "Quote accepted. Harbor & Pine renewal is now Won at $48,001. Close date set to today.",
    );
    expect(acceptedMessage(accepted({ close_date: null, new_customer: null }))).toBe(
      "Quote accepted. Harbor & Pine renewal is now Won at $48,001.",
    );
  });
});
