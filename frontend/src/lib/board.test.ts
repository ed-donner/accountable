import { describe, expect, it } from "vitest";
import type { Deal, Pipeline } from "@/api/types";
import { STAGES, type Stage } from "./rules";
import { beforeIdAfterDrop, boardTotals, columnTotals, moveCard } from "./board";

const TODAY = "2026-11-19";

let nextId = 1;
function deal(stage: Stage, fields: Partial<Deal> = {}): Deal {
  const id = fields.id ?? nextId++;
  const value = fields.value ?? 10_000;
  const probability = fields.probability ?? { new: 10, qualified: 25, proposal: 50, negotiation: 75, won: 100, lost: 0 }[stage];
  return {
    id,
    name: `Deal ${id}`,
    organization: { id: 1, name: "Bluefin Logistics" },
    main_contact: null,
    stage,
    value,
    probability,
    expected_value: Math.floor((value * probability + 50) / 100),
    close_date: "2026-12-12",
    is_late: false,
    position: 0,
    created_at: "2026-10-01T10:00:00Z",
    updated_at: "2026-10-01T10:00:00Z",
    ...fields,
  };
}

function board(cards: Partial<Record<Stage, Deal[]>>): Pipeline {
  return { columns: STAGES.map((stage) => ({ stage, deals: cards[stage] ?? [] })) };
}

function ids(b: Pipeline, stage: Stage) {
  return b.columns.find((c) => c.stage === stage)!.deals.map((d) => d.id);
}

function find(b: Pipeline, id: number) {
  return b.columns.flatMap((c) => c.deals).find((d) => d.id === id)!;
}

describe("moveCard", () => {
  it("moves a card up and down within a column, keeping its figures", () => {
    const start = board({ proposal: [deal("proposal", { id: 1 }), deal("proposal", { id: 2 }), deal("proposal", { id: 3 })] });
    const up = moveCard(start, 3, "proposal", 1, TODAY);
    expect(ids(up, "proposal")).toEqual([3, 1, 2]);
    const down = moveCard(start, 1, "proposal", 3, TODAY);
    expect(ids(down, "proposal")).toEqual([2, 1, 3]);
    expect(find(down, 1)).toEqual(find(start, 1));
  });

  it("null moves the card to the bottom of the column", () => {
    const start = board({ new: [deal("new", { id: 1 }), deal("new", { id: 2 })], qualified: [deal("qualified", { id: 3 })] });
    expect(ids(moveCard(start, 1, "new", null, TODAY), "new")).toEqual([2, 1]);
    expect(ids(moveCard(start, 1, "qualified", null, TODAY), "qualified")).toEqual([3, 1]);
  });

  it("leaves the board it was given alone", () => {
    const start = board({ new: [deal("new", { id: 1 })], qualified: [deal("qualified", { id: 2 })] });
    const copy = structuredClone(start);
    moveCard(start, 1, "qualified", 2, TODAY);
    expect(start).toEqual(copy);
  });

  it("across columns: the new stage, its usual probability and expected revenue (STG-2)", () => {
    const start = board({
      proposal: [deal("proposal", { id: 1, value: 48_500, probability: 40 })],
      negotiation: [deal("negotiation", { id: 2 }), deal("negotiation", { id: 3 })],
    });
    const moved = moveCard(start, 1, "negotiation", 3, TODAY);
    expect(ids(moved, "proposal")).toEqual([]);
    expect(ids(moved, "negotiation")).toEqual([2, 1, 3]);
    expect(find(moved, 1)).toMatchObject({ stage: "negotiation", probability: 75, expected_value: 36_375, close_date: "2026-12-12" });
  });

  it("to Won: 100% and today; to Lost: 0% and today (STG-2.2, STG-4)", () => {
    const start = board({ negotiation: [deal("negotiation", { id: 1, value: 20_000, close_date: "2026-12-30" }), deal("negotiation", { id: 2 })] });
    expect(find(moveCard(start, 1, "won", null, TODAY), 1)).toMatchObject({
      stage: "won",
      probability: 100,
      expected_value: 20_000,
      close_date: TODAY,
      is_late: false,
    });
    expect(find(moveCard(start, 2, "lost", null, TODAY), 2)).toMatchObject({
      stage: "lost",
      probability: 0,
      expected_value: 0,
      close_date: TODAY,
    });
  });

  it("reopening keeps the close date, and a past date makes the deal late (STG-5)", () => {
    const start = board({ won: [deal("won", { id: 1, close_date: "2026-11-02" })] });
    const reopened = moveCard(start, 1, "proposal", null, TODAY);
    expect(find(reopened, 1)).toMatchObject({ stage: "proposal", probability: 50, close_date: "2026-11-02", is_late: true });
  });

  it("works out is_late again: a late deal moved to Lost is no longer late", () => {
    const start = board({ new: [deal("new", { id: 1, close_date: "2026-11-01", is_late: true })] });
    expect(find(moveCard(start, 1, "qualified", null, TODAY), 1).is_late).toBe(true);
    expect(find(moveCard(start, 1, "lost", null, TODAY), 1).is_late).toBe(false);
  });

  it("a probability set by hand changes only when the stage does (STG-3)", () => {
    const start = board({ qualified: [deal("qualified", { id: 1, probability: 40 }), deal("qualified", { id: 2 })] });
    expect(find(moveCard(start, 1, "qualified", null, TODAY), 1).probability).toBe(40);
    expect(find(moveCard(start, 1, "proposal", null, TODAY), 1).probability).toBe(50);
  });

  it("returns the board unchanged for an unknown card", () => {
    const start = board({ new: [deal("new", { id: 1 })] });
    expect(moveCard(start, 99, "won", null, TODAY)).toBe(start);
  });
});

