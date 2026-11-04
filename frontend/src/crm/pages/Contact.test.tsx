import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { describe, expect, it } from "vitest";

import { queryDefaults } from "../../lib/queryDefaults";
import { META, mockApi, user } from "../../test-utils";
import type { ContactDetail, TimelineEntry } from "../queries";
import { Contact } from "./Contact";

const ALEX = { id: "alex", name: "Alex Rivera" };
const DANA = { id: "dana", name: "Dana Whitfield" };
const ADDED = "2026-10-12T12:00:00Z";
const CHANGED = "2026-10-30T12:00:00Z";

const SAM: ContactDetail = {
  id: 11,
  name: "Sam Carter",
  email: "sam@harbor.example",
  phone: "555-0101",
  job_title: "Head of Operations",
  organization_id: 1,
  organization_name: "Harbor & Pine",
  status: "qualified",
  deals: [{ id: 5, name: "Annual support", stage: "proposal", value: 36000, close_date: "2026-12-18" }],
  created_at: ADDED,
  created_by: ALEX,
  updated_at: CHANGED,
  updated_by: DANA,
};

const BLANK: ContactDetail = {
  ...SAM,
  email: null,
  phone: null,
  job_title: null,
  organization_id: null,
  organization_name: null,
  deals: [],
};

const CALL: TimelineEntry = {
  kind: "activity",
  id: 9,
  at: "2026-10-30T15:20:00Z",
  type: "call",
  description: "Talked through the renewal",
  follow_up_date: null,
  follow_up_done: false,
  about: { kind: "contact", id: 11, name: "Sam Carter" },
  created_by: ALEX,
};

const TIMELINE = "GET /contacts/11/timeline?limit=50&offset=0";
const FAILED = { status: 500, body: { detail: "Something went wrong." } };
const FORM_READS = {
  "GET /meta": META,
  "GET /organizations": [{ id: 1, name: "Harbor & Pine" }],
  "GET /contacts": [{ id: 11, name: "Sam Carter", organization_id: 1, organization_name: "Harbor & Pine" }],
};

function Address() {
  return <output data-testid="address">{useLocation().pathname}</output>;
}

function show(address: string) {
  const client = new QueryClient({ defaultOptions: queryDefaults });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[address]}>
        <Routes>
          <Route path="/contacts/:id" element={<Contact />} />
          <Route path="*" element={<Address />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return client;
}

async function showSam(contact = SAM, routes: Record<string, unknown> = {}) {
  const calls = mockApi({ "GET /contacts/11": contact, [TIMELINE]: { entries: [], total: 0 }, ...routes });
  const client = show("/contacts/11");
  await screen.findByRole("heading", { level: 1, name: contact.name });
  return { calls, client };
}

function panel(name: string) {
  return within(screen.getByRole("region", { name }));
}

/** The lines at the foot of the details panel saying who added and changed the record. */
function whoLines() {
  return panel("Details")
    .queryAllByText(/^(Added|Last changed)\b/)
    .map((line) => line.textContent);
}

describe("a contact's page", () => {
  it("names the contact and shows their status", async () => {
    await showSam();
    expect(document.title).toBe("Sam Carter | Accountable");
    expect(screen.getByText("Qualified")).toBeTruthy();
  });

  it("shows their details, linking to their organization and email", async () => {
    await showSam();
    const details = panel("Details");
    expect(details.getByRole("link", { name: "Harbor & Pine" }).getAttribute("href")).toBe("/organizations/1");
    expect(details.getByRole("link", { name: "sam@harbor.example" }).getAttribute("href")).toBe(
      "mailto:sam@harbor.example",
    );
    expect(details.getByText("Head of Operations")).toBeTruthy();
    expect(details.getByText("555-0101")).toBeTruthy();
  });

  it("shows None for details that are blank", async () => {
    await showSam(BLANK);
    const details = panel("Details");
    expect(details.getAllByText("None")).toHaveLength(4);
    expect(details.queryByRole("link")).toBeNull();
  });

  it("lists the deals where they're the main contact, with value and stage", async () => {
    await showSam();
    const deals = panel("Deals");
    expect(deals.getByRole("link", { name: "Annual support" }).getAttribute("href")).toBe("/deals/5");
    expect(deals.getByText("$36,000")).toBeTruthy();
    expect(deals.getByText("Proposal")).toBeTruthy();
  });

  it("says when they have no deals yet", async () => {
    await showSam(BLANK);
    expect(panel("Deals").getByText("No deals yet.")).toBeTruthy();
  });

  it("shows their timeline, where activities can be logged", async () => {
    await showSam(SAM, { [TIMELINE]: { entries: [CALL], total: 1 } });
    const timeline = panel("Timeline");
    expect(await timeline.findByText("Talked through the renewal")).toBeTruthy();
    expect(timeline.getByRole("button", { name: "Log activity" })).toBeTruthy();
  });

  it("says when nothing has been logged yet", async () => {
    await showSam();
    expect(await panel("Timeline").findByText("Nothing logged yet.")).toBeTruthy();
  });
});

