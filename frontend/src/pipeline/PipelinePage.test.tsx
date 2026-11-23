// P1 to P8: the board's columns and totals, search, adding, opening and moving cards by keyboard.
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Schemas } from "../shared/api";
import {
  contactRow,
  dealRow,
  list,
  mockApi,
  organizationRow,
  renderApp,
} from "../shared/test-utils";

const COLUMN_WIDTH = 300;
const CARD_HEIGHT = 100;

// jsdom has no layout, so give each column and card a place: columns side by side
// in board order, cards stacked down their column, each column as tall as its cards. Dragging needs real positions.
// The card under the pointer while dragging starts where the card it copies is.
function layout(this: HTMLElement): DOMRect {
  const id = this.getAttribute("data-deal-id");
  const column = this.closest("section");
  if (id && !column) {
    const original = document.querySelector<HTMLElement>(`section [data-deal-id="${id}"]`);
    if (original) return layout.call(original);
  }
  const columns = [...document.querySelectorAll("section")];
  const left = Math.max(0, columns.indexOf(column as HTMLElement)) * COLUMN_WIDTH;
  const top = id ? [...this.parentElement!.children].indexOf(this) * CARD_HEIGHT : 0;
  const height = id ? CARD_HEIGHT : Math.max(1, this.children.length) * CARD_HEIGHT;
  return DOMRect.fromRect({ x: left, y: top, width: COLUMN_WIDTH - 20, height });
}

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(layout);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const renewal = dealRow({ id: 1, name: "Fleet renewal", stage: "new", position: 1, is_late: true });
const lorries = dealRow({
  id: 2,
  name: "Lorry lease",
  stage: "new",
  position: 2,
  value: 20000,
  probability: 10,
  expected_revenue: 2000,
  organization_name: "Cove Foods",
  contact_name: null,
});
const parts = dealRow({
  id: 3,
  name: "Spare parts",
  stage: "won",
  value: 2500,
  probability: 100,
  expected_revenue: 2500,
  organization_name: null,
  close_date: null,
});
const deals = [renewal, lorries, parts];

const forms = {
  "GET /organizations": list([organizationRow()]),
  "GET /contacts": {
    ...list([contactRow()]),
    status_counts: { all: 1, lead: 1, qualified: 0, customer: 0 },
  },
};

function open(extra = {}) {
  const calls = mockApi({ "GET /deals": list(deals), ...forms, ...extra });
  renderApp("/pipeline");
  return calls;
}

const column = (name: string) => screen.findByRole("region", { name });
const card = (name: RegExp) => screen.findByRole("button", { name });
/** Space on a card picks it up; the board then listens for the arrow keys. */
async function pickUp(name: string, stage: string) {
  const target = await card(new RegExp(name));
  target.focus();
  fireEvent.keyDown(target, { code: "Space", key: " " });
  // The pick-up is announced, then where the card is.
  expect(await screen.findByText(`${name} is over ${stage}.`)).toBeInTheDocument();
  // The keyboard sensor starts listening on the next tick.
  await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
}

const press = (code: string) => fireEvent.keyDown(document, { code, key: code });

const moves = (calls: { method: string; path: string; body: unknown }[]) =>
  calls.filter((c) => c.method === "POST");

test("each stage is a column of cards with its totals, and the board totals open deals", async () => {
  open();
  const fresh = await column("New");
  expect(within(fresh).getByLabelText("2 deals")).toBeInTheDocument();
  expect(fresh).toHaveTextContent("$30,000exp. $7,000");
  expect(within(fresh).getByRole("button", { name: "Fleet renewal, $10,000" })).toHaveTextContent(
    "Fleet renewalBolt Freight · Ann Bolt$10,000",
  );
  expect(within(fresh).getByRole("button", { name: "Lorry lease, $20,000" })).toHaveTextContent(
    "Cove Foods$20,000",
  );
  expect(within(fresh).getByText("Late")).toBeInTheDocument();
  const won = await column("Won");
  expect(won).toHaveTextContent("$2,500exp. $2,500");
  expect(within(won).getByRole("button", { name: /Spare parts/ })).toHaveTextContent(
    "No organization · Ann Bolt$2,500No close date",
  );
  expect(
    within(await column("Qualified")).getByText("No deals at this stage yet."),
  ).toBeInTheDocument();
  const totals = screen.getByLabelText("Open pipeline totals");
  expect(totals).toHaveTextContent("Open pipeline$30,000Expected revenue$7,000");
  expect(screen.getByText("2 open deals. Drag a card to change its stage.")).toBeInTheDocument();
});

test("search shows only matching cards, and the columns total what's shown", async () => {
  open();
  await column("New");
  await userEvent.type(screen.getByRole("searchbox", { name: "Search deals" }), "cove");
  const fresh = await column("New");
  expect(within(fresh).queryByRole("button", { name: /Fleet renewal/ })).not.toBeInTheDocument();
  expect(within(fresh).getByLabelText("1 deals")).toBeInTheDocument();
  expect(fresh).toHaveTextContent("$20,000exp. $2,000");
  expect(screen.getByLabelText("Open pipeline totals")).toHaveTextContent("$30,000");
});

