import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Deal } from "@/api/types";
import { CONTACTS, DEAL, META, ORGS, fakeApi, renderWithApp, reply } from "@/test/render";
import { DealForm } from "./DealForm";

const ROUTES = {
  "GET /api/meta": META,
  "GET /api/organizations": ORGS,
  "GET /api/contacts": CONTACTS,
};

async function chooseOption(user: ReturnType<typeof renderWithApp>["user"], label: string, option: string) {
  await user.click(screen.getByLabelText(new RegExp(`^${label}`)));
  await user.click(await screen.findByRole("option", { name: new RegExp(`^${option}`) }));
}

describe("DealForm", () => {
  it("starts a new deal 30 days out, and choosing a stage fills in its probability (STG-2)", async () => {
    fakeApi(ROUTES);
    const { user } = renderWithApp(<DealForm open onOpenChange={() => {}} />);
    await waitFor(() => expect(screen.getByLabelText(/Expected close date/)).toHaveValue("2026-12-19"));
    expect(screen.getByLabelText("Probability")).toHaveValue("10");

    await chooseOption(user, "Stage", "Proposal");
    expect(screen.getByLabelText(/^Stage/)).toHaveTextContent("Proposal");
    expect(screen.getByLabelText("Probability")).toHaveValue("50");
    expect(screen.getByLabelText("Probability")).not.toHaveAttribute("readonly");
  });

  it("Won fills in today and locks the probability (STG-2, STG-4)", async () => {
    fakeApi(ROUTES);
    const { user } = renderWithApp(<DealForm open onOpenChange={() => {}} />);
    await waitFor(() => expect(screen.getByLabelText(/close date/i)).toHaveValue("2026-12-19"));
    await chooseOption(user, "Stage", "Won");
    expect(screen.getByLabelText(/Close date/)).toHaveValue("2026-11-19");
    expect(screen.getByLabelText("Probability")).toHaveValue("100");
    expect(screen.getByLabelText("Probability")).toHaveAttribute("readonly");
    expect(screen.getByText("Won is always 100%.")).toBeInTheDocument();

    await chooseOption(user, "Stage", "Lost");
    expect(screen.getByLabelText("Probability")).toHaveValue("0");
  });

  it("changing the organization clears the main contact and narrows the list (spec 1.5)", async () => {
    fakeApi(ROUTES);
    const { user } = renderWithApp(<DealForm open onOpenChange={() => {}} deal={DEAL as unknown as Deal} />);
    await waitFor(() => expect(screen.getByLabelText("Main contact")).toHaveTextContent("Sarah Chen"));

    // Only Bluefin's contacts are offered.
    await user.click(screen.getByLabelText("Main contact"));
    const listbox = await screen.findByRole("listbox");
    expect(within(listbox).queryByRole("option", { name: /Amir Haddad/ })).not.toBeInTheDocument();
    expect(within(listbox).getByRole("option", { name: /Tom Reyes/ })).toBeInTheDocument();
    await user.keyboard("{Escape}");

    await chooseOption(user, "Organization", "Cedar Health");
    expect(screen.getByLabelText("Main contact")).toHaveTextContent("Choose a contact");
    await user.click(screen.getByLabelText("Main contact"));
    const narrowed = await screen.findByRole("listbox");
    expect(within(narrowed).getByRole("option", { name: /Amir Haddad/ })).toBeInTheDocument();
    expect(within(narrowed).queryByRole("option", { name: /Sarah Chen/ })).not.toBeInTheDocument();
  });

  it("shows the required-field messages", async () => {
    const { calls } = fakeApi(ROUTES);
    const { user } = renderWithApp(<DealForm open onOpenChange={() => {}} />);
    await waitFor(() => expect(screen.getByLabelText(/close date/i)).toHaveValue("2026-12-19"));
    await user.click(screen.getByRole("button", { name: "Add deal" }));
    expect(await screen.findByText("Enter a name.")).toBeInTheDocument();
    expect(screen.getByText("Choose an organization.")).toBeInTheDocument();
    expect(screen.getByText("Enter a whole number of dollars from $0 to $100,000,000.")).toBeInTheDocument();
    expect(calls.some((call) => call.method === "POST")).toBe(false);
  });

  it("shows a field error from the server under its field, and stays open (GEN-6)", async () => {
    const { calls } = fakeApi({
      ...ROUTES,
      "POST /api/deals": reply(422, {
        detail: [{ loc: ["body", "main_contact_id"], msg: "Choose a contact from Bluefin Logistics.", type: "value_error" }],
      }),
    });
    let closed = false;
    const { user } = renderWithApp(<DealForm open onOpenChange={(open) => (closed = !open)} />);
    await waitFor(() => expect(screen.getByLabelText(/close date/i)).toHaveValue("2026-12-19"));
    await user.type(screen.getByLabelText(/Name/), "New deal");
    await chooseOption(user, "Organization", "Bluefin Logistics");
    await user.type(screen.getByLabelText(/Value/), "$12,500");
    await user.click(screen.getByRole("button", { name: "Add deal" }));

    expect(await screen.findByText("Choose a contact from Bluefin Logistics.")).toBeInTheDocument();
    expect(closed).toBe(false);
    expect(screen.getByLabelText(/Name/)).toHaveValue("New deal");
    const post = calls.find((call) => call.method === "POST");
    expect(post?.body).toMatchObject({ name: "New deal", organization_id: 1, value: 12500, probability: 10, stage: "new" });
  });
});
