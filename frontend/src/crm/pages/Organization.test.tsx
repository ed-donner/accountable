import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { describe, expect, it } from "vitest";

import { queryDefaults } from "../../lib/queryDefaults";
import { META, mockApi, user } from "../../test-utils";
import type { OrganizationDetail, TimelineEntry } from "../queries";
import { Organization } from "./Organization";

const ALEX = { id: "alex", name: "Alex Rivera" };
const DANA = { id: "dana", name: "Dana Whitfield" };
const ADDED = "2026-10-12T12:00:00Z";
const CHANGED = "2026-10-30T12:00:00Z";

const HARBOR: OrganizationDetail = {
  id: 1,
  name: "Harbor & Pine",
  website: "https://harbor.example",
  industry: "Logistics",
  notes: "Prefers calls\nafter lunch",
  contacts: [
    { id: 11, name: "Sam Carter", job_title: "Head of Operations", status: "customer" },
    { id: 12, name: "Ana Lima", job_title: null, status: "lead" },
  ],
  deals: [{ id: 5, name: "Annual support", stage: "negotiation", value: 36000, close_date: "2026-12-18" }],
  created_at: ADDED,
  created_by: ALEX,
  updated_at: ADDED,
  updated_by: ALEX,
};

const BLANK: OrganizationDetail = {
  ...HARBOR,
  website: null,
  industry: null,
  notes: null,
  contacts: [],
  deals: [],
};

const STAGE_CHANGE: TimelineEntry = {
  kind: "stage_change",
  id: 3,
  at: "2026-10-30T15:20:00Z",
  type: null,
  description: "Moved from Proposal to Negotiation",
  follow_up_date: null,
  follow_up_done: false,
  about: { kind: "deal", id: 5, name: "Annual support" },
  created_by: DANA,
};

const TIMELINE = "GET /organizations/1/timeline?limit=50&offset=0";
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
          <Route path="/organizations/:id" element={<Organization />} />
          <Route path="*" element={<Address />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return client;
}

