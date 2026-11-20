import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import App from "@/App";
import { CONTACTS, META, deal, entry, fakeApi, renderWithApp, reply } from "@/test/render";

const SARAH = {
  ...CONTACTS[0],
  email: "sarah@bluefin.example",
  phone: "(555) 010-2030",
  deals: [deal()],
};

const TIMELINE = [
  entry({
    id: 1,
    description: "Send the proposal",
    follow_up_date: "2026-11-17",
    deal: { id: 100, name: "Website redesign" },
  }),
  entry({
    id: 2,
    type: "stage_change",
    description: "Moved from New to Qualified",
    from_stage: "new",
    to_stage: "qualified",
    deal: { id: 100, name: "Website redesign" },
  }),
];

function routes(extra: Record<string, unknown> = {}) {
  return {
    "GET /api/meta": META,
    "GET /api/contacts/10": SARAH,
    "GET /api/contacts/10/timeline": TIMELINE,
    ...extra,
  };
}

describe("a contact's page", () => {
  it("shows their details and the deals they're the main contact on (CON-2)", async () => {
    fakeApi(routes());
    renderWithApp(<App />, { route: "/contacts/10" });

    expect(await screen.findByRole("heading", { name: "Sarah Chen", level: 1 })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "sarah@bluefin.example" })).toHaveAttribute(
      "href",
      "mailto:sarah@bluefin.example",
    );
    expect(screen.getByRole("link", { name: "(555) 010-2030" })).toHaveAttribute("href", "tel:5550102030");
    expect(screen.getAllByRole("link", { name: "Bluefin Logistics" })[0]).toHaveAttribute("href", "/organizations/1");
    expect(screen.getByRole("link", { name: /Website redesign\s*Qualified/ })).toHaveAttribute("href", "/deals/100");
  });

  it("shows the timeline newest first, naming each entry's deal (ACT-3)", async () => {
    fakeApi(routes());
    renderWithApp(<App />, { route: "/contacts/10" });
    const timeline = await screen.findByRole("list", { name: "Timeline entries" });
    const [call, stageChange] = within(timeline).getAllByRole("listitem");
    expect(within(call).getByText("Send the proposal")).toBeInTheDocument();
    expect(within(call).getByText("Follow up Nov 17, 2026 (overdue)")).toBeInTheDocument();
    expect(within(call).getByRole("link", { name: "Website redesign" })).toHaveAttribute("href", "/deals/100");
    expect(within(stageChange).getByText("Moved from New to Qualified")).toBeInTheDocument();
    expect(within(stageChange).queryByRole("button")).not.toBeInTheDocument();
  });

  it("marks a follow-up done from the timeline (ACT-5)", async () => {
    const { calls } = fakeApi(routes({ "PATCH /api/activities/1": { ...TIMELINE[0], done: true } }));
    const { user } = renderWithApp(<App />, { route: "/contacts/10" });
    await user.click(await screen.findByRole("checkbox", { name: "Done: Send the proposal" }));
    await waitFor(() =>
      expect(calls).toContainEqual({ method: "PATCH", path: "/api/activities/1", body: { done: true } }),
    );
  });

  it("edits an activity in a form filled with what it says (ACT-4)", async () => {
    const { calls } = fakeApi(routes({ "PATCH /api/activities/1": TIMELINE[0] }));
    const { user } = renderWithApp(<App />, { route: "/contacts/10" });
    await user.click(await screen.findByRole("button", { name: "Edit this call" }));
    const form = await screen.findByRole("dialog", { name: "Edit activity" });
    const description = within(form).getByRole("textbox", { name: /Description/ });
    expect(description).toHaveValue("Send the proposal");
    expect(within(form).getByRole("checkbox", { name: "Follow-up done" })).not.toBeChecked();

    await user.clear(description);
    await user.type(description, "Sent the proposal");
    await user.click(within(form).getByRole("checkbox", { name: "Follow-up done" }));
    await user.click(within(form).getByRole("button", { name: "Save changes" }));

    expect(await screen.findByText("Changes saved")).toBeInTheDocument();
    const saved = calls.find((call) => call.method === "PATCH");
    expect(saved?.body).toMatchObject({ type: "call", description: "Sent the proposal", done: true });
  });

  it("asks before deleting an activity (DEL-5)", async () => {
    fakeApi(routes());
    const { user } = renderWithApp(<App />, { route: "/contacts/10" });
    await user.click(await screen.findByRole("button", { name: "Delete this call" }));
    expect(await screen.findByRole("alertdialog", { name: /Delete this call from/ })).toBeInTheDocument();
  });

  it("says when nothing is logged yet, and when they're no one's main contact", async () => {
    fakeApi(routes({ "GET /api/contacts/10": { ...SARAH, deals: [] }, "GET /api/contacts/10/timeline": [] }));
    renderWithApp(<App />, { route: "/contacts/10" });
    expect(await screen.findByText("Nothing logged yet. Log a call, email or note above.")).toBeInTheDocument();
    expect(screen.getByText("Not the main contact on any deals.")).toBeInTheDocument();
  });

  it("says when the contact no longer exists", async () => {
    fakeApi({ "GET /api/meta": META });
    renderWithApp(<App />, { route: "/contacts/10" });
    expect(await screen.findByRole("heading", { name: "This contact no longer exists." })).toBeInTheDocument();
  });

  it("says when the page couldn't load", async () => {
    fakeApi({ "GET /api/meta": META, "GET /api/contacts/10": reply(500) });
    renderWithApp(<App />, { route: "/contacts/10" });
    expect(await screen.findByText(/Couldn't load this page/)).toBeInTheDocument();
  });
});
