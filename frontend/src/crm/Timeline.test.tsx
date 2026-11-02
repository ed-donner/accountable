import { act, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { mockApi, renderApp, user } from "../test-utils";
import type { Timeline as TimelineReply, TimelineEntry } from "./queries";
import { Timeline } from "./Timeline";

function activity(id: number, extra: Partial<TimelineEntry> = {}): TimelineEntry {
  return {
    kind: "activity",
    id,
    at: "2026-10-30T15:20:00Z",
    type: "call",
    description: `Activity ${id}`,
    follow_up_date: null,
    follow_up_done: false,
    about: { kind: "deal", id: 7, name: "Annual support" },
    ...extra,
  };
}

const STAGE_CHANGE: TimelineEntry = {
  kind: "stage_change",
  id: 3,
  at: "2026-10-30T15:20:00Z",
  type: null,
  description: "Moved from Proposal to Negotiation",
  follow_up_date: null,
  follow_up_done: false,
  about: { kind: "deal", id: 7, name: "Annual support" },
};

function entriesFrom(first: number, count: number): TimelineEntry[] {
  return Array.from({ length: count }, (_, index) => activity(first + index));
}

function reply(entries: TimelineEntry[], total = entries.length): TimelineReply {
  return { entries, total };
}

function show(routes: Record<string, unknown>) {
  const calls = mockApi(routes);
  renderApp(<Timeline kind="deals" id={7} logTo={{ deal_id: 7 }} empty="Nothing logged yet." />);
  return calls;
}

const FIRST_PAGE = "GET /deals/7/timeline?limit=50&offset=0";

async function entryNamed(text: string) {
  const description = await screen.findByText(text);
  return description.closest("li")!;
}

describe("an entry", () => {
  it("shows its type, time, description and link", async () => {
    show({ [FIRST_PAGE]: reply([activity(1)]) });
    const entry = within(await entryNamed("Activity 1"));
    expect(entry.getByText("Call")).toBeTruthy();
    expect(entry.getByText(/Oct 30, \d+:20 [AP]M/)).toBeTruthy();
    expect(entry.getByRole("link", { name: "Annual support" }).getAttribute("href")).toBe("/deals/7");
  });

  it("links an activity on a contact to the contact", async () => {
    show({ [FIRST_PAGE]: reply([activity(1, { about: { kind: "contact", id: 4, name: "Sam Carter" } })]) });
    const entry = within(await entryNamed("Activity 1"));
    expect(entry.getByRole("link", { name: "Sam Carter" }).getAttribute("href")).toBe("/contacts/4");
  });

  it("shows any follow-up", async () => {
    show({ [FIRST_PAGE]: reply([activity(1, { follow_up_date: "2999-01-02" })]) });
    const entry = within(await entryNamed("Activity 1"));
    expect(entry.getByText("Follow up")).toBeTruthy();
    expect(entry.getByText("Jan 2, 2999")).toBeTruthy();
  });

  it("marks a done follow-up as done", async () => {
    show({ [FIRST_PAGE]: reply([activity(1, { follow_up_date: "2026-01-02", follow_up_done: true })]) });
    const entry = within(await entryNamed("Activity 1"));
    expect(entry.getByText("Done")).toBeTruthy();
    expect((entry.getByRole("checkbox") as HTMLInputElement).checked).toBe(true);
    expect(entry.queryByText("Overdue")).toBeNull();
  });

  it("marks a follow-up past its date as overdue", async () => {
    show({ [FIRST_PAGE]: reply([activity(1, { follow_up_date: "2020-01-02" })]) });
    expect(within(await entryNamed("Activity 1")).getByText("Overdue")).toBeTruthy();
  });

  it("has Edit and Delete on an activity", async () => {
    show({ [FIRST_PAGE]: reply([activity(1)]) });
    const entry = within(await entryNamed("Activity 1"));
    expect(entry.getByRole("button", { name: "Edit Activity 1" })).toBeTruthy();
    expect(entry.getByRole("button", { name: "Delete Activity 1" })).toBeTruthy();
  });

  it("has no Edit or Delete on a stage change", async () => {
    show({ [FIRST_PAGE]: reply([STAGE_CHANGE]) });
    const entry = within(await entryNamed("Moved from Proposal to Negotiation"));
    expect(entry.getByText("Stage change")).toBeTruthy();
    expect(entry.queryByRole("button")).toBeNull();
  });
});

describe("the timeline", () => {
  it("says when it's empty", async () => {
    show({ [FIRST_PAGE]: reply([]) });
    expect(await screen.findByText("Nothing logged yet.")).toBeTruthy();
  });

  it("has no Show more when everything is showing", async () => {
    show({ [FIRST_PAGE]: reply([activity(1)]) });
    await entryNamed("Activity 1");
    expect(screen.queryByRole("button", { name: "Show more" })).toBeNull();
  });

  it("shows more after 50 entries", async () => {
    const calls = show({
      [FIRST_PAGE]: reply(entriesFrom(1, 50), 55),
      "GET /deals/7/timeline?limit=50&offset=50": reply(entriesFrom(51, 5), 55),
    });
    await entryNamed("Activity 50");
    await user().click(screen.getByRole("button", { name: "Show more" }));

    await entryNamed("Activity 55");
    expect(screen.getAllByTestId("timeline-entry")).toHaveLength(55);
    expect(screen.queryByRole("button", { name: "Show more" })).toBeNull();
    expect(calls.map((call) => call.path)).toContain("/deals/7/timeline?limit=50&offset=50");
  });

  it("only ever asks for one page at a time, so it stays within what the API allows", async () => {
    const calls = show({
      [FIRST_PAGE]: reply(entriesFrom(1, 50), 75),
      "GET /deals/7/timeline?limit=50&offset=50": reply(entriesFrom(51, 25), 75),
    });
    await entryNamed("Activity 50");
    await user().click(screen.getByRole("button", { name: "Show more" }));
    await entryNamed("Activity 75");
    const limits = calls.map((call) => Number(new URLSearchParams(call.path.split("?")[1]).get("limit")));
    expect(Math.max(...limits)).toBe(50);
  });

  it("can be read to the end however long it is", async () => {
    const total = 525;
    const routes: Record<string, TimelineReply> = {};
    for (let offset = 0; offset < total; offset += 50) {
      routes[`GET /deals/7/timeline?limit=50&offset=${offset}`] = reply(
        entriesFrom(offset + 1, Math.min(50, total - offset)),
        total,
      );
    }
    show(routes);
    await entryNamed("Activity 50");
    // Found once, because finding it by role among hundreds of entries takes a tenth of a second each time.
    const showMore = screen.getByRole("button", { name: "Show more" });
    for (let shown = 50; shown < total; shown += 50) {
      await user().click(showMore);
      await waitFor(() => expect(screen.getAllByTestId("timeline-entry").length).toBeGreaterThan(shown));
    }
    expect(screen.getAllByTestId("timeline-entry")).toHaveLength(total);
    expect(screen.queryByRole("button", { name: "Show more" })).toBeNull();
  });

  it("keeps what's showing if Show more fails, and can try again", async () => {
    let broken = true;
    show({
      [FIRST_PAGE]: reply(entriesFrom(1, 50), 55),
      "GET /deals/7/timeline?limit=50&offset=50": () =>
        broken ? { status: 500, body: { detail: "Something went wrong." } } : { body: reply(entriesFrom(51, 5), 55) },
    });
    await entryNamed("Activity 50");
    await user().click(screen.getByRole("button", { name: "Show more" }));

    expect(await screen.findByText("Couldn't load more.")).toBeTruthy();
    expect(screen.getAllByTestId("timeline-entry")).toHaveLength(50);

    broken = false;
    await user().click(screen.getByRole("button", { name: "Show more" }));
    await entryNamed("Activity 55");
    expect(screen.queryByText("Couldn't load more.")).toBeNull();
  });

  it("says so if it can't load, and can try again", async () => {
    let broken = true;
    show({
      [FIRST_PAGE]: () =>
        broken ? { status: 500, body: { detail: "Something went wrong." } } : { body: reply([activity(1)]) },
    });
    expect(await screen.findByText("Couldn't load this.")).toBeTruthy();
    expect(screen.queryByText("Nothing logged yet.")).toBeNull();

    broken = false;
    await user().click(screen.getByRole("button", { name: "Try again" }));
    await entryNamed("Activity 1");
    expect(screen.queryByText("Couldn't load this.")).toBeNull();
  });

  it("keeps what's showing if a later read fails, says so, and can try again", async () => {
    let broken = false;
    mockApi({
      [FIRST_PAGE]: () =>
        broken ? { status: 500, body: { detail: "Something went wrong." } } : { body: reply([activity(1)]) },
    });
    const { client } = renderApp(<Timeline kind="deals" id={7} logTo={{ deal_id: 7 }} empty="Nothing logged yet." />);
    await screen.findByText("Activity 1");

    broken = true;
    await act(() => client.refetchQueries());

    expect(await screen.findByText("Couldn't refresh this, so it may be out of date.")).toBeTruthy();
    expect(screen.getByText("Activity 1")).toBeTruthy();

    broken = false;
    await user().click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.queryByText("Couldn't refresh this, so it may be out of date.")).toBeNull());
    expect(screen.getByText("Activity 1")).toBeTruthy();
  });

  it("doesn't call a timeline empty while it's only failed to load", async () => {
    show({ [FIRST_PAGE]: () => ({ status: 500, body: { detail: "Something went wrong." } }) });
    await screen.findByText("Couldn't load this.");
    expect(screen.queryByText("Nothing logged yet.")).toBeNull();
  });

  it("names the activity in the delete dialog", async () => {
    show({ [FIRST_PAGE]: reply([activity(1, { description: "Called about the renewal" })]) });
    await entryNamed("Called about the renewal");
    await user().click(screen.getByRole("button", { name: "Delete Called about the renewal" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByRole("heading").textContent).toContain("Called about the renewal");
    expect(dialog.textContent).toContain("This can't be undone.");
  });

  it("ticks a follow-up on a later page", async () => {
    const later = activity(51, { follow_up_date: "2999-01-02" });
    const calls = show({
      [FIRST_PAGE]: reply(entriesFrom(1, 50), 51),
      "GET /deals/7/timeline?limit=50&offset=50": reply([later], 51),
      "PATCH /activities/51": later,
    });
    await entryNamed("Activity 50");
    await user().click(screen.getByRole("button", { name: "Show more" }));
    const entry = within(await entryNamed("Activity 51"));
    await user().click(entry.getByRole("checkbox"));
    await waitFor(() => expect(calls.some((call) => call.method === "PATCH")).toBe(true));
    expect(calls.find((call) => call.method === "PATCH")?.path).toBe("/activities/51");
  });

  it("ticks a follow-up straight away and saves it", async () => {
    let answer: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      answer = resolve;
    });
    const calls = mockApi({
      [FIRST_PAGE]: reply([activity(1, { follow_up_date: "2999-01-02" })]),
      "PATCH /activities/1": activity(1),
    });
    const fetched = globalThis.fetch;
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      if (init?.method === "PATCH") await held;
      return fetched(url, init);
    }) as typeof fetch;

    renderApp(<Timeline kind="deals" id={7} logTo={{ deal_id: 7 }} empty="" />);
    const entry = within(await entryNamed("Activity 1"));
    await user().click(entry.getByRole("checkbox"));

    expect(await entry.findByText("Done")).toBeTruthy();
    answer();
    await waitFor(() => expect(calls.some((call) => call.method === "PATCH")).toBe(true));
    expect(calls.find((call) => call.method === "PATCH")?.body).toEqual({ follow_up_done: true });
  });

  it("puts a tick back if the save fails", async () => {
    show({
      [FIRST_PAGE]: reply([activity(1, { follow_up_date: "2999-01-02" })]),
      "PATCH /activities/1": () => ({ status: 500, body: { detail: "Something went wrong." } }),
    });
    const entry = within(await entryNamed("Activity 1"));
    await user().click(entry.getByRole("checkbox"));
    await waitFor(() => expect((entry.getByRole("checkbox") as HTMLInputElement).checked).toBe(false));
  });
});

