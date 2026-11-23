// C1 to C3, T4, T6: the contacts list, its status filter, and adding, editing and deleting.
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { contactRow, list, mockApi, organizationRow, renderApp } from "../shared/test-utils";

afterEach(() => vi.unstubAllGlobals());

const ann = contactRow();
const cy = contactRow({
  id: 8,
  name: "Cy Dale",
  status: "qualified",
  organization_id: null,
  organization_name: null,
  email: null,
  phone: null,
  job_title: null,
  last_activity_on: null,
});
const counts = { all: 2, lead: 1, qualified: 1, customer: 0 };
const contacts = { ...list([ann, cy]), status_counts: counts };
const routes = {
  "GET /contacts": contacts,
  "GET /organizations": list([organizationRow()]),
};

const table = () => screen.findByRole("table");
const dialog = (name: string) => screen.findByRole("dialog", { name });

test("the list shows each contact with their details and the status counts", async () => {
  mockApi(routes);
  renderApp("/contacts");
  const rows = within(await table()).getAllByRole("row");
  expect(rows[1]).toHaveTextContent(
    "Ann BoltBolt FreightBuyerann@bolt.example0113 496 0000Lead2 Nov 2026",
  );
  expect(within(rows[1]).getByRole("link", { name: "Ann Bolt" })).toHaveAttribute(
    "href",
    "/contacts/7",
  );
  expect(rows[2]).toHaveTextContent("Cy DaleQualified");
  expect(screen.getByText("2 contacts: 1 leads, 1 qualified, 0 customers")).toBeInTheDocument();
  const filters = screen.getByRole("group", { name: "Filter by status" });
  const all = within(filters).getByRole("button", { name: /^All/ });
  expect(all).toHaveAttribute("aria-pressed", "true");
  expect(all).toHaveTextContent("2");
  expect(within(filters).getByRole("button", { name: /^Qualified/ })).toHaveTextContent("1");
});

test("a status filter asks for that status only and says when there are none", async () => {
  const calls = mockApi({
    ...routes,
    "GET /contacts?status=customer": { items: [], total: 0, status_counts: counts },
  });
  renderApp("/contacts");
  await table();
  await userEvent.click(screen.getByRole("button", { name: /^Customer/ }));
  expect(await screen.findByText("No customer contacts yet.")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /^Customer/ })).toHaveAttribute("aria-pressed", "true");
  expect(calls.map((c) => c.path)).toContain("/contacts?status=customer");
  await userEvent.click(screen.getByRole("button", { name: /^All/ }));
  expect(await table()).toBeInTheDocument();
});

test("clicking a row opens the contact", async () => {
  mockApi({
    ...routes,
    "GET /contacts/8": { ...cy, organization: null, deals: [] },
    "GET /contacts/8/timeline": { items: [] },
  });
  renderApp("/contacts");
  await userEvent.click(within(await table()).getByText("Cy Dale"));
  expect(await screen.findByRole("heading", { name: "Cy Dale" })).toBeInTheDocument();
});

test("Add contact opens a panel that saves the new contact and closes", async () => {
  const calls = mockApi({
    ...routes,
    "POST /contacts": (body: unknown) => ({
      status: 201,
      body: { ...contactRow({ id: 9 }), ...(body as object) },
    }),
  });
  renderApp("/contacts");
  await table();
  await userEvent.click(screen.getAllByRole("button", { name: "Add contact" })[0]);
  const panel = await dialog("Add contact");
  await waitFor(() => expect(within(panel).getByLabelText(/Name/)).toHaveFocus());
  await userEvent.type(within(panel).getByLabelText(/Name/), "Dee Park");
  await userEvent.click(within(panel).getByRole("button", { name: "Add contact" }));
  expect(await screen.findByText("Added Dee Park.")).toBeInTheDocument();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(calls).toContainEqual(
    expect.objectContaining({
      method: "POST",
      path: "/contacts",
      body: expect.objectContaining({ name: "Dee Park", status: "lead" }),
    }),
  );
});

