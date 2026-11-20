import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { META, fakeApi, renderWithApp, reply } from "@/test/render";
import { DeleteDialog } from "./DeleteDialog";

describe("DeleteDialog", () => {
  it("shows a blocked organization's deals as links, with only Close (DEL-3)", async () => {
    const { calls } = fakeApi({
      "GET /api/meta": META,
      "GET /api/organizations/1/delete-impact": {
        contacts: 2,
        deals: [
          { id: 5, name: "Website redesign", stage: "proposal", value: 48500 },
          { id: 6, name: "Data dashboard build", stage: "qualified", value: 38000 },
        ],
      },
    });
    renderWithApp(
      <DeleteDialog target={{ kind: "organization", id: 1, name: "Bluefin Logistics" }} onOpenChange={() => {}} />,
    );
    const dialog = await screen.findByRole("alertdialog", { name: "Bluefin Logistics can't be deleted" });
    expect(
      within(dialog).getByText(
        "Bluefin Logistics can't be deleted while it has deals. Move these deals to another organization or delete them first:",
      ),
    ).toBeInTheDocument();
    expect(within(dialog).getByRole("link", { name: /Website redesign/ })).toHaveAttribute("href", "/deals/5");
    expect(within(dialog).getByRole("link", { name: /Data dashboard build/ })).toHaveAttribute("href", "/deals/6");
    expect(within(dialog).getAllByRole("button").map((button) => button.textContent)).toEqual(["Close"]);
    expect(calls.some((call) => call.method === "DELETE")).toBe(false);
  });

  it("Cancel does nothing (DEL-1)", async () => {
    const { calls } = fakeApi({
      "GET /api/meta": META,
      "GET /api/deals/7/delete-impact": { activities: 5, stage_changes: 2 },
    });
    const onOpenChange = vi.fn();
    const { user } = renderWithApp(
      <DeleteDialog target={{ kind: "deal", id: 7, name: "Website redesign" }} onOpenChange={onOpenChange} />,
    );
    const dialog = await screen.findByRole("alertdialog", { name: "Delete Website redesign?" });
    expect(await within(dialog).findByText("Its 5 activities, including its stage changes, will be deleted.")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(calls.some((call) => call.method === "DELETE")).toBe(false);
  });

  it("confirming deletes, then says so (DEL-1, DEL-7)", async () => {
    const { calls } = fakeApi({
      "GET /api/meta": META,
      "GET /api/contacts/8/delete-impact": { activities: 6, deals: [{ id: 5, name: "Website redesign" }, { id: 9, name: "Q1 SEO retainer" }] },
      "DELETE /api/contacts/8": reply(204),
    });
    const onDeleted = vi.fn();
    const { user } = renderWithApp(
      <DeleteDialog target={{ kind: "contact", id: 8, name: "Sarah Chen" }} onOpenChange={() => {}} onDeleted={onDeleted} />,
    );
    const dialog = await screen.findByRole("alertdialog", { name: "Delete Sarah Chen?" });
    expect(await within(dialog).findByText("Sarah Chen's 6 activities will be deleted.")).toBeInTheDocument();
    expect(
      within(dialog).getByText("These deals will stay, with no main contact: Website redesign, Q1 SEO retainer."),
    ).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Delete contact" }));
    await waitFor(() => expect(onDeleted).toHaveBeenCalled());
    expect(calls.filter((call) => call.method === "DELETE").map((call) => call.path)).toEqual(["/api/contacts/8"]);
    expect(await screen.findByText("Contact deleted")).toBeInTheDocument();
  });
});
