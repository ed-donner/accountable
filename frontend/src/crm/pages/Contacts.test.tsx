import { screen, waitFor, within } from "@testing-library/react";
import { useLocation } from "react-router";
import { describe, expect, it } from "vitest";

import { mockApi, renderApp, user } from "../../test-utils";
import type { ContactRow } from "../queries";
import { Contacts } from "./Contacts";

function contact(id: number, name: string, extra: Partial<ContactRow> = {}): ContactRow {
  return {
    id,
    name,
    email: null,
    phone: null,
    job_title: null,
    organization_id: 1,
    organization_name: "Harbor & Pine",
    status: "lead",
    last_activity: null,
    ...extra,
  };
}

const SAM = contact(11, "Sam Carter", {
  email: "sam@harbor.example",
  phone: "555-0101",
  job_title: "Head of Operations",
  status: "customer",
  last_activity: "2026-10-30",
});
const ANA = contact(12, "Ana Lima", { status: "qualified", organization_id: null, organization_name: null });
const BEN = contact(13, "Ben Ito");
const CONTACTS = [SAM, ANA, BEN];

const FAILED = { status: 500, body: { detail: "Something went wrong." } };
const FORM_READS = { "GET /organizations": [{ id: 1, name: "Harbor & Pine" }] };

function Address() {
  const location = useLocation();
  return <output data-testid="address">{location.pathname + location.search}</output>;
}