test("clicking a card, or Enter on it, opens the deal", async () => {
  open({ "GET /deals/1": renewal, "GET /deals/1/timeline": { items: [] } });
  await userEvent.click(await card(/Fleet renewal/));
  expect(await screen.findByRole("heading", { name: "Fleet renewal" })).toBeInTheDocument();
});

test("Enter on a focused card opens the deal", async () => {
  open({ "GET /deals/2": lorries, "GET /deals/2/timeline": { items: [] } });
  (await card(/Lorry lease/)).focus();
  await userEvent.keyboard("{Enter}");
  expect(await screen.findByRole("heading", { name: "Lorry lease" })).toBeInTheDocument();
});

test("Add deal in a column starts the deal in that stage", async () => {
  open();
  await userEvent.click(
    within(await column("Negotiation")).getByRole("button", { name: "Add deal in Negotiation" }),
  );
  const panel = await screen.findByRole("dialog", { name: "Add deal" });
  await waitFor(() =>
    expect(within(panel).getByLabelText(/Stage/)).toHaveDisplayValue("Negotiation"),
  );
  await userEvent.click(within(panel).getByRole("button", { name: "Cancel" }));
  await userEvent.click(screen.getByRole("button", { name: "Add deal" }));
  const fresh = await screen.findByRole("dialog", { name: "Add deal" });
  await waitFor(() => expect(within(fresh).getByLabelText(/Stage/)).toHaveDisplayValue("New"));
});

test("a card picked up with Space and moved right drops into the next stage", async () => {
  let saved: Schemas["DealRow"][] = deals;
  const calls = open({
    "GET /deals": () => ({ body: list(saved) }),
    "POST /deals/1/move": () => {
      saved = [{ ...renewal, stage: "qualified", probability: 25 }, lorries, parts];
      return { body: saved[0] };
    },
  });
  await pickUp("Fleet renewal", "New");
  press("ArrowRight");
  expect(await screen.findByText("Fleet renewal is over Qualified.")).toBeInTheDocument();
  press("Space");
  expect(await screen.findByText("Dropped Fleet renewal in Qualified.")).toBeInTheDocument();
  await waitFor(() => expect(moves(calls)).toHaveLength(1));
  expect(moves(calls)[0]).toEqual({
    method: "POST",
    path: "/deals/1/move",
    body: { stage: "qualified", after_id: null, before_id: null },
  });
  const qualified = await column("Qualified");
  await waitFor(() =>
    expect(within(qualified).getByRole("button", { name: /Fleet renewal/ })).toBeInTheDocument(),
  );
});

test("a card moved down its column is saved below the next card", async () => {
  const calls = open({ "POST /deals/1/move": { ...renewal, position: 3 } });
  await pickUp("Fleet renewal", "New");
  press("ArrowDown");
  press("Space");
  expect(await screen.findByText("Dropped Fleet renewal in New.")).toBeInTheDocument();
  await waitFor(() => expect(moves(calls)).toHaveLength(1));
  expect(moves(calls)[0].body).toEqual({ stage: "new", after_id: 2, before_id: null });
});

test("Escape puts a picked-up card back without saving", async () => {
  const calls = open();
  await pickUp("Fleet renewal", "New");
  press("ArrowRight");
  press("Escape");
  expect(await screen.findByText("Move cancelled.")).toBeInTheDocument();
  expect(
    within(await column("New")).getByRole("button", { name: /Fleet renewal/ }),
  ).toBeInTheDocument();
  expect(moves(calls)).toHaveLength(0);
});

test("a card dropped where it started isn't saved", async () => {
  const calls = open();
  await pickUp("Spare parts", "Won");
  press("Space");
  expect(await screen.findByText(/Dropped Spare parts in Won\./)).toBeInTheDocument();
  expect(moves(calls)).toHaveLength(0);
});

test("a move that fails puts the card back and says why", async () => {
  open({
    "POST /deals/2/move": () => ({ status: 409, body: { message: "That deal has changed." } }),
  });
  await pickUp("Lorry lease", "New");
  // There is no stage before New, so Left leaves the card where it is.
  press("ArrowLeft");
  press("ArrowRight");
  expect(await screen.findByText("Lorry lease is over Qualified.")).toBeInTheDocument();
  press("Space");
  expect(
    await screen.findByText("Couldn't move Lorry lease. That deal has changed."),
  ).toBeInTheDocument();
  expect(
    within(await column("New")).getByRole("button", { name: /Lorry lease/ }),
  ).toBeInTheDocument();
});

test("a board that fails to load says so", async () => {
  mockApi({ "GET /deals": () => ({ status: 500, body: {} }) });
  renderApp("/pipeline");
  expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't load this pipeline.");
});
