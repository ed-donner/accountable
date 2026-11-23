// D1, D2, T4, T6: the deals list, its stage filter, and adding, editing and deleting.
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  contactRow,
  dealRow,
  list,
  mockApi,
  organizationRow,
  renderApp,
} from "../shared/test-utils";

afterEach(() => vi.unstubAllGlobals());

const renewal = dealRow({ is_late: true });
const parts = dealRow({
  id: 2,
  name: "Spare parts",
  stage: "won",
  value: 2500,
  probability: 100,
  expected_revenue: 2500,
  organization_id: null,
  organization_name: null,
  contact_id: null,
  contact_name: null,
  close_date: "2026-10-02",
});
const older = dealRow({ ...parts, id: 3, name: "Old parts", close_date: "2026-03-01" });

const routes = {
  "GET /deals": list([renewal, parts]),
  "GET /organizations": list([organizationRow()]),
  "GET /contacts": {
    ...list([contactRow()]),
    status_counts: { all: 1, lead: 1, qualified: 0, customer: 0 },
  },
};

const table = () => screen.findByRole("table");
const names = () =>
  within(screen.getByRole("table"))
    .getAllByRole("row")
    .slice(1)
    .map((row) => within(row).getAllByRole("cell")[0].textContent);

test("the list shows each deal's figures, with Late on deals past their close date", async () => {
  mockApi(routes);
  renderApp("/deals");
  const rows = within(await table()).getAllByRole("row");
  expect(rows[1]).toHaveTextContent(
    "Fleet renewalLateBolt FreightAnn BoltProposal$10,00050%$5,0001 Dec 2026",
  );
  expect(within(rows[1]).getByRole("link", { name: "Fleet renewal" })).toHaveAttribute(
    "href",
    "/deals/1",
  );
  expect(rows[2]).toHaveTextContent("Spare partsWon$2,500100%$2,5002 Oct 2026");
  expect(screen.getByText("2 deals")).toBeInTheDocument();
});

test("the stage filter lists one stage, newest closed first for won deals", async () => {
  mockApi({ ...routes, "GET /deals?stage=won": list([older, parts]) });
  renderApp("/deals");
  await table();
  await userEvent.selectOptions(screen.getByLabelText("Filter by stage"), "Won");
  expect(await screen.findByText("2 deals in Won")).toBeInTheDocument();
  expect(names()).toEqual(["Spare parts", "Old parts"]);
  await userEvent.selectOptions(screen.getByLabelText("Filter by stage"), "All stages");
  expect(await screen.findByText("2 deals")).toBeInTheDocument();
});

test("a stage with no deals says so", async () => {
  mockApi({ ...routes, "GET /deals?stage=lost": list([]) });
  renderApp("/deals?stage=lost");
  expect(await screen.findByText("No deals at this stage yet.")).toBeInTheDocument();
  expect(screen.getByText("0 deals in Lost")).toBeInTheDocument();
});

test("clicking a row opens the deal", async () => {
  mockApi({
    ...routes,
    "GET /deals/2": parts,
    "GET /deals/2/timeline": { items: [] },
  });
  renderApp("/deals");
  await userEvent.click(within(await table()).getByText("Spare parts"));
  expect(await screen.findByRole("heading", { name: "Spare parts" })).toBeInTheDocument();
});

test("Add deal on a filtered list starts the new deal in that stage", async () => {
  mockApi({ ...routes, "GET /deals?stage=negotiation": list([]) });
  renderApp("/deals?stage=negotiation");
  await screen.findByText("No deals at this stage yet.");
  await userEvent.click(screen.getAllByRole("button", { name: "Add deal" })[0]);
  const panel = await screen.findByRole("dialog", { name: "Add deal" });
  await waitFor(() =>
    expect(within(panel).getByLabelText(/Stage/)).toHaveDisplayValue("Negotiation"),
  );
});

test("Edit opens the deal in a panel, filled in", async () => {
  mockApi(routes);
  renderApp("/deals");
  await table();
  await userEvent.click(screen.getByRole("button", { name: "Edit Fleet renewal" }));
  const panel = await screen.findByRole("dialog", { name: "Edit deal" });
  expect(await within(panel).findByLabelText(/Name/)).toHaveValue("Fleet renewal");
  await userEvent.keyboard("{Escape}");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

test("Delete asks first, naming what goes with it, then deletes the deal", async () => {
  const calls = mockApi({
    ...routes,
    "GET /deals/1/delete-impact": { name: "Fleet renewal", activities: 2, stage_changes: 1 },
    "DELETE /deals/1": () => ({ status: 204 }),
  });
  renderApp("/deals");
  await table();
  await userEvent.click(screen.getByRole("button", { name: "Delete Fleet renewal" }));
  const confirm = await screen.findByRole("alertdialog", { name: "Delete Fleet renewal?" });
  expect(confirm).toHaveTextContent(
    "Fleet renewal has 2 activities and 1 stage change. They'll be deleted with it.",
  );
  await userEvent.click(within(confirm).getByRole("button", { name: "Delete deal" }));
  expect(await screen.findByText("Deleted Fleet renewal.")).toBeInTheDocument();
  expect(calls).toContainEqual({ method: "DELETE", path: "/deals/1", body: undefined });
});

test("a list that fails to load says so", async () => {
  mockApi({ "GET /deals": () => ({ status: 500, body: {} }) });
  renderApp("/deals");
  expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't load this list of deals.");
});
