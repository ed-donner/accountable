// TF12: the organization's contacts are listed first; typed values stay after an error.
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockApi, renderWithProviders } from "../shared/test-utils";
import { DealForm, orderContacts } from "./DealForm";

afterEach(() => vi.unstubAllGlobals());

const organizations = {
  items: [
    { id: 1, name: "Acme Ltd", industry: null, website: null, notes: null, contact_count: 1, open_deal_count: 0, open_value: 0 },
    { id: 2, name: "Bolt Freight", industry: null, website: null, notes: null, contact_count: 2, open_deal_count: 0, open_value: 0 },
  ],
  total: 2,
};
const contacts = {
  items: [
    { id: 10, name: "Zoe Acme", organization_id: 1 },
    { id: 11, name: "Ann Bolt", organization_id: 2 },
    { id: 12, name: "Carl Bolt", organization_id: 2 },
    { id: 13, name: "Bea Nobody", organization_id: null },
  ],
  total: 4,
  status_counts: { all: 4, lead: 4, qualified: 0, customer: 0 },
};

test("orderContacts puts the organization's people first", () => {
  const { atOrg, others } = orderContacts(contacts.items, 2);
  expect(atOrg.map((c) => c.name)).toEqual(["Ann Bolt", "Carl Bolt"]);
  expect(others.map((c) => c.name)).toEqual(["Bea Nobody", "Zoe Acme"]);
});

test("the main contact list follows the chosen organization", async () => {
  mockApi({ "GET /organizations": organizations, "GET /contacts": contacts });
  renderWithProviders(<DealForm onSaved={vi.fn()} onCancel={vi.fn()} />);
  await screen.findByRole("option", { name: "Bolt Freight" });
  await userEvent.selectOptions(screen.getByLabelText(/Organization/), "Bolt Freight");
  const select = screen.getByLabelText("Main contact");
  const groups = within(select).getAllByRole("group");
  expect(groups[0]).toHaveAttribute("label", "At Bolt Freight");
  expect(within(groups[0]).getAllByRole("option").map((o) => o.textContent)).toEqual(["Ann Bolt", "Carl Bolt"]);
  expect(within(groups[1]).getAllByRole("option").map((o) => o.textContent)).toEqual(["Bea Nobody", "Zoe Acme"]);
});

test("errors show under fields and what was typed stays", async () => {
  const calls = mockApi({
    "GET /organizations": organizations,
    "GET /contacts": contacts,
    "POST /deals": () => ({
      status: 400,
      body: {
        message: "Check the highlighted fields and try again.",
        fields: { close_date: "A closed deal can't have a close date after today." },
      },
    }),
  });
  const onSaved = vi.fn();
  renderWithProviders(<DealForm onSaved={onSaved} onCancel={vi.fn()} />);
  await screen.findByRole("option", { name: "Acme Ltd" });

  // The form's own checks first.
  await userEvent.type(screen.getByLabelText(/Value/), "12.5");
  await userEvent.click(screen.getByRole("button", { name: "Add deal" }));
  expect(await screen.findByText("Enter a name.")).toBeInTheDocument();
  expect(screen.getByText("Choose an organization.")).toBeInTheDocument();
  expect(screen.getByText("Enter a value from 0 to 1,000,000,000, in whole dollars.")).toBeInTheDocument();
  expect(screen.getByLabelText(/Value/)).toHaveValue("12.5");
  expect(calls.filter((c) => c.method === "POST")).toHaveLength(0);

  // Then the backend's.
  await userEvent.type(screen.getByLabelText(/Name/), "Renewal");
  await userEvent.selectOptions(screen.getByLabelText(/Organization/), "Acme Ltd");
  await userEvent.clear(screen.getByLabelText(/Value/));
  await userEvent.type(screen.getByLabelText(/Value/), "48,200");
  await userEvent.selectOptions(screen.getByLabelText(/Stage/), "Won");
  await userEvent.click(screen.getByRole("button", { name: "Add deal" }));
  await waitFor(() => expect(calls.some((c) => c.method === "POST")).toBe(true));
  expect(await screen.findByText("A closed deal can't have a close date after today.")).toBeInTheDocument();
  await waitFor(() => expect(calls.find((c) => c.method === "POST")?.body).toMatchObject({ name: "Renewal", organization_id: 1, value: 48200, stage: "won" }));
  expect(screen.getByLabelText(/Name/)).toHaveValue("Renewal");
  expect(screen.getByLabelText(/Value/)).toHaveValue("48,200");
  expect(onSaved).not.toHaveBeenCalled();
});

test("a list that fails to load says so and can be retried, keeping what was typed", async () => {
  let failing = true;
  mockApi({
    "GET /organizations": () =>
      failing ? { status: 500, body: { message: "Something went wrong.", fields: {} } } : { body: organizations },
    "GET /contacts": contacts,
  });
  renderWithProviders(<DealForm preset={{ organizationId: 2 }} onSaved={vi.fn()} onCancel={vi.fn()} />);
  const alert = await screen.findByText(/Couldn.t load the organizations\./);
  await userEvent.type(screen.getByLabelText(/Name/), "Bolt pilot");
  failing = false;
  await userEvent.click(within(alert).getByRole("button", { name: "Retry" }));
  await screen.findByRole("option", { name: "Bolt Freight" });
  expect(screen.queryByText(/Couldn't load the organizations\./)).toBeNull();
  await waitFor(() => expect(screen.getByLabelText(/Organization/)).toHaveDisplayValue("Bolt Freight"));
  expect(screen.getByLabelText(/Name/)).toHaveValue("Bolt pilot");
});