describe("a change made in another window while a timeline is open", () => {
  const SECOND_PAGE = "GET /deals/7/timeline?limit=50&offset=50";

  it("shows each entry once when an added entry pushes the next page along", async () => {
    let added = false;
    mockApi({
      [FIRST_PAGE]: () => ({ body: added ? reply(entriesFrom(0, 50), 61) : reply(entriesFrom(1, 50), 60) }),
      [SECOND_PAGE]: () => ({ body: reply(entriesFrom(50, 11), 61) }),
    });
    const logged = vi.spyOn(console, "error");
    renderApp(<Timeline kind="deals" id={7} logTo={{ deal_id: 7 }} empty="Nothing logged yet." />);
    await screen.findByText("Activity 1");

    added = true;
    await user().click(screen.getByRole("button", { name: "Show more" }));

    await screen.findByText("Activity 0");
    await screen.findByText("Activity 60");
    expect(screen.getAllByText("Activity 50")).toHaveLength(1);
    expect(screen.getAllByTestId("timeline-entry")).toHaveLength(61);
    expect(logged).not.toHaveBeenCalled();
  });

  it("doesn't miss an entry when a delete pulls the next page back", async () => {
    let removed = false;
    mockApi({
      [FIRST_PAGE]: () => ({ body: removed ? reply(entriesFrom(2, 50), 59) : reply(entriesFrom(1, 50), 60) }),
      [SECOND_PAGE]: () => ({ body: reply(entriesFrom(52, 9), 59) }),
    });
    renderApp(<Timeline kind="deals" id={7} logTo={{ deal_id: 7 }} empty="Nothing logged yet." />);
    await screen.findByText("Activity 1");

    removed = true;
    await user().click(screen.getByRole("button", { name: "Show more" }));

    await waitFor(() => expect(screen.queryByText("Activity 1")).toBeNull());
    expect(screen.getByText("Activity 51")).toBeTruthy();
    expect(screen.getAllByTestId("timeline-entry")).toHaveLength(59);
  });
});

describe("a timeline left open past midnight", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("marks a follow-up overdue once the day it was due has ended", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date(2026, 9, 31, 23, 59) });
    show({ [FIRST_PAGE]: reply([activity(1, { follow_up_date: "2026-10-31" })]) });
    await screen.findByText("Activity 1");
    expect(screen.queryByText("Overdue")).toBeNull();

    vi.setSystemTime(new Date(2026, 10, 1, 0, 1));
    act(() => {
      window.dispatchEvent(new Event("focus"));
    });

    expect(await screen.findByText("Overdue")).toBeTruthy();
  });
});
