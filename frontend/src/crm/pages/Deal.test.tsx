import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { describe, expect, it } from "vitest";

import { queryDefaults } from "../../lib/queryDefaults";
import { META, mockApi, user } from "../../test-utils";
import type { DealDetail, TimelineEntry } from "../queries";
import { Deal } from "./Deal";

const ALEX = { id: "alex", name: "Alex Rivera" };
const DANA = { id: "dana", name: "Dana Whitfield" };
const ADDED = "2026-10-12T12:00:00Z";
const CHANGED = "2026-10-30T12:00:00Z";

const SUPPORT: DealDetail = {
  id: 5,
  name: "Annual support",
  organization_id: 1,
  organization_name: "Harbor & Pine",
  main_contact_id: 11,
  main_contact_name: "Sam Carter",
  stage: "proposal",
  value: 36000,
  probability: 40,
  expected_revenue: 14400,
  close_date: "2999-12-18",
  position: 0,
  created_at: ADDED,
  created_by: ALEX,
  updated_at: CHANGED,
  updated_by: DANA,
};

const EMAIL: TimelineEntry = {
  kind: "activity",
  id: 9,
  at: "2026-10-30T15:20:00Z",
  type: "email",
  description: "Sent the proposal",
  follow_up_date: null,
  follow_up_done: false,
  about: { kind: "deal", id: 5, name: "Annual support" },
  created_by: null,
};

const TIMELINE = "GET /deals/5/timeline?limit=50&offset=0";
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
          <Route path="/deals/:id" element={<Deal />} />
          <Route path="*" element={<Address />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return client;
}

async function showSupport(deal: Partial<DealDetail> = {}, routes: Record<string, unknown> = {}) {
  const calls = mockApi({ "GET /deals/5": { ...SUPPORT, ...deal }, [TIMELINE]: { entries: [], total: 0 }, ...routes });
  const client = show("/deals/5");
  await screen.findByRole("heading", { level: 1, name: "Annual support" });
  return { calls, client };
}

function details() {
  return within(screen.getByRole("region", { name: "Details" }));
}

/** The lines at the foot of the details panel saying who added and changed the record. */
function whoLines() {
  return details()
    .queryAllByText(/^(Added|Last changed)\b/)
    .map((line) => line.textContent);
}

/** What the details panel shows beside a label. */
function detail(label: string) {
  return details().getByText(label).nextElementSibling?.textContent;
}

describe("a deal's page", () => {
  it("names the deal and shows its stage", async () => {
    await showSupport();
    expect(document.title).toBe("Annual support | Accountable");
    expect(screen.getByText("Proposal")).toBeTruthy();
  });

  it("shows its figures and close date", async () => {
    await showSupport();
    expect(detail("Value")).toBe("$36,000");
    expect(detail("Probability")).toBe("40%");
    expect(detail("Expected revenue")).toBe("$14,400");
    expect(detail("Close date")).toBe("Dec 18, 2999");
  });

  it("links to its organization and main contact", async () => {
    await showSupport();
    expect(details().getByRole("link", { name: "Harbor & Pine" }).getAttribute("href")).toBe("/organizations/1");
    expect(details().getByRole("link", { name: "Sam Carter" }).getAttribute("href")).toBe("/contacts/11");
  });

  it("shows None for a blank organization and main contact", async () => {
    await showSupport({
      organization_id: null,
      organization_name: null,
      main_contact_id: null,
      main_contact_name: null,
    });
    expect(detail("Organization")).toBe("None");
    expect(detail("Main contact")).toBe("None");
  });

  it("marks an open deal past its close date as late", async () => {
    await showSupport({ close_date: "2020-01-02" });
    expect(screen.getByText("Late")).toBeTruthy();
  });

  it("doesn't mark an open deal late before its close date", async () => {
    await showSupport();
    expect(screen.queryByText("Late")).toBeNull();
  });

  it("leaves expected revenue out, and doesn't call it late, once the deal is closed", async () => {
    await showSupport({ stage: "won", probability: 100, close_date: "2020-01-02" });
    expect(screen.getByText("Won")).toBeTruthy();
    expect(details().queryByText("Expected revenue")).toBeNull();
    expect(screen.queryByText("Late")).toBeNull();
  });

  it("shows its timeline, where activities can be logged", async () => {
    await showSupport({}, { [TIMELINE]: { entries: [EMAIL], total: 1 } });
    const timeline = within(screen.getByRole("region", { name: "Timeline" }));
    expect(await timeline.findByText("Sent the proposal")).toBeTruthy();
    expect(timeline.getByRole("button", { name: "Log activity" })).toBeTruthy();
  });
});

