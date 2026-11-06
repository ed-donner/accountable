import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { mockApi, renderApp, user, type Call } from "../test-utils";
import { CashFlowRow } from "./CashFlowRow";
import { COLUMN, TODAY, cashFlowReply, expectedReply, item, sizeTheChart } from "./test-cash-flow";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: TODAY });
  sizeTheChart();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const DECEMBER = "/cash-flow/expected?month=2026-12";
const NOVEMBER = "/cash-flow/expected?month=2026-11";
const FAILED = { status: 500, body: { detail: "Something went wrong." } };

const LISTED = expectedReply("2026-12", {
  in: [
    item(7, "INV-0007", {
      organization: "Harbor & Pine",
      due_on: "2026-11-01",
      expected_on: "2026-11-07",
      cents: "125050",
      days_paid_late: 6,
    }),
    item(8, "INV-0008", {
      organization: "Bright Lane",
      due_on: "2026-12-01",
      expected_on: "2026-12-01",
      cents: "50000",
      days_paid_late: 0,
    }),
    item(9, "INV-0009", {
      organization: "Copper Field",
      due_on: "2026-12-10",
      expected_on: "2026-12-11",
      cents: "100",
      days_paid_late: 1,
    }),
  ],
  out: [
    item(3, "KP-2616", {
      organization: "Kingsgate Properties",
      due_on: "2026-11-04",
      expected_on: "2026-12-06",
      cents: "450000",
    }),
  ],
  likely: [
    item(12, "Annual support", {
      organization: null,
      due_on: "2026-10-30",
      expected_on: "2026-12-14",
      cents: "360000",
    }),
    item(14, "Kiosk rollout", {
      organization: "Bright Lane",
      due_on: "2026-11-18",
      expected_on: "2026-12-18",
      cents: "1200000",
    }),
  ],
});

async function open(routes: Record<string, unknown> = { [`GET ${DECEMBER}`]: LISTED }) {
  const calls = mockApi({ "GET /cash-flow": cashFlowReply(), ...routes });
  renderApp(<CashFlowRow />);
  await screen.findByRole("img", { name: /^Money in and out each month/ });
  return calls;
}

function label(name: string) {
  return screen.getByRole("button", { name });
}

function dialog() {
  return within(screen.getByRole("dialog"));
}

function group(name: string) {
  return within(dialog().getByRole("region", { name }));
}

/** Each item's row, as one line of text. */
function rows(name: string) {
  return group(name)
    .getAllByRole("listitem")
    .map((row) => row.textContent);
}

/** Points at a column, waits for its tooltip, as the click needs the chart to know the column, then clicks it. */
async function clickColumn(column: number) {
  const chart = screen.getByRole("img", { name: /^Money in and out/ });
  const plot = within(chart).getByRole("application");
  const at = { clientX: column * COLUMN + 10, clientY: 40 };
  fireEvent.mouseMove(plot, at);
  await waitFor(() => expect(chart.querySelector(".recharts-tooltip-wrapper")?.textContent).toBeTruthy());
  fireEvent.click(plot, at);
}

function listReads(calls: Call[]) {
  return calls.filter((call) => call.path.startsWith("/cash-flow/expected"));
}

describe("opening a month's list", () => {
  it("opens from a forecast month's label, which the keyboard reaches", async () => {
    await open();
    label("Expected in December 2026").focus();
    await user().keyboard("{Enter}");
    expect(await screen.findByRole("dialog", { name: "Expected in December 2026" })).toBeTruthy();
  });

  it("opens by clicking anywhere in the month's column", async () => {
    await open();
    await clickColumn(12);
    expect(await screen.findByRole("dialog", { name: "Expected in December 2026" })).toBeTruthy();
  });

  it("calls this month's what's still expected", async () => {
    await open({ [`GET ${NOVEMBER}`]: expectedReply("2026-11") });
    await user().click(label("Still expected in November 2026"));
    expect(await screen.findByRole("dialog", { name: "Still expected in November 2026" })).toBeTruthy();
  });

  it("opens nothing for a past month, whose money has already moved", async () => {
    const calls = await open();
    await clickColumn(9);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("button", { name: /September/ })).toBeNull();
    expect(listReads(calls)).toEqual([]);
  });
});

