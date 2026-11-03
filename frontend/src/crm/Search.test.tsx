import { act, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useLocation } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { mockApi, renderApp, type Call } from "../test-utils";
import { PAUSE_MS, Search, type SearchResults } from "./Search";

const NONE = { count: 0, results: [] };

const HARB: SearchResults = {
  organizations: { count: 1, results: [{ id: 1, name: "Harbor & Pine", industry: "Logistics" }] },
  contacts: {
    count: 12,
    results: ["Sam Harbinger", "Ada Harbord", "Bo Harbin", "Cy Harbury", "Di Harbel"].map((name, index) => ({
      id: index + 10,
      name,
      organization_name: "Harbor & Pine",
    })),
  },
  deals: { count: 1, results: [{ id: 7, name: "Harbor refit", stage: "proposal", organization_name: null }] },
};

const ONLY_DEALS: SearchResults = { ...HARB, organizations: NONE, contacts: NONE };
const NOTHING: SearchResults = { organizations: NONE, contacts: NONE, deals: NONE };

function ShowAddress() {
  const { pathname, search } = useLocation();
  return <p data-testid="address">{pathname + search}</p>;
}

function openSearch() {
  renderApp(
    <>
      <Search />
      <ShowAddress />
    </>,
  );
  return screen.getByRole<HTMLInputElement>("combobox", { name: "Search organizations, contacts and deals" });
}

function typist() {
  return userEvent.setup({ advanceTimers: vi.advanceTimersByTime, pointerEventsCheck: 0 });
}

/** Lets time pass, and then whatever it set off finish, such as a reply and the redraw it brings. */
async function wait(ms: number) {
  await act(() => vi.advanceTimersByTimeAsync(ms));
  await act(() => vi.advanceTimersByTimeAsync(0));
}

function searches(calls: Call[]) {
  return calls.filter((call) => call.path.startsWith("/search")).map((call) => call.path);
}

function address() {
  return screen.getByTestId("address").textContent;
}

function list() {
  return screen.queryByRole("listbox");
}

