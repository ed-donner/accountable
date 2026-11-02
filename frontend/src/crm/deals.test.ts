import { describe, expect, it } from "vitest";

import cases from "../../../shared/expected-revenue-cases.json";
import { applyMove, boardTotals, columns, expectedRevenue, figures, isLate, moveMessage, slideSteps } from "./deals";
import type { Deal, Meta, MoveResult, Stage } from "./queries";

const TODAY = "2026-10-31";

const USUAL: Meta["stages"] = [
  { key: "new", name: "New", probability: 5, open: true },
  { key: "qualified", name: "Qualified", probability: 20, open: true },
  { key: "proposal", name: "Proposal", probability: 40, open: true },
  { key: "negotiation", name: "Negotiation", probability: 70, open: true },
  { key: "won", name: "Won", probability: 100, open: false },
  { key: "lost", name: "Lost", probability: 0, open: false },
];

function deal(id: number, stage: Stage, position: number, extra: Partial<Deal> = {}): Deal {
  return {
    id,
    name: `Deal ${id}`,
    organization_id: 1,
    organization_name: "Harbor & Pine",
    main_contact_id: 1,
    main_contact_name: "Sam Carter",
    stage,
    value: 1000,
    probability: 5,
    expected_revenue: 50,
    close_date: "2026-12-01",
    position,
    ...extra,
  };
}

function order(deals: Deal[], stage: Stage) {
  return columns(deals)[stage].map((item) => item.id);
}

describe("expectedRevenue", () => {
  it.each(cases)("$why", ({ value, probability, expected }) => {
    expect(expectedRevenue(value, probability)).toBe(expected);
  });
});

describe("isLate", () => {
  it("doesn't count a deal due today", () => {
    expect(isLate({ stage: "proposal", close_date: TODAY }, TODAY)).toBe(false);
  });

  it("counts a deal due yesterday", () => {
    expect(isLate({ stage: "proposal", close_date: "2026-10-30" }, TODAY)).toBe(true);
  });

  it("never counts a closed deal", () => {
    expect(isLate({ stage: "won", close_date: "2026-01-01" }, TODAY)).toBe(false);
    expect(isLate({ stage: "lost", close_date: "2026-01-01" }, TODAY)).toBe(false);
  });
});

describe("board totals", () => {
  it("count open deals only", () => {
    const totals = boardTotals([
      deal(1, "new", 0, { value: 1000, probability: 5 }),
      deal(2, "negotiation", 0, { value: 1010, probability: 5 }),
      deal(3, "won", 0, { value: 99999, probability: 100 }),
      deal(4, "lost", 0, { value: 99999, probability: 0 }),
    ]);
    expect(totals).toEqual({ count: 2, value: 2010, expected: 50 + 51 });
  });

  it("round each deal before adding up", () => {
    const halves = [deal(1, "new", 0, { value: 1010 }), deal(2, "new", 1, { value: 1010 })];
    expect(figures(halves).expected).toBe(102);
  });

  it("handle an empty board", () => {
    expect(boardTotals([])).toEqual({ count: 0, value: 0, expected: 0 });
  });
});

describe("columns", () => {
  it("orders each column by place", () => {
    const deals = [deal(1, "new", 2), deal(2, "new", 0), deal(3, "new", 1), deal(4, "won", 0)];
    expect(order(deals, "new")).toEqual([2, 3, 1]);
    expect(order(deals, "won")).toEqual([4]);
    expect(order(deals, "lost")).toEqual([]);
  });
});

describe("slideSteps", () => {
  const steps = (count: number, dragged: number, place: number | null) =>
    Array.from({ length: count }, (_, index) => (index === dragged ? "dragged" : slideSteps(index, dragged, place)));

  it("leaves a column alone when nothing is happening in it", () => {
    expect(steps(3, -1, null)).toEqual([0, 0, 0]);
  });

  it("opens a gap in another column", () => {
    expect(steps(3, -1, 0)).toEqual([1, 1, 1]);
    expect(steps(3, -1, 1)).toEqual([0, 1, 1]);
  });

  it("moves nothing for a card landing at the end of another column", () => {
    expect(steps(3, -1, 3)).toEqual([0, 0, 0]);
  });

  it("closes the gap behind a card that has left its column", () => {
    expect(steps(4, 1, null)).toEqual([0, "dragged", -1, -1]);
  });

  it("moves nothing while a card is over its own place", () => {
    expect(steps(4, 1, 1)).toEqual([0, "dragged", 0, 0]);
  });

  it("moves the cards it passes going up its own column", () => {
    expect(steps(4, 2, 0)).toEqual([1, 1, "dragged", 0]);
  });

  it("moves the cards it passes going down its own column", () => {
    expect(steps(4, 0, 2)).toEqual(["dragged", -1, -1, 0]);
    expect(steps(4, 0, 3)).toEqual(["dragged", -1, -1, -1]);
  });
});

