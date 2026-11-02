import { render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { COLUMN_WIDTH, layOutBoard, middleOf, user } from "../../test-utils";
import type { Deal, Stage } from "../queries";
import { Board } from "./Board";

const TODAY = "2026-11-02";

let lastId = 0;

function deal(name: string, stage: Stage, extra: Partial<Deal> = {}): Deal {
  lastId += 1;
  return {
    id: lastId,
    name,
    organization_id: 1,
    organization_name: "Harbor & Pine",
    main_contact_id: 11,
    main_contact_name: "Sam Carter",
    stage,
    value: 1000,
    probability: 40,
    expected_revenue: 400,
    close_date: "2026-12-18",
    position: lastId,
    ...extra,
  };
}

function showBoard(deals: Deal[]) {
  const onMove = vi.fn();
  const onAdd = vi.fn();
  const board = (shown: Deal[]) => (
    <MemoryRouter>
      <Routes>
        <Route path="/" element={<Board deals={shown} today={TODAY} onMove={onMove} onAdd={onAdd} />} />
        <Route path="/deals/:id" element={<h1>Deal page</h1>} />
      </Routes>
    </MemoryRouter>
  );
  const view = render(board(deals));
  return { onMove, onAdd, showDeals: (shown: Deal[]) => view.rerender(board(shown)) };
}

function column(stage: Stage) {
  return screen.getByTestId(`column-${stage}`);
}

function card(name: string): HTMLElement {
  const found = screen.getAllByRole("link").find((link) => link.dataset.deal === name);
  if (!found) throw new Error(`No card for ${name}`);
  return found;
}

function namesIn(stage: Stage) {
  return within(column(stage))
    .queryAllByRole("link")
    .map((link) => link.dataset.deal);
}

/** Focuses the card, then presses each key in turn, as a person would. */
async function press(name: string, ...keys: string[]) {
  card(name).focus();
  const person = user();
  for (const key of keys) await person.keyboard(`[${key}]`);
}

beforeEach(layOutBoard);

describe("the board", () => {
  it("has a column for each stage, in order", () => {
    showBoard([]);
    expect(screen.getAllByRole("region").map((region) => region.getAttribute("aria-label"))).toEqual([
      "New",
      "Qualified",
      "Proposal",
      "Negotiation",
      "Won",
      "Lost",
    ]);
  });

  it("heads each column with its count and value, and open columns with expected revenue too", () => {
    showBoard([
      deal("Small", "proposal", { value: 1000, probability: 40 }),
      deal("Large", "proposal", { value: 2500, probability: 40 }),
      deal("Banked", "won", { value: 2000, probability: 100 }),
    ]);
    const proposal = within(column("proposal"));
    expect(proposal.getByTestId("column-count").textContent).toBe("2");
    expect(proposal.getByTestId("column-value").textContent).toBe("$3,500");
    expect(proposal.getByTestId("column-expected").textContent).toBe("Expected $1,400");

    const won = within(column("won"));
    expect(won.getByTestId("column-count").textContent).toBe("1");
    expect(won.getByTestId("column-value").textContent).toBe("$2,000");
    expect(won.queryByTestId("column-expected")).toBeNull();
    expect(within(column("new")).getByTestId("column-value").textContent).toBe("$0");
  });

  it("orders each column's cards by their place", () => {
    showBoard([
      deal("Third", "new", { position: 2 }),
      deal("First", "new", { position: 0 }),
      deal("Second", "new", { position: 1 }),
    ]);
    expect(namesIn("new")).toEqual(["First", "Second", "Third"]);
  });

  it("shows a deal's value, name, organization, main contact, probability and close date on its card", () => {
    showBoard([
      deal("Annual support", "proposal", { value: 36000, probability: 40, close_date: "2026-12-18" }),
      deal("Loose end", "new", { organization_name: null, main_contact_name: null }),
    ]);
    const shown = within(card("Annual support"));
    for (const text of ["$36,000", "Annual support", "Harbor & Pine", "Sam Carter", "40%", "Dec 18, 2026"]) {
      expect(shown.getByText(text)).toBeTruthy();
    }
    expect(within(card("Loose end")).getAllByText("None")).toHaveLength(2);
  });

  it("marks an open deal past its close date as late, but not a won one", () => {
    showBoard([
      deal("Overdue", "negotiation", { close_date: "2026-10-01" }),
      deal("Done", "won", { close_date: "2026-10-01" }),
    ]);
    expect(within(card("Overdue")).getByText("Late")).toBeTruthy();
    expect(within(card("Done")).queryByText("Late")).toBeNull();
  });

  it("opens the deal when its card is clicked", async () => {
    showBoard([deal("Clicked", "new")]);
    await user().click(card("Clicked"));
    expect(screen.getByRole("heading", { name: "Deal page" })).toBeTruthy();
  });

  it("opens the deal on Enter, rather than picking it up", async () => {
    const { onMove } = showBoard([deal("Entered", "new")]);
    await press("Entered", "Enter");
    expect(screen.getByRole("heading", { name: "Deal page" })).toBeTruthy();
    expect(onMove).not.toHaveBeenCalled();
  });

  it("asks for a new deal at a column's stage from its Add deal button", async () => {
    const { onAdd } = showBoard([]);
    await user().click(screen.getByRole("button", { name: "Add deal to Won" }));
    expect(onAdd).toHaveBeenCalledWith("won");
  });
});

describe("moving a card with the keyboard", () => {
  function threeInProposal() {
    return [deal("A", "proposal"), deal("B", "proposal"), deal("C", "proposal")];
  }

  it("picks it up on Space, moves it down a place on ArrowDown, and drops it on Space", async () => {
    const [a, b, c] = threeInProposal();
    const { onMove } = showBoard([a, b, c]);
    await press("A", "Space", "ArrowDown", "Space");
    expect(onMove).toHaveBeenCalledExactlyOnceWith({ dealId: a.id, stage: "proposal", beforeDealId: c.id });
  });

  it("moves it up a place on ArrowUp", async () => {
    const [a, b, c] = threeInProposal();
    const { onMove } = showBoard([a, b, c]);
    await press("C", "Space", "ArrowUp", "Space");
    expect(onMove).toHaveBeenCalledExactlyOnceWith({ dealId: c.id, stage: "proposal", beforeDealId: b.id });
  });

  it("moves it to the end of its column", async () => {
    const [a, b, c] = threeInProposal();
    const { onMove } = showBoard([a, b, c]);
    await press("B", "Space", "ArrowDown", "ArrowDown", "Space");
    expect(onMove).toHaveBeenCalledExactlyOnceWith({ dealId: b.id, stage: "proposal", beforeDealId: null });
  });

  it("opens a gap where it will land while it's held", async () => {
    showBoard(threeInProposal());
    expect(screen.queryByTestId("drop-gap")).toBeNull();
    await press("A", "Space", "ArrowDown");
    expect(within(column("proposal")).getByTestId("drop-gap")).toBeTruthy();
  });

  it("makes no move when it's dropped back where it was", async () => {
    const { onMove } = showBoard(threeInProposal());
    await press("A", "Space", "ArrowUp", "Space");
    expect(onMove).not.toHaveBeenCalled();
    expect(screen.queryByTestId("drop-gap")).toBeNull();
  });

  it("steps across the columns on ArrowLeft and ArrowRight", async () => {
    const [a, b] = [deal("A", "proposal"), deal("B", "proposal")];
    const { onMove } = showBoard([a, b]);
    await press("A", "Space", "ArrowRight", "ArrowRight", "ArrowLeft", "Space");
    expect(onMove).toHaveBeenCalledExactlyOnceWith({ dealId: a.id, stage: "negotiation", beforeDealId: null });
  });

  it("reaches the top of another column by moving up as far as it goes", async () => {
    const [first, second, moving] = [deal("First", "qualified"), deal("Second", "qualified"), deal("A", "proposal")];
    const { onMove } = showBoard([first, second, moving]);
    await press("A", "Space", "ArrowLeft", "ArrowUp", "ArrowUp", "ArrowUp", "Space");
    expect(onMove).toHaveBeenCalledExactlyOnceWith({ dealId: moving.id, stage: "qualified", beforeDealId: first.id });
  });

  it("lands in an empty column", async () => {
    const moving = deal("A", "won");
    const { onMove } = showBoard([moving]);
    await press("A", "Space", "ArrowRight", "ArrowDown", "Space");
    expect(onMove).toHaveBeenCalledExactlyOnceWith({ dealId: moving.id, stage: "lost", beforeDealId: null });
  });

  it("ignores other keys while it's held", async () => {
    const [a, b, c] = threeInProposal();
    const { onMove } = showBoard([a, b, c]);
    await press("A", "Space", "KeyX", "ArrowDown", "Space");
    expect(onMove).toHaveBeenCalledExactlyOnceWith({ dealId: a.id, stage: "proposal", beforeDealId: c.id });
  });

  it("puts it back on Escape", async () => {
    const { onMove } = showBoard(threeInProposal());
    await press("A", "Space", "ArrowRight", "Escape");
    expect(onMove).not.toHaveBeenCalled();
    expect(screen.queryByTestId("drop-gap")).toBeNull();
    expect(namesIn("proposal")).toEqual(["A", "B", "C"]);
  });

  it("drops nothing if the deal goes away while it's held", async () => {
    const [a, b, c] = threeInProposal();
    const { onMove, showDeals } = showBoard([a, b, c]);
    await press("A", "Space");
    showDeals([b, c]);
    const person = user();
    await person.keyboard("[ArrowDown]");
    await person.keyboard("[Space]");
    expect(onMove).not.toHaveBeenCalled();
  });
});

describe("after a drop", () => {
  /** A board of three cards, and the order it has once A has moved below B. */
  function threeCards() {
    const [a, b, c] = [deal("A", "proposal"), deal("B", "proposal"), deal("C", "proposal")];
    const board = showBoard([a, b, c]);
    return {
      ...board,
      aBelowB: [
        { ...b, position: 0 },
        { ...a, position: 1 },
        { ...c, position: 2 },
      ],
    };
  }

  it("keeps the gap open until the new order arrives", async () => {
    const { showDeals, aBelowB } = threeCards();
    await press("A", "Space", "ArrowDown", "Space");
    expect(screen.getByTestId("drop-gap")).toBeTruthy();

    showDeals(aBelowB);
    expect(screen.queryByTestId("drop-gap")).toBeNull();
    expect(namesIn("proposal")).toEqual(["B", "A", "C"]);
  });

  it("closes the gap anyway if the new order is slow to come", async () => {
    threeCards();
    await press("A", "Space", "ArrowDown", "Space");
    await waitFor(() => expect(screen.queryByTestId("drop-gap")).toBeNull());
  });

  it("starts the next pick-up afresh, even before the new order arrives", async () => {
    threeCards();
    await press("A", "Space", "ArrowDown", "Space");
    await press("C", "Space");
    expect(screen.queryByTestId("drop-gap")).toBeNull();
  });

  it("settles the card that landed, briefly", async () => {
    const { showDeals, aBelowB } = threeCards();
    await press("A", "Space", "ArrowDown", "Space");
    showDeals(aBelowB);
    expect(card("A").className).toContain("animate-settle");
    await waitFor(() => expect(card("A").className).not.toContain("animate-settle"));
  });
});

describe("moving a card with the pointer", () => {
  it("drops it in the column it's let go over", async () => {
    const moving = deal("Moving", "proposal");
    const { onMove } = showBoard([moving]);
    const start = middleOf(card("Moving"));
    await user().pointer([
      { keys: "[MouseLeft>]", target: card("Moving"), coords: start },
      { coords: { clientX: start.clientX + 20, clientY: start.clientY } },
      { coords: { clientX: start.clientX + COLUMN_WIDTH, clientY: start.clientY } },
      { keys: "[/MouseLeft]", target: column("negotiation") },
    ]);
    expect(onMove).toHaveBeenCalledWith({ dealId: moving.id, stage: "negotiation", beforeDealId: null });
  });
});
