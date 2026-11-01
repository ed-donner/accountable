import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

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
    const page = Array.from({ length: 50 }, (_, index) => activity(index + 1));
    const calls = show({
      [FIRST_PAGE]: reply(page, 55),
      "GET /deals/7/timeline?limit=100&offset=0": reply([...page, ...[51, 52, 53, 54, 55].map((id) => activity(id))], 55),
    });
    await entryNamed("Activity 50");
    await user().click(screen.getByRole("button", { name: "Show more" }));

    await entryNamed("Activity 55");
    expect(screen.getAllByTestId("timeline-entry")).toHaveLength(55);
    expect(screen.queryByRole("button", { name: "Show more" })).toBeNull();
    expect(calls.map((call) => call.path)).toContain("/deals/7/timeline?limit=100&offset=0");
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