describe("what's listed", () => {
  it("gives the invoices coming in and the bills going out, each group with its total", async () => {
    await open();
    await user().click(label("Expected in December 2026"));
    await dialog().findByRole("region", { name: "Coming in" });
    expect(group("Coming in").getByRole("heading").parentElement?.textContent).toBe("Coming in$1,751.50");
    expect(group("Going out").getByRole("heading").parentElement?.textContent).toBe("Going out$4,500.00");
    expect(dialog().queryByRole("region", { name: "Likely deals" })).toBeNull();
  });

  it("shows each invoice's link, customer, amount, expected date, due date, chip and how late its customer pays", async () => {
    await open();
    await user().click(label("Expected in December 2026"));
    await dialog().findByRole("region", { name: "Coming in" });
    expect(rows("Coming in")).toEqual([
      "INV-0007 Harbor & PineDue Nov 1, 2026OverduePays 6 days late on average$1,250.50Expected Nov 7, 2026",
      "INV-0008 Bright LaneDue Dec 1, 2026$500.00Expected Dec 1, 2026",
      "INV-0009 Copper FieldDue Dec 10, 2026Pays 1 day late on average$1.00Expected Dec 11, 2026",
    ]);
    expect(group("Coming in").getByRole("link", { name: "INV-0007" }).getAttribute("href")).toBe("/invoices/7");
  });

  it("shows each bill's link, supplier, total, due date and Overdue chip", async () => {
    await open();
    await user().click(label("Expected in December 2026"));
    await dialog().findByRole("region", { name: "Going out" });
    expect(rows("Going out")).toEqual([
      "KP-2616 Kingsgate PropertiesDue Nov 4, 2026Overdue$4,500.00Expected Dec 6, 2026",
    ]);
    expect(group("Going out").getByRole("link", { name: "KP-2616" }).getAttribute("href")).toBe("/bills/3");
  });

  it("adds the likely deals while the switch is on, each with its close date and Late chip", async () => {
    await open();
    await user().click(screen.getByRole("switch", { name: "Likely deals" }));
    await user().click(label("Expected in December 2026"));
    await dialog().findByRole("region", { name: "Likely deals" });
    expect(group("Likely deals").getByRole("heading").parentElement?.textContent).toBe("Likely deals$15,600.00");
    expect(rows("Likely deals")).toEqual([
      "Annual supportCloses Oct 30, 2026Late$3,600.00Expected Dec 14, 2026",
      "Kiosk rollout Bright LaneCloses Nov 18, 2026$12,000.00Expected Dec 18, 2026",
    ]);
    expect(group("Likely deals").getByRole("link", { name: "Annual support" }).getAttribute("href")).toBe("/deals/12");
  });

  it("says so when nothing is expected in the month", async () => {
    await open({ [`GET ${DECEMBER}`]: expectedReply("2026-12", { likely: LISTED.likely_deals.items }) });
    await user().click(label("Expected in December 2026"));
    expect(await dialog().findByText("Nothing expected in December 2026.")).toBeTruthy();
  });

  it("says when the list can't be read, and tries again", async () => {
    let failing = true;
    await open({ [`GET ${DECEMBER}`]: () => (failing ? FAILED : { body: LISTED }) });
    await user().click(label("Expected in December 2026"));
    expect(await dialog().findByText("Couldn't load this.")).toBeTruthy();
    failing = false;
    await user().click(dialog().getByRole("button", { name: "Try again" }));
    expect(await dialog().findByRole("region", { name: "Coming in" })).toBeTruthy();
  });

  it.each([
    ["its groups", LISTED, () => dialog().findByRole("region", { name: "Coming in" })],
    ["Nothing expected", expectedReply("2026-12"), () => dialog().findByText("Nothing expected in December 2026.")],
  ])(
    "keeps %s when reading the list again fails, says it may be out of date, and tries again",
    async (_kept, reply, kept) => {
      let failing = false;
      const calls = await open({ [`GET ${DECEMBER}`]: () => (failing ? FAILED : { body: reply }) });
      await user().click(label("Expected in December 2026"));
      await kept();
      await user().keyboard("{Escape}");
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

      // Opened again, it shows the list it read before while it reads it again.
      failing = true;
      await user().click(label("Expected in December 2026"));
      expect(await dialog().findByText("Couldn't refresh this, so it may be out of date.")).toBeTruthy();
      expect(await kept()).toBeTruthy();
      expect(listReads(calls)).toHaveLength(2);

      failing = false;
      await user().click(dialog().getByRole("button", { name: "Try again" }));
      await waitFor(() => expect(dialog().queryByText("Couldn't refresh this, so it may be out of date.")).toBeNull());
      expect(await kept()).toBeTruthy();
      expect(listReads(calls)).toHaveLength(3);
    },
  );
});

describe("closing a month's list", () => {
  it.each([
    ["Escape", () => user().keyboard("{Escape}")],
    ["Close", () => user().click(dialog().getByRole("button", { name: "Close" }))],
  ])("closes with %s and puts focus back on the month's label", async (_way, close) => {
    await open();
    await user().click(label("Expected in December 2026"));
    await dialog().findByRole("region", { name: "Coming in" });
    await close();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(label("Expected in December 2026"));
  });
});
