// O1, O2, T4, T6: the organizations list and adding, editing and deleting one.
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { list, mockApi, organizationRow, renderApp } from "../shared/test-utils";

afterEach(() => vi.unstubAllGlobals());

const bolt = organizationRow();
const acme = organizationRow({
  id: 3,
  name: "Acme Ltd",
  website: null,
  industry: "Manufacturing",
  contact_count: 0,
  open_deal_count: 0,
  open_value: 0,
});
const routes = { "GET /organizations": list([bolt, acme]) };

const table = () => screen.findByRole("table");

test("the list shows each organization's figures, with its website as a link", async () => {
  mockApi(routes);
  renderApp("/organizations");
  const rows = within(await table()).getAllByRole("row");
  expect(rows[1]).toHaveTextContent("Acme LtdManufacturing00$0");
  expect(rows[2]).toHaveTextContent("Bolt FreightLogisticsbolt.example11$10,000");
  expect(within(rows[2]).getByRole("link", { name: "bolt.example" })).toHaveAttribute(
    "href",
    "https://bolt.example",
  );
  expect(within(rows[2]).getByRole("link", { name: "Bolt Freight" })).toHaveAttribute(
    "href",
    "/organizations/2",
  );
  expect(screen.getByText("2 organizations")).toBeInTheDocument();
});

test("clicking a row opens the organization", async () => {
  mockApi({
    ...routes,
    "GET /organizations/3": { ...acme, contacts: [], deals: [] },
  });
  renderApp("/organizations");
  await userEvent.click(within(await table()).getByText("Manufacturing"));
  expect(await screen.findByRole("heading", { name: "Acme Ltd" })).toBeInTheDocument();
});

test("Add organization saves the new one, offering the industries already in use", async () => {
  const calls = mockApi({
    ...routes,
    "POST /organizations": (body: unknown) => ({
      status: 201,
      body: { ...organizationRow({ id: 9 }), ...(body as object) },
    }),
  });
  renderApp("/organizations");
  await table();
  await userEvent.click(screen.getAllByRole("button", { name: "Add organization" })[0]);
  const panel = await screen.findByRole("dialog", { name: "Add organization" });
  const suggestions = within(panel).getByLabelText("Industry").getAttribute("list");
  expect(
    [...document.querySelectorAll(`#${suggestions} option`)].map((o) => o.getAttribute("value")),
  ).toEqual(["Logistics", "Manufacturing"]);
  await userEvent.type(within(panel).getByLabelText(/Name/), "  Cove Foods ");
  await userEvent.type(within(panel).getByLabelText("Website"), "cove.example");
  await userEvent.click(within(panel).getByRole("button", { name: "Add organization" }));
  expect(await screen.findByText("Added Cove Foods.")).toBeInTheDocument();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(calls).toContainEqual({
    method: "POST",
    path: "/organizations",
    body: { name: "Cove Foods", website: "cove.example", industry: null, notes: null },
  });
});

test("a name is required before anything is sent", async () => {
  const calls = mockApi(routes);
  renderApp("/organizations");
  await table();
  await userEvent.click(screen.getAllByRole("button", { name: "Add organization" })[0]);
  const panel = await screen.findByRole("dialog", { name: "Add organization" });
  await userEvent.click(within(panel).getByRole("button", { name: "Add organization" }));
  expect(await within(panel).findByText(/Enter a name/)).toBeInTheDocument();
  expect(calls.some((c) => c.method === "POST")).toBe(false);
});

test("Edit saves changes, and a rejected save shows the server's reason on the field", async () => {
  let attempts = 0;
  mockApi({
    ...routes,
    "PATCH /organizations/2": (body: unknown) => {
      attempts += 1;
      return attempts === 1
        ? {
            status: 409,
            body: { message: "Check the form.", fields: { name: "That name is taken." } },
          }
        : { body: { ...bolt, ...(body as object) } };
    },
  });
  renderApp("/organizations");
  await table();
  await userEvent.click(screen.getByRole("button", { name: "Edit Bolt Freight" }));
  const panel = await screen.findByRole("dialog", { name: "Edit organization" });
  const name = within(panel).getByLabelText(/Name/);
  expect(name).toHaveValue("Bolt Freight");
  expect(within(panel).getByLabelText("Industry")).toHaveValue("Logistics");
  await userEvent.clear(name);
  await userEvent.type(name, "Acme Ltd");
  await userEvent.click(within(panel).getByRole("button", { name: "Save organization" }));
  expect(await within(panel).findByText("That name is taken.")).toBeInTheDocument();
  await userEvent.clear(name);
  await userEvent.type(name, "Bolt Logistics");
  await userEvent.click(within(panel).getByRole("button", { name: "Save organization" }));
  expect(await screen.findByText("Saved Bolt Logistics.")).toBeInTheDocument();
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
});

test("Delete asks first, saying linked records are kept, then deletes", async () => {
  const calls = mockApi({
    ...routes,
    "GET /organizations/2/delete-impact": { name: "Bolt Freight", contacts: 1, deals: 2 },
    "DELETE /organizations/2": () => ({ status: 204 }),
  });
  renderApp("/organizations");
  await table();
  await userEvent.click(screen.getByRole("button", { name: "Delete Bolt Freight" }));
  const confirm = await screen.findByRole("alertdialog", { name: "Delete Bolt Freight?" });
  expect(confirm).toHaveTextContent(
    "Bolt Freight has 1 contact and 2 deals. They'll be kept, with no organization.",
  );
  await userEvent.click(within(confirm).getByRole("button", { name: "Delete organization" }));
  expect(await screen.findByText("Deleted Bolt Freight.")).toBeInTheDocument();
  expect(calls).toContainEqual({ method: "DELETE", path: "/organizations/2", body: undefined });
});

test("a list that fails to load says so", async () => {
  mockApi({ "GET /organizations": () => ({ status: 500, body: {} }) });
  renderApp("/organizations");
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Couldn't load this list of organizations.",
  );
});