function optionNames() {
  return screen.getAllByRole("option").map((option) => option.textContent);
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("asking", () => {
  it("asks nothing until typing pauses for 150ms, then asks once for what's typed", async () => {
    const calls = mockApi({ "GET /search?q=harb": HARB });
    const box = openSearch();
    await typist().type(box, "harb");
    expect(searches(calls)).toEqual([]);
    await wait(PAUSE_MS);
    expect(searches(calls)).toEqual(["/search?q=harb"]);
  });

  it("starts the pause again at each keystroke", async () => {
    const calls = mockApi({ "GET /search?q=ha": HARB });
    const box = openSearch();
    const keys = typist();
    await keys.type(box, "h");
    await wait(PAUSE_MS - 50);
    await keys.type(box, "a");
    await wait(PAUSE_MS - 50);
    expect(searches(calls)).toEqual([]);
    await wait(50);
    expect(searches(calls)).toEqual(["/search?q=ha"]);
  });

  it("leaves out the spaces at the ends, and asks nothing for spaces alone", async () => {
    const calls = mockApi({ "GET /search?q=harb": HARB });
    const box = openSearch();
    await typist().type(box, "   ");
    await wait(PAUSE_MS);
    expect(searches(calls)).toEqual([]);
    await typist().type(box, "harb  ");
    await wait(PAUSE_MS);
    expect(searches(calls)).toEqual(["/search?q=harb"]);
  });

  it("never lets an older reply arriving late replace a newer one", async () => {
    const replies = new Map<string, (results: SearchResults) => void>();
    vi.stubGlobal(
      "fetch",
      (url: string) =>
        new Promise<Response>((resolve) => {
          const text = new URL(url, "http://localhost").searchParams.get("q")!;
          replies.set(text, (results) => resolve(json(results)));
        }),
    );
    const box = openSearch();
    const keys = typist();
    await keys.type(box, "har");
    await wait(PAUSE_MS);
    await keys.type(box, "b");
    await wait(PAUSE_MS);

    replies.get("harb")!(ONLY_DEALS);
    await wait(0);
    expect(optionNames()).toEqual(["Harbor refitProposal"]);

    replies.get("har")!(HARB);
    await wait(0);
    expect(optionNames()).toEqual(["Harbor refitProposal"]);
  });
});

describe("the results", () => {
  async function searchFor(text: string, results: SearchResults = HARB) {
    mockApi({ [`GET /search?q=${text}`]: results });
    const box = openSearch();
    await typist().type(box, text);
    await wait(PAUSE_MS);
    return box;
  }

  it("come in three groups, in order, each showing up to 5", async () => {
    await searchFor("harb");
    const groups = screen.getAllByRole("group");
    expect(groups).toEqual(["Organizations", "Contacts", "Deals"].map((name) => screen.getByRole("group", { name })));
    // The contacts' sixth is See all.
    expect(groups.map((group) => within(group).getAllByRole("option").length)).toEqual([1, 6, 1]);
  });

  it("leave out a group with no matches", async () => {
    await searchFor("refit", ONLY_DEALS);
    expect(screen.getAllByRole("group")).toEqual([screen.getByRole("group", { name: "Deals" })]);
  });

  it("show each name with the matching part in semibold, and one detail", async () => {
    await searchFor("HARB");
    const organization = screen.getByRole("option", { name: /^Harbor & Pine/ });
    expect(within(organization).getByText("Harb").tagName).toBe("STRONG");
    within(organization).getByText("Logistics");
    const contact = screen.getByRole("option", { name: /^Sam Harbinger/ });
    expect(within(contact).getByText("Harb").tagName).toBe("STRONG");
    within(contact).getByText("Harbor & Pine");
  });

  it("show a deal's stage after its name, and nothing for a blank organization", async () => {
    await searchFor("refit", ONLY_DEALS);
    expect(screen.getByRole("option").textContent).toBe("Harbor refitProposal");
  });

  it("end a group of more than 5 with See all, which opens that table with the same search", async () => {
    await searchFor("harb");
    const seeAll = screen.getByRole("option", { name: "See all 12 contacts" });
    expect(screen.queryByRole("option", { name: /See all 1 / })).toBeNull();
    await typist().click(seeAll);
    expect(address()).toBe("/contacts?q=harb");
    expect(screen.getByRole<HTMLInputElement>("combobox").value).toBe("");
    expect(list()).toBeNull();
  });

  it("say so when nothing matches", async () => {
    await searchFor("harbour", NOTHING);
    expect(screen.getByRole("status").textContent).toBe('No organizations, contacts or deals match "harbour".');
  });
});

describe("opening a result", () => {
  async function showResults() {
    mockApi({ "GET /search?q=harb": HARB });
    const box = openSearch();
    const keys = typist();
    await keys.type(box, "harb");
    await wait(PAUSE_MS);
    return { box, keys };
  }

  it("opens the one clicked, clearing the box and closing the list", async () => {
    const { box, keys } = await showResults();
    await keys.click(screen.getByRole("option", { name: /^Sam Harbinger/ }));
    expect(address()).toBe("/contacts/10");
    expect(box.value).toBe("");
    expect(list()).toBeNull();
  });

  it("moves with the arrow keys and opens the highlighted one with Enter", async () => {
    const { box, keys } = await showResults();
    expect(screen.getByRole("option", { name: /^Harbor & Pine/ }).getAttribute("aria-selected")).toBe("true");
    await keys.keyboard("{ArrowDown}{ArrowDown}{ArrowUp}{ArrowDown}");
    expect(screen.getByRole("option", { name: /^Ada Harbord/ }).getAttribute("aria-selected")).toBe("true");
    await keys.keyboard("{Enter}");
    expect(address()).toBe("/contacts/11");
    expect(box.value).toBe("");
    expect(document.activeElement).toBe(box);
  });

  it("closes the list with Escape, keeping the text, and clears the box with a second", async () => {
    const { box, keys } = await showResults();
    await keys.keyboard("{Escape}");
    expect(list()).toBeNull();
    expect(box.value).toBe("harb");
    expect(document.activeElement).toBe(box);
    await keys.keyboard("{Escape}");
    expect(box.value).toBe("");
    expect(address()).toBe("/");
  });

  it("opens the list again with a click or the down arrow after Escape", async () => {
    const { box, keys } = await showResults();
    await keys.keyboard("{Escape}");
    await keys.click(box);
    expect(list()).not.toBeNull();
    await keys.keyboard("{Escape}{ArrowDown}");
    expect(list()).not.toBeNull();
  });

  it("closes the list when something else on the page is clicked", async () => {
    const { keys } = await showResults();
    await wait(1); // Radix starts listening for clicks outside a moment after the list opens.
    await keys.click(screen.getByTestId("address"));
    await wait(0);
    expect(list()).toBeNull();
  });
});

describe("a failed search", () => {
  it("says it couldn't search and keeps what was typed, and tries again when the box is clicked", async () => {
    let fail = true;
    const calls = mockApi({ "GET /search?q=harb": () => (fail ? { status: 500, body: {} } : { body: HARB }) });
    const box = openSearch();
    const keys = typist();
    await keys.type(box, "harb");
    await wait(PAUSE_MS);
    expect(screen.getByRole("status").textContent).toBe("Couldn't search. Try again.");
    expect(box.value).toBe("harb");

    fail = false;
    await keys.click(box);
    await wait(0);
    expect(searches(calls)).toHaveLength(2);
    expect(optionNames()).toContain("Harbor & PineLogistics");
  });

  it("adds no message of its own when the connection is lost, which the top of the page reports", async () => {
    vi.stubGlobal("fetch", () => Promise.reject(new TypeError("Failed to fetch")));
    const box = openSearch();
    await typist().type(box, "harb");
    await wait(PAUSE_MS);
    expect(screen.queryByRole("status")).toBeNull();
    expect(list()).toBeNull();
    expect(box.value).toBe("harb");
  });
});
