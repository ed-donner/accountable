import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import App from "@/App";
import { META, ORGS, fakeApi, organizationDetail, renderWithApp, reply } from "@/test/render";

describe("an organization's page", () => {
  it("shows its details, figures, contacts and deals (ORG-2)", async () => {
    fakeApi({ "GET /api/meta": META, "GET /api/organizations/1": organizationDetail() });
    renderWithApp(<App />, { route: "/organizations/1" });

    expect(await screen.findByRole("heading", { name: "Bluefin Logistics", level: 1 })).toBeInTheDocument();
    expect(screen.getByText("Revenue won to date")).toBeInTheDocument();
    expect(screen.getByText("$22,000")).toBeInTheDocument();
    expect(screen.getByText("Three depots.")).toBeInTheDocument();
    const website = screen.getAllByRole("link", { name: /bluefin\.example/ })[0];
    expect(website.getAttribute("href")).toMatch(/^https:\/\/bluefin\.example/);
    expect(website).toHaveAttribute("target", "_blank");

    const contacts = screen.getByRole("list", { name: "Contacts" });
    expect(within(contacts).getByRole("link", { name: /Sarah Chen/ })).toHaveAttribute("href", "/contacts/10");
    expect(within(contacts).getAllByRole("listitem")).toHaveLength(2);
    const deals = screen.getByRole("list", { name: "Deals" });
    expect(within(deals).getByRole("link", { name: /Website redesign/ })).toHaveAttribute("href", "/deals/100");
  });

  it("says when it has no contacts or deals yet", async () => {
    fakeApi({
      "GET /api/meta": META,
      "GET /api/organizations/1": organizationDetail({ contacts: [], deals: [], industry: null, website: null }),
    });
    renderWithApp(<App />, { route: "/organizations/1" });
    expect(await screen.findByText("No contacts yet.")).toBeInTheDocument();
    expect(screen.getByText("No deals yet.")).toBeInTheDocument();
    expect(screen.getAllByText("Not given")).toHaveLength(2);
  });

  it("adds a contact with the organization filled in (ORG-3)", async () => {
    fakeApi({
      "GET /api/meta": META,
      "GET /api/organizations/1": organizationDetail(),
      "GET /api/organizations": ORGS,
    });
    const { user } = renderWithApp(<App />, { route: "/organizations/1" });
    await user.click(await screen.findByRole("button", { name: "Add contact" }));
    const form = await screen.findByRole("dialog", { name: "Add contact" });
    expect(await within(form).findByRole("combobox", { name: "Organization" })).toHaveTextContent("Bluefin Logistics");
  });

  it("goes back to the table after a delete (DEL-7)", async () => {
    const { calls } = fakeApi({
      "GET /api/meta": META,
      "GET /api/organizations/1": organizationDetail({ deals: [] }),
      "GET /api/organizations/1/delete-impact": { contacts: 2, deals: [] },
      "DELETE /api/organizations/1": reply(204),
      "GET /api/organizations": ORGS,
    });
    const { user } = renderWithApp(<App />, { route: "/organizations/1" });
    await user.click(await screen.findByRole("button", { name: "Delete organization" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Delete Bluefin Logistics?" });
    await within(dialog).findByText("Its 2 contacts will stay, with no organization.");
    await user.click(within(dialog).getByRole("button", { name: "Delete organization" }));

    expect(await screen.findByRole("heading", { name: "Organizations", level: 1 })).toBeInTheDocument();
    expect(calls).toContainEqual({ method: "DELETE", path: "/api/organizations/1", body: undefined });
  });

  it("says when the organization no longer exists", async () => {
    fakeApi({ "GET /api/meta": META });
    renderWithApp(<App />, { route: "/organizations/1" });
    expect(await screen.findByRole("heading", { name: "This organization no longer exists." })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to organizations" })).toHaveAttribute("href", "/organizations");
  });

  it("says when the page couldn't load", async () => {
    fakeApi({ "GET /api/meta": META, "GET /api/organizations/1": reply(500) });
    renderWithApp(<App />, { route: "/organizations/1" });
    await waitFor(() =>
      expect(screen.getByText("Couldn't load this page. Something went wrong on the server.")).toBeInTheDocument(),
    );
  });
});