async function showHarbor(organization = HARBOR, routes: Record<string, unknown> = {}) {
  const calls = mockApi({
    "GET /organizations/1": organization,
    [TIMELINE]: { entries: [], total: 0 },
    ...routes,
  });
  const client = show("/organizations/1");
  await screen.findByRole("heading", { level: 1, name: organization.name });
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

describe("an organization's page", () => {
  it("names the organization", async () => {
    await showHarbor();
    expect(document.title).toBe("Harbor & Pine | Accountable");
  });

  it("shows its details and notes, with the website opening in a new tab", async () => {
    await showHarbor();
    const details = panel("Details");
    const website = details.getByRole("link", { name: "harbor.example" });
    expect(website.getAttribute("href")).toBe("https://harbor.example");
    expect(website.getAttribute("target")).toBe("_blank");
    expect(details.getByText("Logistics")).toBeTruthy();
    expect(details.getByText(/Prefers calls\s+after lunch/)).toBeTruthy();
  });

  it("shows None for details that are blank, and no notes", async () => {
    await showHarbor(BLANK);
    const details = panel("Details");
    expect(details.getAllByText("None")).toHaveLength(2);
    expect(details.queryByText(/Prefers calls/)).toBeNull();
  });

  it("lists its contacts with their job titles and status", async () => {
    await showHarbor();
    const contacts = panel("Contacts");
    expect(contacts.getByRole("link", { name: "Sam Carter" }).getAttribute("href")).toBe("/contacts/11");
    expect(contacts.getByText("Head of Operations")).toBeTruthy();
    expect(contacts.getByText("Customer")).toBeTruthy();
    expect(contacts.getByRole("link", { name: "Ana Lima" }).getAttribute("href")).toBe("/contacts/12");
    expect(contacts.getByText("Lead")).toBeTruthy();
  });

  it("lists its deals with value and stage", async () => {
    await showHarbor();
    const deals = panel("Deals");
    expect(deals.getByRole("link", { name: "Annual support" }).getAttribute("href")).toBe("/deals/5");
    expect(deals.getByText("$36,000")).toBeTruthy();
    expect(deals.getByText("Negotiation")).toBeTruthy();
  });

  it("says when it has no contacts or deals yet", async () => {
    await showHarbor(BLANK);
    expect(panel("Contacts").getByText("No contacts yet.")).toBeTruthy();
    expect(panel("Deals").getByText("No deals yet.")).toBeTruthy();
  });

  it("shows the combined timeline, which has nothing to log against directly", async () => {
    await showHarbor(HARBOR, { [TIMELINE]: { entries: [STAGE_CHANGE], total: 1 } });
    const timeline = panel("Timeline");
    expect(await timeline.findByText("Moved from Proposal to Negotiation")).toBeTruthy();
    expect(timeline.queryByRole("button", { name: "Log activity" })).toBeNull();
  });

  it("says when nothing has happened yet", async () => {
    await showHarbor();
    expect(await panel("Timeline").findByText("Nothing has happened here yet.")).toBeTruthy();
  });
});

describe("who added and changed an organization", () => {
  it("says who added it and when, and leaves out the last change while nobody has changed it", async () => {
    await showHarbor();
    expect(whoLines()).toEqual(["Added by Alex Rivera on Oct 12, 2026"]);
  });

  it("says who last changed it and when", async () => {
    await showHarbor({ ...HARBOR, updated_at: CHANGED, updated_by: DANA });
    expect(whoLines()).toEqual([
      "Added by Alex Rivera on Oct 12, 2026",
      "Last changed by Dana Whitfield on Oct 30, 2026",
    ]);
  });

  it("shows the dates alone when no one is recorded", async () => {
    await showHarbor({ ...HARBOR, created_by: null, updated_at: CHANGED, updated_by: null });
    expect(whoLines()).toEqual(["Added Oct 12, 2026", "Last changed Oct 30, 2026"]);
  });

  it("doesn't count times a moment apart on a record from before sign-in as a change", async () => {
    await showHarbor({
      ...HARBOR,
      created_at: "2026-10-12T12:00:00.000001Z",
      created_by: null,
      updated_at: "2026-10-12T12:00:00.000004Z",
      updated_by: null,
    });
    expect(whoLines()).toEqual(["Added Oct 12, 2026"]);
  });

  it("counts a change made straight after adding", async () => {
    await showHarbor({ ...HARBOR, updated_at: "2026-10-12T12:00:00.300000Z", updated_by: DANA });
    expect(whoLines()).toEqual([
      "Added by Alex Rivera on Oct 12, 2026",
      "Last changed by Dana Whitfield on Oct 12, 2026",
    ]);
  });

  it("shows who moved a deal on the timeline", async () => {
    await showHarbor(HARBOR, { [TIMELINE]: { entries: [STAGE_CHANGE], total: 1 } });
    const entry = (await panel("Timeline").findByText("Moved from Proposal to Negotiation")).closest("li")!;
    expect(entry.textContent).toMatch(/Oct 30, \d+:20 [AP]M by Dana Whitfield/);
  });
});

describe("the buttons on an organization's page", () => {
  it("Edit opens the organization's form, filled in", async () => {
    await showHarbor();
    await user().click(screen.getByRole("button", { name: "Edit" }));
    const form = within(await screen.findByRole("dialog", { name: "Edit organization" }));
    expect((form.getByLabelText("Name") as HTMLInputElement).value).toBe("Harbor & Pine");
  });

  it("Add contact starts a contact at this organization", async () => {
    await showHarbor(HARBOR, FORM_READS);
    await user().click(screen.getByRole("button", { name: "Add contact" }));
    const form = within(await screen.findByRole("dialog", { name: "Add contact" }));
    expect(form.getByRole("combobox", { name: "Organization" }).textContent).toContain("Harbor & Pine");
  });

  it("Add deal starts a deal at this organization", async () => {
    await showHarbor(HARBOR, FORM_READS);
    await user().click(screen.getByRole("button", { name: "Add deal" }));
    const form = within(await screen.findByRole("dialog", { name: "Add deal" }));
    expect(form.getByRole("combobox", { name: "Organization" }).textContent).toContain("Harbor & Pine");
  });

  it("a form closes again on Cancel", async () => {
    await showHarbor();
    await user().click(screen.getByRole("button", { name: "Edit" }));
    await user().click(await screen.findByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("Delete asks first, then goes back to Organizations", async () => {
    const { calls } = await showHarbor(HARBOR, {
      "GET /organizations/1/delete-impact": { contacts: 2, deals: 1 },
      "DELETE /organizations/1": () => ({ status: 204, body: null }),
    });
    await user().click(screen.getByRole("button", { name: "Delete" }));
    const confirm = within(await screen.findByRole("alertdialog", { name: "Delete Harbor & Pine?" }));
    await confirm.findByText(/Its 2 contacts and 1 deal will stay/);
    await user().click(confirm.getByRole("button", { name: "Delete organization" }));

    expect((await screen.findByTestId("address")).textContent).toBe("/organizations");
    expect(calls.filter((call) => call.method === "DELETE").map((call) => call.path)).toEqual(["/organizations/1"]);
  });
});

describe("an organization that can't be shown", () => {
  it("says so when it no longer exists, with a link back to Organizations", async () => {
    mockApi({});
    show("/organizations/99");
    expect(await screen.findByRole("heading", { name: "This organization no longer exists" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Back to Organizations" }).getAttribute("href")).toBe("/organizations");
  });

  it("says so for an address that couldn't be an organization, without asking the backend", () => {
    const calls = mockApi({});
    show("/organizations/0");
    expect(screen.getByRole("heading", { name: "This organization no longer exists" })).toBeTruthy();
    expect(calls).toEqual([]);
  });

  it("says when it couldn't be loaded, and Try again loads it", async () => {
    let broken = true;
    mockApi({
      "GET /organizations/1": () => (broken ? FAILED : { body: HARBOR }),
      [TIMELINE]: { entries: [], total: 0 },
    });
    show("/organizations/1");
    expect((await screen.findByRole("alert")).textContent).toContain("Couldn't load this.");

    broken = false;
    await user().click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Harbor & Pine" })).toBeTruthy();
  });

  it("keeps showing the organization when a refresh fails, and Try again reads it again", async () => {
    let broken = false;
    const { client } = await showHarbor(HARBOR, {
      "GET /organizations/1": () => (broken ? FAILED : { body: HARBOR }),
    });

    broken = true;
    await act(() => client.invalidateQueries({ queryKey: ["organizations", 1], exact: true }));
    expect((await screen.findByRole("alert")).textContent).toContain("Couldn't refresh this");
    expect(screen.getByRole("heading", { level: 1, name: "Harbor & Pine" })).toBeTruthy();

    broken = false;
    await user().click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(screen.getByRole("heading", { level: 1, name: "Harbor & Pine" })).toBeTruthy();
  });
});
