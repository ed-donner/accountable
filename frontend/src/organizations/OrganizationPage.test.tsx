// O3: an organization's details, contacts and deals, with ways to add either already linked.
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Schemas } from "../shared/api";
import {
  contactRow,
  dealRow,
  list,
  mockApi,
  organizationRow,
  renderApp,
} from "../shared/test-utils";

afterEach(() => vi.unstubAllGlobals());

function organization(
  overrides: Partial<Schemas["OrganizationDetail"]> = {},
): Schemas["OrganizationDetail"] {
  return {
    id: 2,
    name: "Bolt Freight",
    website: "https://bolt.example",
    industry: "Logistics",
    notes: "Prefers email.",
    created_at: "2026-01-01T00:00:00",
    updated_at: "2026-01-01T00:00:00",
    contacts: [contactRow(), contactRow({ id: 8, name: "Cy Dale", job_title: null, email: null })],
    deals: [
      dealRow({ is_late: true }),
      dealRow({ id: 6, name: "Spare parts", stage: "won", value: 2500, close_date: null }),
    ],
    ...overrides,
  };
}

function open(detail: Schemas["OrganizationDetail"], extra = {}) {
  const calls = mockApi({
    "GET /organizations/2": detail,
    "GET /organizations": list([organizationRow()]),
    "GET /contacts": {
      ...list([contactRow()]),
      status_counts: { all: 1, lead: 1, qualified: 0, customer: 0 },
    },
    ...extra,
  });
  renderApp("/organizations/2");
  return calls;
}

const details = () => screen.findByRole("region", { name: "Details" });

test("the details show the website, industry, open pipeline and notes", async () => {
  open(organization());
  const panel = await details();
  expect(screen.getByText("Logistics · 2 contacts · 1 open deal")).toBeInTheDocument();
  expect(within(panel).getByRole("link", { name: "bolt.example" })).toHaveAttribute(
    "href",
    "https://bolt.example",
  );
  expect(panel).toHaveTextContent("IndustryLogisticsOpen pipeline$10,000NotesPrefers email.");
});

test("missing details read as None", async () => {
  open(organization({ website: null, industry: null, notes: null, contacts: [], deals: [] }));
  const panel = await details();
  expect(screen.getByText("Organization · 0 contacts · 0 open deals")).toBeInTheDocument();
  expect(within(panel).getAllByText("None")).toHaveLength(3);
  expect(screen.getByText("No contacts at Bolt Freight yet.")).toBeInTheDocument();
  expect(screen.getByText("No deals with Bolt Freight yet.")).toBeInTheDocument();
});

test("the contacts and deals link to their records", async () => {
  open(organization());
  const contacts = await screen.findByRole("region", { name: "Contacts" });
  const [ann, cy] = within(contacts).getAllByRole("listitem");
  expect(within(ann).getByRole("link", { name: "Ann Bolt" })).toHaveAttribute(
    "href",
    "/contacts/7",
  );
  expect(ann).toHaveTextContent("Buyer · ann@bolt.exampleLead");
  expect(cy).toHaveTextContent("Cy DaleLead");
  const deals = screen.getByRole("region", { name: "Deals" });
  const [renewal, parts] = within(deals).getAllByRole("listitem");
  expect(renewal).toHaveTextContent("Fleet renewal LateProposal · 1 Dec 2026$10,000");
  expect(parts).toHaveTextContent("Spare parts Won · No close date$2,500");
});

test("Add contact and Add deal open forms with the organization already chosen", async () => {
  open(organization());
  await details();
  await userEvent.click(screen.getByRole("button", { name: "Add contact" }));
  let panel = await screen.findByRole("dialog", { name: "Add contact" });
  await waitFor(() =>
    expect(within(panel).getByLabelText(/Organization/)).toHaveDisplayValue("Bolt Freight"),
  );
  await userEvent.click(within(panel).getByRole("button", { name: "Cancel" }));

  await userEvent.click(screen.getByRole("button", { name: "Add deal" }));
  panel = await screen.findByRole("dialog", { name: "Add deal" });
  await waitFor(() =>
    expect(within(panel).getByLabelText(/Organization/)).toHaveDisplayValue("Bolt Freight"),
  );
  await userEvent.click(within(panel).getByRole("button", { name: "Cancel" }));

  await userEvent.click(screen.getByRole("button", { name: "Edit" }));
  panel = await screen.findByRole("dialog", { name: "Edit organization" });
  expect(within(panel).getByLabelText("Notes")).toHaveValue("Prefers email.");
});

test("deleting the organization goes back to the list", async () => {
  open(organization(), {
    "GET /organizations/2/delete-impact": { name: "Bolt Freight", contacts: 0, deals: 0 },
    "DELETE /organizations/2": () => ({ status: 204 }),
  });
  await details();
  await userEvent.click(screen.getByRole("button", { name: "Delete organization" }));
  const confirm = await screen.findByRole("alertdialog", { name: "Delete Bolt Freight?" });
  expect(confirm).toHaveTextContent("Bolt Freight has no contacts or deals.");
  await userEvent.click(within(confirm).getByRole("button", { name: "Delete organization" }));
  expect(await screen.findByRole("heading", { name: "Organizations" })).toBeInTheDocument();
});

test("an organization that fails to load says so", async () => {
  mockApi({ "GET /organizations/2": () => ({ status: 500, body: {} }) });
  renderApp("/organizations/2");
  expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't load this organization.");
});