async function showContacts(rows: ContactRow[] = CONTACTS, routes: Record<string, unknown> = {}) {
  const calls = mockApi({ "GET /contacts": rows, ...FORM_READS, ...routes });
  renderApp(
    <>
      <Contacts />
      <Address />
    </>,
  );
  await screen.findByRole("heading", { level: 1, name: "Contacts" });
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

function statusButton(name: string) {
  return within(screen.getByRole("group", { name: "Filter by status" })).getByRole("button", {
    name: new RegExp(`^${name}`),
  });
}

describe("the contacts table", () => {
  it("lists contacts by name, each linking to their page", async () => {
    await showContacts();
    expect(await screen.findByRole("link", { name: "Sam Carter" })).toBeTruthy();
    expect(document.title).toBe("Contacts | Accountable");
    expect(names()).toEqual(["Ana Lima", "Ben Ito", "Sam Carter"]);
    expect(screen.getByRole("link", { name: "Sam Carter" }).getAttribute("href")).toBe("/contacts/11");
  });

  it("shows each contact's details, status and last activity", async () => {
    await showContacts();
    const sam = await rowOf("Sam Carter");
    expect(sam.getByText("Harbor & Pine")).toBeTruthy();
    expect(sam.getByText("Head of Operations")).toBeTruthy();
    expect(sam.getByText("sam@harbor.example")).toBeTruthy();
    expect(sam.getByText("555-0101")).toBeTruthy();
    expect(sam.getByText("Customer")).toBeTruthy();
    expect(sam.getByText("Oct 30, 2026")).toBeTruthy();
  });

  it("shows None for a contact with no organization", async () => {
    await showContacts();
    expect((await rowOf("Ana Lima")).getByText("None")).toBeTruthy();
  });

  it("sorts the Status column Lead, Qualified, Customer", async () => {
    await showContacts();
    await user().click(await screen.findByRole("button", { name: "Status" }));
    expect(names()).toEqual(["Ben Ito", "Ana Lima", "Sam Carter"]);
  });

  it("finds contacts by their organization", async () => {
    await showContacts();
    await user().type(await screen.findByRole("searchbox"), "harbor");
    expect(names()).toEqual(["Ben Ito", "Sam Carter"]);
  });
});

describe("the status filter", () => {
  it("counts the contacts at each status", async () => {
    await showContacts();
    expect(await within(statusButton("All")).findByText("3")).toBeTruthy();
    expect(within(statusButton("Lead")).getByText("1")).toBeTruthy();
    expect(within(statusButton("Qualified")).getByText("1")).toBeTruthy();
    expect(within(statusButton("Customer")).getByText("1")).toBeTruthy();
  });

  it("shows only the chosen status, and keeps it in the address", async () => {
    await showContacts();
    await screen.findByRole("link", { name: "Sam Carter" });
    await user().click(statusButton("Customer"));
    expect(names()).toEqual(["Sam Carter"]);
    expect(statusButton("Customer").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("address").textContent).toBe("/?status=customer");

    await user().click(statusButton("All"));
    expect(names()).toEqual(["Ana Lima", "Ben Ito", "Sam Carter"]);
    expect(screen.getByTestId("address").textContent).toBe("/");
  });

  it("is cleared along with a search that matches nothing", async () => {
    await showContacts();
    await screen.findByRole("link", { name: "Sam Carter" });
    await user().click(statusButton("Qualified"));
    await user().type(screen.getByRole("searchbox"), "sam");
    expect(screen.getByText("No contacts match.")).toBeTruthy();

    await user().click(screen.getByRole("button", { name: "Clear search" }));
    expect(names()).toEqual(["Ana Lima", "Ben Ito", "Sam Carter"]);
    expect(statusButton("All").getAttribute("aria-pressed")).toBe("true");
  });

  it("shows no counts while the contacts can't be read", async () => {
    await showContacts([], { "GET /contacts": () => FAILED });
    await screen.findByRole("alert");
    for (const status of ["All", "Lead", "Qualified", "Customer"]) {
      expect(within(statusButton(status)).queryByText(/^\d+$/)).toBeNull();
    }
  });
});

describe("adding, editing and deleting from the contacts table", () => {
  it("Add contact opens an empty form", async () => {
    await showContacts();
    await user().click(screen.getByRole("button", { name: "Add contact" }));
    const form = within(await screen.findByRole("dialog", { name: "Add contact" }));
    expect((form.getByLabelText("Name") as HTMLInputElement).value).toBe("");
    await user().click(form.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("invites the first contact when there are none, from either Add button", async () => {
    await showContacts([]);
    expect(await screen.findByText("No contacts yet. Add the first one.")).toBeTruthy();
    const buttons = screen.getAllByRole("button", { name: "Add contact" });
    expect(buttons).toHaveLength(2);
    for (const button of buttons) {
      await user().click(button);
      await user().click(await screen.findByRole("button", { name: "Cancel" }));
    }
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("Edit opens the contact's form, filled in", async () => {
    await showContacts();
    await user().click(await screen.findByRole("button", { name: "Edit Sam Carter" }));
    const form = within(await screen.findByRole("dialog", { name: "Edit contact" }));
    expect((form.getByLabelText("Name") as HTMLInputElement).value).toBe("Sam Carter");
  });

  it("Delete asks first, then deletes that contact", async () => {
    const calls = await showContacts(CONTACTS, {
      "GET /contacts/11/delete-impact": { deals: 0, activities: 1 },
      "DELETE /contacts/11": () => ({ status: 204, body: null }),
    });
    await user().click(await screen.findByRole("button", { name: "Delete Sam Carter" }));
    const confirm = within(await screen.findByRole("alertdialog", { name: "Delete Sam Carter?" }));
    await confirm.findByText(/1 activity logged on this contact will be deleted/);
    await user().click(confirm.getByRole("button", { name: "Delete contact" }));

    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(calls.filter((call) => call.method === "DELETE").map((call) => call.path)).toEqual(["/contacts/11"]);
  });
});

describe("a contacts table that can't be read", () => {
  it("says so, and Try again reads it", async () => {
    let broken = true;
    await showContacts(CONTACTS, { "GET /contacts": () => (broken ? FAILED : { body: CONTACTS }) });
    expect((await screen.findByRole("alert")).textContent).toContain("Couldn't load this.");
    expect(screen.queryByRole("table")).toBeNull();

    broken = false;
    await user().click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("link", { name: "Sam Carter" })).toBeTruthy();
  });
});