describe("who added and changed a deal", () => {
  it("says who added it and who last changed it, and when", async () => {
    await showSupport();
    expect(whoLines()).toEqual([
      "Added by Alex Rivera on Oct 12, 2026",
      "Last changed by Dana Whitfield on Oct 30, 2026",
    ]);
  });

  it("shows the name of whoever changed a deal from before sign-in, which the email stands in for if they have none", async () => {
    await showSupport({ created_by: null, updated_by: { id: "robin", name: "robin@accountable.example" } });
    expect(whoLines()).toEqual(["Added Oct 12, 2026", "Last changed by robin@accountable.example on Oct 30, 2026"]);
  });

  it("shows the time alone on a timeline entry with no one recorded", async () => {
    await showSupport({}, { [TIMELINE]: { entries: [EMAIL], total: 1 } });
    const entry = (await screen.findByText("Sent the proposal")).closest("li")!;
    expect(entry.textContent).toMatch(/Oct 30, \d+:20 [AP]M/);
    expect(entry.textContent).not.toContain(" by ");
  });
});

describe("the buttons on a deal's page", () => {
  it("Edit opens the deal's form, filled in", async () => {
    await showSupport({}, FORM_READS);
    await user().click(screen.getByRole("button", { name: "Edit" }));
    const form = within(await screen.findByRole("dialog", { name: "Edit deal" }));
    expect((form.getByLabelText("Name") as HTMLInputElement).value).toBe("Annual support");
  });

  it("a form closes again on Cancel", async () => {
    await showSupport({}, FORM_READS);
    await user().click(screen.getByRole("button", { name: "Edit" }));
    await user().click(await screen.findByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("Delete asks first, then goes back to Deals", async () => {
    const { calls } = await showSupport(
      {},
      {
        "GET /deals/5/delete-impact": { activities: 1, stage_changes: 2, won: false, value: 36000 },
        "DELETE /deals/5": () => ({ status: 204, body: null }),
      },
    );
    await user().click(screen.getByRole("button", { name: "Delete" }));
    const confirm = within(await screen.findByRole("alertdialog", { name: "Delete Annual support?" }));
    await confirm.findByText(/Its 1 activity and 2 stage-change entries will be deleted/);
    await user().click(confirm.getByRole("button", { name: "Delete deal" }));

    expect((await screen.findByTestId("address")).textContent).toBe("/deals");
    expect(calls.filter((call) => call.method === "DELETE").map((call) => call.path)).toEqual(["/deals/5"]);
  });
});

describe("a deal that can't be shown", () => {
  it("says so when it no longer exists, with a link back to Deals", async () => {
    mockApi({});
    show("/deals/99");
    expect(await screen.findByRole("heading", { name: "This deal no longer exists" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Back to Deals" }).getAttribute("href")).toBe("/deals");
  });

  it("says so for an address that couldn't be a deal, without asking the backend", () => {
    const calls = mockApi({});
    show("/deals/5.5");
    expect(screen.getByRole("heading", { name: "This deal no longer exists" })).toBeTruthy();
    expect(calls).toEqual([]);
  });

  it("says when it couldn't be loaded, and Try again loads it", async () => {
    let broken = true;
    mockApi({ "GET /deals/5": () => (broken ? FAILED : { body: SUPPORT }), [TIMELINE]: { entries: [], total: 0 } });
    show("/deals/5");
    expect((await screen.findByRole("alert")).textContent).toContain("Couldn't load this.");

    broken = false;
    await user().click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Annual support" })).toBeTruthy();
  });

  it("keeps showing the deal when a refresh fails, and Try again reads it again", async () => {
    let broken = false;
    const { client } = await showSupport({}, { "GET /deals/5": () => (broken ? FAILED : { body: SUPPORT }) });

    broken = true;
    await act(() => client.invalidateQueries({ queryKey: ["deals", 5], exact: true }));
    expect((await screen.findByRole("alert")).textContent).toContain("Couldn't refresh this");
    expect(screen.getByRole("heading", { level: 1, name: "Annual support" })).toBeTruthy();

    broken = false;
    await user().click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(screen.getByRole("heading", { level: 1, name: "Annual support" })).toBeTruthy();
  });
});