describe("columnTotals and boardTotals", () => {
  const start = board({
    new: [deal("new", { id: 1, value: 10_000 }), deal("new", { id: 2, value: 5_000, close_date: "2026-11-01", is_late: true })],
    proposal: [deal("proposal", { id: 3, value: 48_500 })],
    negotiation: [deal("negotiation", { id: 4, value: 101 })],
    won: [deal("won", { id: 5, value: 30_000 })],
    lost: [deal("lost", { id: 6, value: 7_000 })],
  });

  it("a column: its count, total value and expected revenue (PIPE-1)", () => {
    const column = (stage: Stage) => start.columns.find((c) => c.stage === stage)!;
    expect(columnTotals(column("new"))).toEqual({ count: 2, value: 15_000, expected: 1_500 });
    expect(columnTotals(column("negotiation"))).toEqual({ count: 1, value: 101, expected: 76 });
    expect(columnTotals(column("qualified"))).toEqual({ count: 0, value: 0, expected: 0 });
    expect(columnTotals(column("won"))).toEqual({ count: 1, value: 30_000, expected: 30_000 });
  });

  it("the board: the open deals only, with how many are late (PIPE-3)", () => {
    expect(boardTotals(start)).toEqual({ count: 4, value: 63_601, expected: 1_500 + 24_250 + 76, late: 1 });
  });

  it("both change after a move (PIPE-6)", () => {
    const moved = moveCard(start, 3, "won", null, TODAY);
    const won = moved.columns.find((c) => c.stage === "won")!;
    expect(columnTotals(won)).toEqual({ count: 2, value: 78_500, expected: 78_500 });
    expect(boardTotals(moved)).toEqual({ count: 3, value: 15_101, expected: 1_576, late: 1 });

    const lateToLost = moveCard(start, 2, "lost", 6, TODAY);
    expect(boardTotals(lateToLost)).toMatchObject({ count: 3, late: 0 });
  });
});

describe("beforeIdAfterDrop", () => {
  const column = { stage: "proposal" as const, deals: [deal("proposal", { id: 7 }), deal("proposal", { id: 8 }), deal("proposal", { id: 9 })] };

  it("is the card just below the dropped one", () => {
    expect(beforeIdAfterDrop(column, 7)).toBe(8);
    expect(beforeIdAfterDrop(column, 8)).toBe(9);
  });

  it("is null at the bottom of the column, or for a card not in it", () => {
    expect(beforeIdAfterDrop(column, 9)).toBeNull();
    expect(beforeIdAfterDrop(column, 99)).toBeNull();
  });
});