test("Edit opens the contact in a panel that Escape, Close and Cancel each close", async () => {
  mockApi(routes);
  renderApp("/contacts");
  await table();
  const open = async () => {
    await userEvent.click(screen.getByRole("button", { name: "Edit Ann Bolt" }));
    return dialog("Edit contact");
  };
  let panel = await open();
  expect(within(panel).getByLabelText(/Name/)).toHaveValue("Ann Bolt");
  await userEvent.keyboard("{Escape}");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Edit Ann Bolt" })).toHaveFocus();

  panel = await open();
  await userEvent.click(within(panel).getByRole("button", { name: "Close" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

  panel = await open();
  await userEvent.click(within(panel).getByRole("button", { name: "Cancel" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

test("Delete asks first, naming what happens, then deletes the contact", async () => {
  let deleted = false;
  const calls = mockApi({
    ...routes,
    "GET /contacts": () => ({
      body: deleted ? { ...list([cy]), status_counts: counts } : contacts,
    }),
    "GET /contacts/7/delete-impact": { name: "Ann Bolt", deals: 1, activities: 2 },
    "DELETE /contacts/7": () => {
      deleted = true;
      return { status: 204 };
    },
  });
  renderApp("/contacts");
  await table();
  await userEvent.click(screen.getByRole("button", { name: "Delete Ann Bolt" }));
  const confirm = await screen.findByRole("alertdialog", { name: "Delete Ann Bolt?" });
  expect(confirm).toHaveTextContent(
    "Ann Bolt is the main contact on 1 deal. They'll be kept, with no main contact. 2 activities logged on Ann Bolt will be deleted.",
  );
  await userEvent.click(within(confirm).getByRole("button", { name: "Delete contact" }));
  expect(await screen.findByText("Deleted Ann Bolt.")).toBeInTheDocument();
  expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  await waitFor(() => expect(screen.queryByText("Ann Bolt")).not.toBeInTheDocument());
  expect(calls).toContainEqual({ method: "DELETE", path: "/contacts/7", body: undefined });
});

test("Cancel on the delete question keeps the contact", async () => {
  const calls = mockApi({
    ...routes,
    "GET /contacts/8/delete-impact": { name: "Cy Dale", deals: 0, activities: 0 },
  });
  renderApp("/contacts");
  await table();
  await userEvent.click(screen.getByRole("button", { name: "Delete Cy Dale" }));
  const confirm = await screen.findByRole("alertdialog", { name: "Delete Cy Dale?" });
  expect(confirm).toHaveTextContent("Cy Dale has no deals or activities.");
  await userEvent.click(within(confirm).getByRole("button", { name: "Cancel" }));
  expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  expect(calls.some((c) => c.method === "DELETE")).toBe(false);
});

test("a delete that can't be checked or can't be done says why", async () => {
  mockApi({
    ...routes,
    "GET /contacts/8/delete-impact": () => ({
      status: 404,
      body: { message: "That contact is gone." },
    }),
    "GET /contacts/7/delete-impact": { name: "Ann Bolt", deals: 0, activities: 0 },
    "DELETE /contacts/7": () => ({ status: 409, body: { message: "Ann Bolt is in use." } }),
  });
  renderApp("/contacts");
  await table();
  await userEvent.click(screen.getByRole("button", { name: "Delete Cy Dale" }));
  expect(
    await screen.findByText("Couldn't delete Cy Dale. That contact is gone."),
  ).toBeInTheDocument();
  expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();

  await userEvent.click(screen.getByRole("button", { name: "Delete Ann Bolt" }));
  const confirm = await screen.findByRole("alertdialog", { name: "Delete Ann Bolt?" });
  await userEvent.click(within(confirm).getByRole("button", { name: "Delete contact" }));
  expect(
    await screen.findByText("Couldn't delete Ann Bolt. Ann Bolt is in use."),
  ).toBeInTheDocument();
});

test("a list that fails to load says so", async () => {
  mockApi({ "GET /contacts": () => ({ status: 500, body: {} }) });
  renderApp("/contacts");
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Couldn't load this list of contacts.",
  );
});
