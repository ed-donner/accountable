import { act, screen, waitFor, within } from "@testing-library/react";
import { Toaster } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { layOutBoard, META, mockApi, renderApp, user } from "../../test-utils";
import type { Deal, MoveResult, Stage } from "../queries";
import { Pipeline } from "./Pipeline";

function deal(id: number, name: string, stage: Stage, extra: Partial<Deal> = {}): Deal {
  return {
    id,
    name,
    organization_id: 1,
    organization_name: "Harbor & Pine",
    main_contact_id: 11,
    main_contact_name: "Sam Carter",
    stage,
    value: 1000,
    probability: 5,
    expected_revenue: 50,
    close_date: "2031-05-06",
    position: id,
    ...extra,
  };
}

const FAILED = { status: 500, body: { detail: "Something went wrong." } };

function showPipeline(routes: Record<string, unknown>) {
  const calls = mockApi({ "GET /meta": META, ...routes });
  const view = renderApp(
    <>
      <Pipeline />
      <Toaster />
    </>,
  );
  return { ...view, calls };
}

const NOTHING_ELSE: MoveResult["changes"] = { close_date: null, new_customer: null };

/** A backend holding one deal. Its move saves `after`, so the reads that follow see the move. */
function savingBackend(before: Deal, after: Deal, changes = NOTHING_ELSE) {
  let saved = [before];
  return {
    "GET /deals": () => ({ body: saved }),
    [`POST /deals/${before.id}/move`]: () => {
      saved = [after];
      return { body: { deal: after, changes } };
    },
  };
}

/** Holds back every reply to a move until it's released. Call it after mockApi. */
function holdMoves() {
  const answer = globalThis.fetch;
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    if (url.endsWith("/move")) await held;
    return answer(url, init);
  });
  return release;
}

function column(stage: Stage) {
  return within(screen.getByTestId(`column-${stage}`));
}

async function card(name: string): Promise<HTMLElement> {
  await screen.findByText(name);
  const found = screen.getAllByRole("link").find((link) => link.dataset.deal === name);
  if (!found) throw new Error(`No card for ${name}`);
  return found;
}

/** Picks the card up with the keyboard, steps it to the right, and drops it. */
async function moveRight(name: string, columns = 1) {
  (await card(name)).focus();
  const person = user();
  await person.keyboard("[Space]");
  for (let step = 0; step < columns; step += 1) await person.keyboard("[ArrowRight]");
  await person.keyboard("[Space]");
}

beforeEach(layOutBoard);

describe("the pipeline page", () => {
  it("shows the open pipeline and its expected revenue once the deals arrive, leaving out Won and Lost", async () => {
    showPipeline({
      "GET /deals": [
        deal(1, "Early", "new", { value: 1010, probability: 5 }),
        deal(2, "Close", "negotiation", { value: 2000, probability: 70 }),
        deal(3, "Banked", "won", { value: 5000, probability: 100 }),
        deal(4, "Gone", "lost", { value: 7000, probability: 0 }),
      ],
    });
    expect(screen.queryByTestId("board-value")).toBeNull();

    expect((await screen.findByTestId("board-value")).textContent).toBe("$3,010");
    expect(screen.getByTestId("board-expected").textContent).toBe("$1,451");
  });

  it("asks for the first deal when there are none", async () => {
    showPipeline({ "GET /deals": [] });
    expect(await screen.findByText("No deals yet. Add the first one.")).toBeTruthy();
    expect(screen.getByTestId("board-value").textContent).toBe("$0");
  });

  it("says so when the deals can't be loaded, and shows them after Try again", async () => {
    let reads = 0;
    showPipeline({
      "GET /deals": () => {
        reads += 1;
        return reads === 1 ? FAILED : { body: [deal(1, "Recovered", "new")] };
      },
    });
    expect((await screen.findByRole("alert")).textContent).toContain("Couldn't load this.");

    await user().click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Recovered")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("keeps the board when a later read fails, and says it may be out of date", async () => {
    let reads = 0;
    const { client } = showPipeline({
      "GET /deals": () => {
        reads += 1;
        return reads === 1 ? { body: [deal(1, "Kept", "new")] } : FAILED;
      },
    });
    await screen.findByText("Kept");

    await act(() => client.refetchQueries({ queryKey: ["deals"] }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Couldn't refresh this, so it may be out of date.",
    );
    expect(screen.getByText("Kept")).toBeTruthy();
  });

  it("opens the deal form at a column's stage, and closes it on Cancel", async () => {
    showPipeline({ "GET /deals": [], "GET /organizations": [], "GET /contacts": [] });
    await user().click(await screen.findByRole("button", { name: "Add deal to Proposal" }));

    const form = within(await screen.findByRole("dialog", { name: "Add deal" }));
    expect((form.getByLabelText("Stage") as HTMLSelectElement).value).toBe("proposal");

    await user().click(form.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});

describe("moving a card on the pipeline page", () => {
  it("moves it and its figures at once, before the move is saved", async () => {
    const mover = deal(1, "Mover", "new", { value: 1010 });
    const { calls } = showPipeline(savingBackend(mover, { ...mover, stage: "negotiation", probability: 70 }));
    const release = holdMoves();
    expect((await screen.findByTestId("board-expected")).textContent).toBe("$51");

    await moveRight("Mover", 3);

    expect(column("negotiation").getByText("Mover")).toBeTruthy();
    expect(column("new").getByTestId("column-count").textContent).toBe("0");
    expect(column("negotiation").getByTestId("column-value").textContent).toBe("$1,010");
    expect(screen.getByTestId("board-expected").textContent).toBe("$707");

    release();
    await waitFor(() => expect(calls.filter((call) => call.path === "/deals")).toHaveLength(2));
    expect(calls).toContainEqual({
      method: "POST",
      path: "/deals/1/move",
      body: { stage: "negotiation", before_deal_id: null },
    });
    expect(column("negotiation").getByText("Mover")).toBeTruthy();
  });

  it("puts it back and says so when the move can't be saved", async () => {
    showPipeline({ "GET /deals": [deal(1, "Stuck", "new")], "POST /deals/1/move": () => FAILED });

    await moveRight("Stuck");

    expect(await screen.findByText("Couldn't move that deal, so it's back where it was.")).toBeTruthy();
    expect(column("new").getByText("Stuck")).toBeTruthy();
    expect(column("qualified").queryByText("Stuck")).toBeNull();
  });

  it("says what else changed after a drop on Won", async () => {
    const winner = deal(1, "Winner", "negotiation");
    showPipeline(
      savingBackend(
        winner,
        { ...winner, stage: "won", probability: 100 },
        { close_date: "2026-11-02", new_customer: "Sam Carter" },
      ),
    );

    await moveRight("Winner");

    expect(
      await screen.findByText("Marked as Won. Close date set to today. Sam Carter is now a customer."),
    ).toBeTruthy();
    expect(column("won").getByText("Winner")).toBeTruthy();
  });
});
