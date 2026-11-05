import { screen, waitFor, within } from "@testing-library/react";
import { useLocation } from "react-router";
import { describe, expect, it } from "vitest";

import { mockApi, renderApp, user } from "../../test-utils";
import type { OrganizationRow } from "../queries";
import { Organizations } from "./Organizations";

function organization(id: number, name: string, extra: Partial<OrganizationRow> = {}): OrganizationRow {
  return {
    id,
    name,
    website: null,
    industry: null,
    notes: null,
    contact_count: 0,
    open_deal_count: 0,
    open_value: 0,
    last_activity: null,
    ...extra,
  };
}

const HARBOR = organization(1, "Harbor & Pine", {
  website: "https://harbor.example",
  industry: "Logistics",
  contact_count: 3,
  open_deal_count: 2,
  open_value: 48500,
  last_activity: "2026-10-30",
});
const ACME = organization(2, "Acme", { industry: "Manufacturing", open_value: 1200 });
const ORGANIZATIONS = [HARBOR, ACME];

const FAILED = { status: 500, body: { detail: "Something went wrong." } };

function Address() {
  const location = useLocation();
  return <output data-testid="address">{location.pathname + location.search}</output>;
}

async function showOrganizations(rows: OrganizationRow[] = ORGANIZATIONS, routes: Record<string, unknown> = {}) {
  const calls = mockApi({ "GET /organizations": rows, ...routes });
  renderApp(
    <>
      <Organizations />
      <Address />
    </>,
  );
  await screen.findByRole("heading", { level: 1, name: "Organizations" });
  return calls;
}

function names() {
  return screen
    .getAllByRole("row")
    .slice(1)
    .map((row) => within(row).getAllByRole("cell")[0].textContent);
}

async function rowOf(name: string) {
  return within(await screen.findByRole("row", { name: new RegExp(name) }));
}

describe("the organizations table", () => {
  it("lists organizations by name, each linking to its page", async () => {
    await showOrganizations();
    expect(await screen.findByRole("link", { name: "Harbor & Pine" })).toBeTruthy();
    expect(document.title).toBe("Organizations | Accountable");
    expect(names()).toEqual(["Acme", "Harbor & Pine"]);
    expect(screen.getByRole("link", { name: "Harbor & Pine" }).getAttribute("href")).toBe("/organizations/1");
  });

  it("shows each organization's industry, counts, open value and last activity", async () => {
    await showOrganizations();
    const harbor = await rowOf("Harbor & Pine");
    expect(harbor.getByText("Logistics")).toBeTruthy();
    expect(harbor.getByText("3")).toBeTruthy();
    expect(harbor.getByText("2")).toBeTruthy();
    expect(harbor.getByText("$48,500")).toBeTruthy();
    expect(harbor.getByText("Oct 30, 2026")).toBeTruthy();
  });

  it("links to the website without its scheme, in a new tab", async () => {
    await showOrganizations();
    const harbor = await rowOf("Harbor & Pine");
    const website = harbor.getByRole("link", { name: "harbor.example" });
    expect(website.getAttribute("href")).toBe("https://harbor.example");
    expect(website.getAttribute("target")).toBe("_blank");
  });

  it("opens the website, not the organization, when the website is clicked", async () => {
    await showOrganizations();
    const harbor = await rowOf("Harbor & Pine");
    await user().click(harbor.getByRole("link", { name: "harbor.example" }));
    expect(screen.getByTestId("address").textContent).toBe("/");
  });

  it("opens the organization when the rest of its row is clicked", async () => {
    await showOrganizations();
    const harbor = await rowOf("Harbor & Pine");
    await user().click(harbor.getByText("Logistics"));
    expect(screen.getByTestId("address").textContent).toBe("/organizations/1");
  });

  it("sorts by open value", async () => {
    await showOrganizations();
    await user().click(await screen.findByRole("button", { name: "Open value" }));
    expect(names()).toEqual(["Acme", "Harbor & Pine"]);
    await user().click(screen.getByRole("button", { name: "Open value" }));
    expect(names()).toEqual(["Harbor & Pine", "Acme"]);
  });

  it("finds organizations by industry", async () => {
    await showOrganizations();
    await user().type(await screen.findByRole("searchbox"), "manufact");
    expect(names()).toEqual(["Acme"]);
  });
});

describe("adding, editing and deleting from the organizations table", () => {
  it("Add organization opens an empty form", async () => {
    await showOrganizations();
    await user().click(screen.getByRole("button", { name: "Add organization" }));
    const form = within(await screen.findByRole("dialog", { name: "Add organization" }));
    expect((form.getByLabelText("Name") as HTMLInputElement).value).toBe("");
    await user().click(form.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("invites the first organization when there are none, from either Add button", async () => {
    await showOrganizations([]);
    expect(await screen.findByText("No organizations yet. Add the first one.")).toBeTruthy();
    const buttons = screen.getAllByRole("button", { name: "Add organization" });
    expect(buttons).toHaveLength(2);
    for (const button of buttons) {
      await user().click(button);
      await user().click(await screen.findByRole("button", { name: "Cancel" }));
    }
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("Edit opens the organization's form, filled in", async () => {
    await showOrganizations();
    await user().click(await screen.findByRole("button", { name: "Edit Harbor & Pine" }));
    const form = within(await screen.findByRole("dialog", { name: "Edit organization" }));
    expect((form.getByLabelText("Name") as HTMLInputElement).value).toBe("Harbor & Pine");
  });

  it("Delete asks first, then deletes that organization", async () => {
    const calls = await showOrganizations(ORGANIZATIONS, {
      "GET /organizations/1/delete-impact": { contacts: 3, deals: 2, held_by: [] },
      "DELETE /organizations/1": () => ({ status: 204, body: null }),
    });
    await user().click(await screen.findByRole("button", { name: "Delete Harbor & Pine" }));
    const confirm = within(await screen.findByRole("alertdialog", { name: "Delete Harbor & Pine?" }));
    await confirm.findByText(/Its 3 contacts and 2 deals will stay/);
    await user().click(confirm.getByRole("button", { name: "Delete organization" }));

    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(calls.filter((call) => call.method === "DELETE").map((call) => call.path)).toEqual(["/organizations/1"]);
  });
});

describe("an organizations table that can't be read", () => {
  it("says so, and Try again reads it", async () => {
    let broken = true;
    await showOrganizations(ORGANIZATIONS, {
      "GET /organizations": () => (broken ? FAILED : { body: ORGANIZATIONS }),
    });
    expect((await screen.findByRole("alert")).textContent).toContain("Couldn't load this.");
    expect(screen.queryByRole("table")).toBeNull();

    broken = false;
    await user().click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("link", { name: "Harbor & Pine" })).toBeTruthy();
  });
});
