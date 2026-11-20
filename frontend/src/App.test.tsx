import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import App from "@/App";
import { CONTACTS, META, ORGS, deal, fakeApi, renderWithApp } from "@/test/render";

describe("the app", () => {
  it("names each section in the top bar and marks the open one", async () => {
    fakeApi({ "GET /api/meta": META, "GET /api/organizations": ORGS });
    renderWithApp(<App />, { route: "/organizations" });
    const sections = screen.getByRole("navigation", { name: "Sections" });
    expect(
      within(sections)
        .getAllByRole("link")
        .map((link) => link.textContent),
    ).toEqual(["Dashboard", "Organizations", "Contacts", "Deals", "Pipeline"]);
    expect(within(sections).getByRole("link", { name: "Organizations" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Accountable, go to the dashboard" })).toHaveAttribute("href", "/");
  });

  it("says when there's no page at an address", () => {
    fakeApi({ "GET /api/meta": META });
    renderWithApp(<App />, { route: "/no-such-page" });
    expect(screen.getByRole("heading", { name: "Page not found" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to the dashboard" })).toHaveAttribute("href", "/");
  });
});

describe("the tables", () => {
  it("lists the organizations with their counts and open pipeline (ORG-1)", async () => {
    fakeApi({ "GET /api/meta": META, "GET /api/organizations": ORGS });
    renderWithApp(<App />, { route: "/organizations" });
    const bluefin = await screen.findByRole("row", { name: /Bluefin Logistics/ });
    expect(screen.getAllByText("2 organizations")).not.toHaveLength(0);
    expect(within(bluefin).getByText("Logistics")).toBeInTheDocument();
    expect(within(bluefin).getByText("$48,500")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Bluefin Logistics" })).toHaveAttribute("href", "/organizations/1");
  });

  it("opens an empty form from Add organization", async () => {
    fakeApi({ "GET /api/meta": META, "GET /api/organizations": ORGS });
    const { user } = renderWithApp(<App />, { route: "/organizations" });
    await screen.findByRole("row", { name: /Bluefin Logistics/ });
    await user.click(screen.getAllByRole("button", { name: "Add organization" })[0]);
    expect(await screen.findByRole("dialog", { name: "Add organization" })).toBeInTheDocument();
  });

  it("filters the contacts by status, counting every contact (CON-1)", async () => {
    fakeApi({ "GET /api/meta": META, "GET /api/contacts": CONTACTS });
    const { user } = renderWithApp(<App />, { route: "/contacts" });
    await screen.findByRole("row", { name: /Sarah Chen/ });
    const filters = screen.getByRole("group", { name: "Filter by status" });
    expect(within(filters).getByRole("button", { name: /^Customers/ })).toHaveTextContent("Customers2");
    expect(within(filters).getByRole("button", { name: /^All/ })).toHaveAttribute("aria-pressed", "true");

    await user.click(within(filters).getByRole("button", { name: /^Leads/ }));
    expect(within(filters).getByRole("button", { name: /^Leads/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("link", { name: "Tom Reyes" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Sarah Chen" })).not.toBeInTheDocument();
  });

  it("shows each deal's value, probability, expected revenue and close date, and marks it Late (DEAL-1)", async () => {
    fakeApi({
      "GET /api/meta": META,
      "GET /api/deals": [deal(), deal({ id: 101, name: "Brand refresh", is_late: true, close_date: "2026-11-01" })],
    });
    renderWithApp(<App />, { route: "/deals" });
    const redesign = await screen.findByRole("row", { name: /Website redesign/ });
    expect(within(redesign).getByText("$48,500")).toBeInTheDocument();
    expect(within(redesign).getByText("25%")).toBeInTheDocument();
    expect(within(redesign).getByText("$12,125")).toBeInTheDocument();
    expect(within(redesign).getByText("Dec 12, 2026")).toBeInTheDocument();
    expect(within(redesign).queryByText("Late")).not.toBeInTheDocument();
    expect(within(screen.getByRole("row", { name: /Brand refresh/ })).getByText("Late")).toBeInTheDocument();
    expect(within(redesign).getByRole("link", { name: "Sarah Chen" })).toHaveAttribute("href", "/contacts/10");
  });

  it.each([
    { route: "/organizations", name: "Bluefin Logistics", form: "Edit Bluefin Logistics" },
    { route: "/contacts", name: "Sarah Chen", form: "Edit Sarah Chen" },
    { route: "/deals", name: "Website redesign", form: "Edit Website redesign" },
  ])("edits a row in a form filled with it, on $route", async ({ route, name, form }) => {
    fakeApi({
      "GET /api/meta": META,
      "GET /api/organizations": ORGS,
      "GET /api/contacts": CONTACTS,
      "GET /api/deals": [deal()],
    });
    const { user } = renderWithApp(<App />, { route });
    await user.click(await screen.findByRole("button", { name: `Edit ${name}` }));
    const dialog = await screen.findByRole("dialog", { name: form });
    expect(within(dialog).getByRole("textbox", { name: /Name/ })).toHaveValue(name);
  });

  it.each([
    { route: "/organizations", name: "Cedar Health", impact: "/api/organizations/2/delete-impact" },
    { route: "/contacts", name: "Tom Reyes", impact: "/api/contacts/11/delete-impact" },
    { route: "/deals", name: "Website redesign", impact: "/api/deals/100/delete-impact" },
  ])("asks before deleting a row, on $route", async ({ route, name, impact }) => {
    fakeApi({
      "GET /api/meta": META,
      "GET /api/organizations": ORGS,
      "GET /api/contacts": CONTACTS,
      "GET /api/deals": [deal()],
      [`GET ${impact}`]: { contacts: 0, deals: [], activities: 0, stage_changes: 0 },
    });
    const { user } = renderWithApp(<App />, { route });
    await user.click(await screen.findByRole("button", { name: `Delete ${name}` }));
    const dialog = await screen.findByRole("alertdialog", { name: `Delete ${name}?` });
    expect(await within(dialog).findByText("This can't be undone.")).toBeInTheDocument();
  });
});