describe("who added and changed a contact", () => {
  it("says who added them and who last changed them, and when", async () => {
    await showSam();
    expect(whoLines()).toEqual([
      "Added by Alex Rivera on Oct 12, 2026",
      "Last changed by Dana Whitfield on Oct 30, 2026",
    ]);
  });

  it("shows the date alone for a contact from before sign-in that nobody has changed", async () => {
    await showSam({ ...SAM, created_by: null, updated_at: ADDED, updated_by: null });
    expect(whoLines()).toEqual(["Added Oct 12, 2026"]);
  });

  it("shows who logged an activity on the timeline", async () => {
    await showSam(SAM, { [TIMELINE]: { entries: [CALL], total: 1 } });
    const entry = (await panel("Timeline").findByText("Talked through the renewal")).closest("li")!;
    expect(entry.textContent).toMatch(/Oct 30, \d+:20 [AP]M by Alex Rivera/);
  });
});

describe("the buttons on a contact's page", () => {
  it("Edit opens the contact's form, filled in", async () => {
    await showSam(SAM, FORM_READS);
    await user().click(screen.getByRole("button", { name: "Edit" }));
    const form = within(await screen.findByRole("dialog", { name: "Edit contact" }));
    expect((form.getByLabelText("Name") as HTMLInputElement).value).toBe("Sam Carter");
  });

  it("Add deal starts a deal with this contact and their organization", async () => {
    await showSam(SAM, FORM_READS);
    await user().click(screen.getByRole("button", { name: "Add deal" }));
    const form = within(await screen.findByRole("dialog", { name: "Add deal" }));
    expect(form.getByRole("combobox", { name: "Main contact" }).textContent).toContain("Sam Carter");
    expect(form.getByRole("combobox", { name: "Organization" }).textContent).toContain("Harbor & Pine");
  });

  it("a form closes again on Cancel", async () => {
    await showSam(SAM, FORM_READS);
    await user().click(screen.getByRole("button", { name: "Edit" }));
    await user().click(await screen.findByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("Delete asks first, then goes back to Contacts", async () => {
    const { calls } = await showSam(SAM, {
      "GET /contacts/11/delete-impact": { deals: 1, activities: 2 },
      "DELETE /contacts/11": () => ({ status: 204, body: null }),
    });
    await user().click(screen.getByRole("button", { name: "Delete" }));
    const confirm = within(await screen.findByRole("alertdialog", { name: "Delete Sam Carter?" }));
    await confirm.findByText(/2 activities logged on this contact will be deleted/);
    await user().click(confirm.getByRole("button", { name: "Delete contact" }));

    expect((await screen.findByTestId("address")).textContent).toBe("/contacts");
    expect(calls.filter((call) => call.method === "DELETE").map((call) => call.path)).toEqual(["/contacts/11"]);
  });
});

describe("a contact that can't be shown", () => {
  it("says so when it no longer exists, with a link back to Contacts", async () => {
    mockApi({});
    show("/contacts/99");
    expect(await screen.findByRole("heading", { name: "This contact no longer exists" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Back to Contacts" }).getAttribute("href")).toBe("/contacts");
  });

  it("says so for an address that couldn't be a contact, without asking the backend", () => {
    const calls = mockApi({});
    show("/contacts/abc");
    expect(screen.getByRole("heading", { name: "This contact no longer exists" })).toBeTruthy();
    expect(calls).toEqual([]);
  });

  it("says when it couldn't be loaded, and Try again loads it", async () => {
    let broken = true;
    mockApi({ "GET /contacts/11": () => (broken ? FAILED : { body: SAM }), [TIMELINE]: { entries: [], total: 0 } });
    show("/contacts/11");
    expect((await screen.findByRole("alert")).textContent).toContain("Couldn't load this.");

    broken = false;
    await user().click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Sam Carter" })).toBeTruthy();
  });

  it("keeps showing the contact when a refresh fails, and Try again reads it again", async () => {
    let broken = false;
    const { client } = await showSam(SAM, { "GET /contacts/11": () => (broken ? FAILED : { body: SAM }) });

    broken = true;
    await act(() => client.invalidateQueries({ queryKey: ["contacts", 11], exact: true }));
    expect((await screen.findByRole("alert")).textContent).toContain("Couldn't refresh this");
    expect(screen.getByRole("heading", { level: 1, name: "Sam Carter" })).toBeTruthy();

    broken = false;
    await user().click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(screen.getByRole("heading", { level: 1, name: "Sam Carter" })).toBeTruthy();
  });
});
