// C4: a contact's details, organization, deals and timeline, with edit and delete.
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

function contact(overrides: Partial<Schemas["ContactDetail"]> = {}): Schemas["ContactDetail"] {
  return {
    id: 7,
    name: "Ann Bolt",
    email: "ann@bolt.example",
    phone: "0113 496 0000",
    job_title: "Buyer",
    organization_id: 2,
    status: "lead",
    created_at: "2026-01-01T00:00:00",
    updated_at: "2026-01-01T00:00:00",
    organization: { id: 2, name: "Bolt Freight" },
    deals: [
      dealRow({ id: 5, name: "Fleet renewal", is_late: true }),
      dealRow({ id: 6, name: "Spare parts", stage: "won", close_date: null, value: 2500 }),
    ],
    ...overrides,
  };
}

const forms = {
  "GET /organizations": list([organizationRow()]),
  "GET /contacts": {
    ...list([contactRow()]),
    status_counts: { all: 1, lead: 1, qualified: 0, customer: 0 },
  },
};

function open(detail: Schemas["ContactDetail"], extra = {}) {
  const calls = mockApi({
    "GET /contacts/7": detail,
    "GET /contacts/7/timeline": { items: [] },
    ...forms,
    ...extra,
  });
  renderApp("/contacts/7");
  return calls;
}

const details = () => screen.findByRole("region", { name: "Details" });

test("the details show the contact's status, organization and ways to reach them", async () => {
  open(contact());
  const panel = await details();
  expect(screen.getByRole("heading", { name: "Ann Bolt" })).toBeInTheDocument();
  expect(screen.getByText("Buyer at Bolt Freight")).toBeInTheDocument();
  expect(panel).toHaveTextContent("Lead");
  expect(within(panel).getByRole("link", { name: "Bolt Freight" })).toHaveAttribute(
    "href",
    "/organizations/2",
  );
  expect(within(panel).getByRole("link", { name: "ann@bolt.example" })).toHaveAttribute(
    "href",
    "mailto:ann@bolt.example",
  );
  expect(panel).toHaveTextContent("0113 496 0000");
});

test("missing details read as None, and the summary falls back to Contact", async () => {
  open(
    contact({
      organization: null,
      organization_id: null,
      job_title: null,
      email: null,
      phone: null,
      deals: [],
    }),
  );
  const panel = await details();
  expect(screen.getByText("Contact")).toBeInTheDocument();
  expect(panel).toHaveTextContent("No organization");
  expect(within(panel).getAllByText("None")).toHaveLength(3);
  expect(screen.getByText("Ann Bolt isn't the main contact on any deals yet.")).toBeInTheDocument();
});

test("the deals list shows each deal's stage, close date, value and lateness", async () => {
  open(contact());
  const deals = await screen.findByRole("region", { name: "Deals" });
  const [renewal, parts] = within(deals).getAllByRole("listitem");
  expect(within(renewal).getByRole("link", { name: "Fleet renewal" })).toHaveAttribute(
    "href",
    "/deals/5",
  );
  expect(renewal).toHaveTextContent("Fleet renewal LateProposal · 1 Dec 2026$10,000");
  expect(parts).toHaveTextContent("Won · No close date$2,500");
});

test("the timeline is shown for the contact", async () => {
  open(contact());
  expect(await screen.findByText(/Nothing logged yet/)).toBeInTheDocument();
});

test("Edit opens the contact's form, and Add deal a deal form with the contact chosen", async () => {
  open(contact());
  await details();
  await userEvent.click(screen.getByRole("button", { name: "Edit" }));
  const edit = await screen.findByRole("dialog", { name: "Edit contact" });
  expect(await within(edit).findByLabelText(/Name/)).toHaveValue("Ann Bolt");
  await userEvent.click(within(edit).getByRole("button", { name: "Cancel" }));

  await userEvent.click(screen.getByRole("button", { name: "Add deal" }));
  const add = await screen.findByRole("dialog", { name: "Add deal" });
  await waitFor(() =>
    expect(within(add).getByLabelText("Main contact")).toHaveDisplayValue("Ann Bolt"),
  );
  expect(within(add).getByLabelText(/Organization/)).toHaveDisplayValue("Bolt Freight");
});

test("deleting the contact goes back to the contacts list", async () => {
  open(contact({ deals: [] }), {
    "GET /contacts/7/delete-impact": { name: "Ann Bolt", deals: 0, activities: 0 },
    "DELETE /contacts/7": () => ({ status: 204 }),
  });
  await details();
  await userEvent.click(screen.getByRole("button", { name: "Delete contact" }));
  const confirm = await screen.findByRole("alertdialog", { name: "Delete Ann Bolt?" });
  await userEvent.click(within(confirm).getByRole("button", { name: "Delete contact" }));
  expect(await screen.findByRole("heading", { name: "Contacts" })).toBeInTheDocument();
  expect(screen.getByText("Deleted Ann Bolt.")).toBeInTheDocument();
});

test("a contact that isn't there says so", async () => {
  mockApi({ "GET /contacts/7": () => ({ status: 404, body: { message: "Not found." } }) });
  renderApp("/contacts/7");
  expect(
    await screen.findByRole("heading", { name: "We couldn't find that contact" }),
  ).toBeInTheDocument();
});
