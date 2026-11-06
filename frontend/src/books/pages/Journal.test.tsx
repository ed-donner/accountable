import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { mockApi, user } from "../../test-utils";
import {
  COUNT_PATH,
  FakeObserver,
  entriesPath,
  entriesReply,
  entry,
  manyEntries,
  renderAt,
  stubObserver,
} from "../test-books";
import { Journal } from "./Journal";

const FIRST_PAGE = `GET ${entriesPath()}`;

function open(address = "/accounting/journal") {
  return renderAt(address, "/accounting/journal", <Journal />);
}

function address() {
  return screen.getByTestId("where").textContent;
}

function titles() {
  return screen.getAllByRole("article").map((article) => article.getAttribute("aria-label")?.split(",")[0]);
}

beforeEach(stubObserver);
afterEach(() => vi.unstubAllGlobals());

/** Answers a path only when told to, on top of mockApi, so a test can make a reply late. */
function delay(match: string) {
  const answer = globalThis.fetch;
  let release = () => undefined as void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    if (url.includes(match)) await held;
    return answer(url, init);
  });
  return release;
}

describe("the Journal", () => {
  it("lists the entries newest first with how many there are", async () => {
    mockApi({
      [FIRST_PAGE]: entriesReply([entry({ id: 3, description: "Third" }), entry({ id: 2, description: "Second" })]),
      [COUNT_PATH]: entriesReply([], 2),
    });
    open();
    await screen.findAllByRole("article");
    expect(titles()).toEqual(["Third", "Second"]);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Journal");
    expect(screen.getByText("2 entries")).toBeTruthy();
    expect(document.title).toBe("Journal | Accountable");
    expect(screen.getAllByText("Dana Whitfield, Oct 30, 2026", { selector: "p" })).toHaveLength(2);
  });

  it("shows five grey placeholders while the first page is on its way", async () => {
    const release = delay("/books/entries?limit=100");
    mockApi({ [FIRST_PAGE]: entriesReply([entry()]), [COUNT_PATH]: entriesReply([], 1) });
    open();
    expect(screen.getByTestId("entries-loading").children).toHaveLength(5);
    release();
    await screen.findByRole("article");
    expect(screen.queryByTestId("entries-loading")).toBeNull();
  });

  it("has the toolbar's four controls named for a screen reader", async () => {
    mockApi({ [FIRST_PAGE]: entriesReply([entry()]), [COUNT_PATH]: entriesReply([], 1) });
    open();
    await screen.findByRole("article");
    const search = screen.getByRole("searchbox", { name: "Search entries" });
    expect(search.getAttribute("placeholder")).toBe("Search description or document");
    const account = screen.getByRole("combobox", { name: "Account" }) as HTMLSelectElement;
    expect(within(account).getAllByRole("option")).toHaveLength(13);
    expect(account.selectedOptions[0].textContent).toBe("All accounts");
    expect(screen.getByLabelText("From")).toBeTruthy();
    expect(screen.getByLabelText("To")).toBeTruthy();
  });

  it("reads the filters from the address, and asks for them", async () => {
    const path = entriesPath({ q: "inv", account: "cash", from: "2026-10-01", to: "2026-10-31" });
    const calls = mockApi({
      [`GET ${path}`]: entriesReply([entry()], 1),
      [COUNT_PATH]: entriesReply([], 230),
    });
    open("/accounting/journal?q=inv&account=cash&from=2026-10-01&to=2026-10-31");
    await screen.findByRole("article");
    expect(calls.map((call) => call.path)).toContain(path);
    expect((screen.getByRole("searchbox") as HTMLInputElement).value).toBe("inv");
    expect((screen.getByRole("combobox", { name: "Account" }) as HTMLSelectElement).value).toBe("cash");
    expect((screen.getByLabelText("From") as HTMLInputElement).value).toBe("2026-10-01");
    expect((screen.getByLabelText("To") as HTMLInputElement).value).toBe("2026-10-31");
    expect(screen.getByText("1 of 230 entries")).toBeTruthy();
  });

  it("writes an account and dates to the address as they're chosen", async () => {
    mockApi({
      [FIRST_PAGE]: entriesReply([entry()]),
      [`GET ${entriesPath({ account: "payable" })}`]: entriesReply([entry({ description: "Payable one" })]),
      [`GET ${entriesPath({ account: "payable", from: "2026-10-01" })}`]: entriesReply([]),
      [COUNT_PATH]: entriesReply([], 1),
    });
    open();
    await screen.findByRole("article");

    await user().selectOptions(screen.getByRole("combobox", { name: "Account" }), "payable");
    expect(address()).toBe("/accounting/journal?account=payable");
    await screen.findByText("Payable one", { selector: "span" });

    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-10-01" } });
    expect(address()).toBe("/accounting/journal?account=payable&from=2026-10-01");
    expect(await screen.findByText("No entries match.")).toBeTruthy();
  });

  it("searches once typing pauses for 150ms, not on every key", async () => {
    const calls = mockApi({
      [FIRST_PAGE]: entriesReply([entry()]),
      [`GET ${entriesPath({ q: "north" })}`]: entriesReply([entry({ description: "Bill 4417 from Northwind" })]),
      [COUNT_PATH]: entriesReply([], 5),
    });
    open();
    await screen.findByRole("article");

    await user().type(screen.getByRole("searchbox"), "north");
    expect(address()).toBe("/accounting/journal");
    await waitFor(() => expect(address()).toBe("/accounting/journal?q=north"));
    await screen.findByText("Bill 4417 from Northwind", { selector: "span" });
    const searched = calls.map((call) => call.path).filter((path) => path.includes("q="));
    expect(searched).toEqual([entriesPath({ q: "north" })]);
  });

  it("never lets the reply to an older search replace a newer one", async () => {
    const release = delay("q=a&");
    mockApi({
      [`GET ${entriesPath({ q: "a" })}`]: entriesReply([entry({ description: "Old answer" })]),
      [`GET ${entriesPath({ q: "ab" })}`]: entriesReply([entry({ description: "New answer" })]),
      [COUNT_PATH]: entriesReply([], 9),
    });
    open("/accounting/journal?q=a");
    await user().type(screen.getByRole("searchbox"), "b");
    await screen.findByText("New answer", { selector: "span" });

    release();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(screen.getByText("New answer", { selector: "span" })).toBeTruthy();
    expect(screen.queryByText("Old answer")).toBeNull();
  });

  it("shows Clear filters only while one is set, and clears them all, the search box too", async () => {
    mockApi({
      [FIRST_PAGE]: entriesReply([entry()]),
      [`GET ${entriesPath({ q: "inv", account: "cash" })}`]: entriesReply([entry()]),
      [COUNT_PATH]: entriesReply([], 1),
    });
    const { unmount } = open();
    await screen.findByRole("article");
    expect(screen.queryByRole("button", { name: "Clear filters" })).toBeNull();
    unmount();

    open("/accounting/journal?q=inv&account=cash");
    await screen.findByRole("article");
    await user().click(screen.getByRole("button", { name: "Clear filters" }));

    expect(address()).toBe("/accounting/journal");
    await waitFor(() => expect((screen.getByRole("searchbox") as HTMLInputElement).value).toBe(""));
    expect(screen.queryByRole("button", { name: "Clear filters" })).toBeNull();
  });

  it("says No entries match. with Clear filters when a search finds nothing", async () => {
    mockApi({
      [`GET ${entriesPath({ q: "zzz" })}`]: entriesReply([]),
      [COUNT_PATH]: entriesReply([], 230),
    });
    open("/accounting/journal?q=zzz");
    expect(await screen.findByText("No entries match.")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Clear filters" })).toHaveLength(2);
    expect(screen.getByText("0 of 230 entries")).toBeTruthy();
  });

  it("says a From after the To finds nothing", async () => {
    mockApi({
      [`GET ${entriesPath({ from: "2026-12-01", to: "2026-01-01" })}`]: entriesReply([]),
      [COUNT_PATH]: entriesReply([], 230),
    });
    open("/accounting/journal?from=2026-12-01&to=2026-01-01");
    expect(await screen.findByText("No entries match.")).toBeTruthy();
  });

  it("says there are no entries yet when the books are empty", async () => {
    mockApi({ [FIRST_PAGE]: entriesReply([]), [COUNT_PATH]: entriesReply([], 0) });
    open();
    expect(
      await screen.findByText("No entries yet. They appear here as invoices, payments and bills are entered."),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Clear filters" })).toBeNull();
    expect(document.querySelector("svg.lucide-info")?.getAttribute("class")).toContain("text-cerulean");
  });

  it("shows a failed read with Try again, and reads again from it", async () => {
    let failing = true;
    mockApi({
      [FIRST_PAGE]: () => (failing ? { status: 500, body: { detail: "Nope" } } : { body: entriesReply([entry()]) }),
      [COUNT_PATH]: entriesReply([], 1),
    });
    open();
    expect(await screen.findByText("Couldn't load this.")).toBeTruthy();
    failing = false;
    await user().click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("article")).toBeTruthy();
  });

  it("keeps the list showing when a later read fails", async () => {
    let failing = false;
    mockApi({
      [FIRST_PAGE]: () => (failing ? { status: 500, body: { detail: "Nope" } } : { body: entriesReply([entry()]) }),
      [COUNT_PATH]: entriesReply([], 1),
    });
    const { client } = open();
    await screen.findByRole("article");
    failing = true;
    await act(() => client.invalidateQueries());
    expect(await screen.findByText("Couldn't refresh this, so it may be out of date.")).toBeTruthy();
    expect(screen.getByRole("article")).toBeTruthy();
  });
});

describe("paging the Journal", () => {
  function twoPages() {
    return mockApi({
      [FIRST_PAGE]: entriesReply(manyEntries(100, 150), 150),
      [`GET ${entriesPath({}, 100)}`]: entriesReply(manyEntries(50, 50), 150),
      [COUNT_PATH]: entriesReply([], 150),
    });
  }

  it("shows how many are showing, with a Load more button while more remain", async () => {
    twoPages();
    open();
    await screen.findAllByRole("article");
    expect(screen.getAllByRole("article")).toHaveLength(100);
    expect(screen.getByText("Showing 100 of 150 entries")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Load more" }).className).toContain("btn-secondary");
  });

  it("loads the next page from the button, once, and then has no button", async () => {
    const calls = twoPages();
    open();
    await screen.findAllByRole("article");
    await user().click(screen.getByRole("button", { name: "Load more" }));
    await waitFor(() => expect(screen.getAllByRole("article")).toHaveLength(150));
    expect(screen.getByText("Showing 150 of 150 entries")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
    const reads = calls.map((call) => call.path).filter((path) => path.startsWith("/books/entries?limit=100"));
    expect(reads.sort()).toEqual([entriesPath(), entriesPath({}, 100)].sort());
  });

  it("loads the next page when the end scrolls into view, and no page twice", async () => {
    const calls = twoPages();
    open();
    await screen.findAllByRole("article");
    act(() => FakeObserver.see());
    await waitFor(() => expect(screen.getAllByRole("article")).toHaveLength(150));
    act(() => FakeObserver.see());
    const second = calls.filter((call) => call.path === entriesPath({}, 100));
    expect(second).toHaveLength(1);
  });

  it("starts again from the top when a filter changes", async () => {
    twoPages();
    mockApi({
      [FIRST_PAGE]: entriesReply(manyEntries(100, 150), 150),
      [`GET ${entriesPath({}, 100)}`]: entriesReply(manyEntries(50, 50), 150),
      [`GET ${entriesPath({ account: "cash" })}`]: entriesReply([entry({ description: "Only cash" })]),
      [COUNT_PATH]: entriesReply([], 150),
    });
    open();
    await screen.findAllByRole("article");
    await user().click(screen.getByRole("button", { name: "Load more" }));
    await waitFor(() => expect(screen.getAllByRole("article")).toHaveLength(150));

    await user().selectOptions(screen.getByRole("combobox", { name: "Account" }), "cash");

    await waitFor(() => expect(screen.getAllByRole("article")).toHaveLength(1));
    expect(screen.getByText("Only cash", { selector: "span" })).toBeTruthy();
  });
});