describe("applyMove", () => {
  const base = [deal(1, "new", 0), deal(2, "new", 1), deal(3, "qualified", 0), deal(4, "qualified", 1)];

  it.each([
    ["qualified", 20],
    ["proposal", 40],
    ["negotiation", 70],
  ] as const)("to %s takes the usual probability and leaves the close date", (stage, probability) => {
    const moved = applyMove(base, { dealId: 1, stage, beforeDealId: null }, USUAL, TODAY).find(
      (item) => item.id === 1,
    )!;
    expect(moved.stage).toBe(stage);
    expect(moved.probability).toBe(probability);
    expect(moved.close_date).toBe("2026-12-01");
    expect(moved.expected_revenue).toBe(expectedRevenue(1000, probability));
  });

  it("to Won is 100% and today", () => {
    const moved = applyMove(base, { dealId: 1, stage: "won", beforeDealId: null }, USUAL, TODAY).find(
      (item) => item.id === 1,
    )!;
    expect(moved.probability).toBe(100);
    expect(moved.close_date).toBe(TODAY);
  });

  it("to Lost is 0% and today", () => {
    const moved = applyMove(base, { dealId: 1, stage: "lost", beforeDealId: null }, USUAL, TODAY).find(
      (item) => item.id === 1,
    )!;
    expect(moved.probability).toBe(0);
    expect(moved.close_date).toBe(TODAY);
  });

  it("from Won to an open stage takes the usual probability and keeps the close date", () => {
    const start = [deal(1, "won", 0, { probability: 100, close_date: "2026-09-01" })];
    const moved = applyMove(start, { dealId: 1, stage: "proposal", beforeDealId: null }, USUAL, TODAY)[0];
    expect(moved.probability).toBe(40);
    expect(moved.close_date).toBe("2026-09-01");
  });

  it("goes before a chosen card", () => {
    const after = applyMove(base, { dealId: 1, stage: "qualified", beforeDealId: 4 }, USUAL, TODAY);
    expect(order(after, "qualified")).toEqual([3, 1, 4]);
    expect(order(after, "new")).toEqual([2]);
  });

  it("goes to the end when no card is chosen", () => {
    const after = applyMove(base, { dealId: 1, stage: "qualified", beforeDealId: null }, USUAL, TODAY);
    expect(order(after, "qualified")).toEqual([3, 4, 1]);
  });

  it("lands in an empty column", () => {
    const after = applyMove(base, { dealId: 1, stage: "lost", beforeDealId: null }, USUAL, TODAY);
    expect(order(after, "lost")).toEqual([1]);
  });

  it("within a column changes only the place", () => {
    const start = [deal(1, "new", 0, { probability: 33 }), deal(2, "new", 1), deal(3, "new", 2)];
    const after = applyMove(start, { dealId: 3, stage: "new", beforeDealId: 1 }, USUAL, TODAY);
    expect(order(after, "new")).toEqual([3, 1, 2]);
    expect(after.find((item) => item.id === 1)!.probability).toBe(33);
    expect(after.find((item) => item.id === 3)!.probability).toBe(5);
    expect(after.find((item) => item.id === 3)!.close_date).toBe("2026-12-01");
  });

  it("leaves the list as it was for a deal it can't find", () => {
    expect(applyMove(base, { dealId: 99, stage: "won", beforeDealId: null }, USUAL, TODAY)).toBe(base);
  });
});

describe("moveMessage", () => {
  function result(stage: Stage, close_date: string | null, new_customer: string | null): MoveResult {
    return { deal: { stage } as Deal, changes: { close_date, new_customer } };
  }

  it("says what a win changed", () => {
    expect(moveMessage(result("won", TODAY, "Sam Carter"))).toBe(
      "Marked as Won. Close date set to today. Sam Carter is now a customer.",
    );
  });

  it("names no contact when none became a customer", () => {
    expect(moveMessage(result("won", TODAY, null))).toBe("Marked as Won. Close date set to today.");
  });

  it("says what a loss changed", () => {
    expect(moveMessage(result("lost", TODAY, null))).toBe("Marked as Lost. Close date set to today.");
  });

  it("has nothing to say about any other move", () => {
    expect(moveMessage(result("proposal", null, null))).toBeNull();
  });
});
