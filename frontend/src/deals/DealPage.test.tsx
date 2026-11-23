// D9: a deal's details, organization, main contact and timeline, with edit and delete.
import { screen, within } from "@testing-library/react";
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

function open(deal: Schemas["DealRow"], extra = {}) {
  const calls = mockApi({
    [`GET /deals/${deal.id}`]: deal,
    [`GET /deals/${deal.id}/timeline`]: { items: [] },
    "GET /deals": list([deal]),
    "GET /organizations": list([organizationRow()]),
    "GET /contacts": {
      ...list([contactRow()]),
      status_counts: { all: 1, lead: 1, qualified: 0, customer: 0 },
    },
    ...extra,
  });
  renderApp(`/deals/${deal.id}`);
  return calls;
}

const details = () => screen.findByRole("region", { name: "Details" });

test("the details show the deal's figures and link to its organization and contact", async () => {
  open(dealRow({ is_late: true }));
  const panel = await details();
  expect(screen.getByRole("heading", { name: "Fleet renewal" })).toBeInTheDocument();
  expect(within(panel).getByRole("link", { name: "Bolt Freight" })).toHaveAttribute(
    "href",
    "/organizations/2",
  );
  expect(within(panel).getByRole("link", { name: "Ann Bolt" })).toHaveAttribute(
    "href",
    "/contacts/7",
  );
  expect(panel).toHaveTextContent(
    "StageProposalValue$10,000Probability50%Expected$5,000Close date1 Dec 2026Late",
  );
  expect(screen.queryByText(/This deal has no organization/)).not.toBeInTheDocument();
  expect(await screen.findByText(/Nothing logged yet/)).toBeInTheDocument();
});

test("a closed deal with nothing linked says what's missing", async () => {
  open(
    dealRow({
      stage: "lost",
      organization_id: null,
      organization_name: null,
      contact_id: null,
      contact_name: null,
      close_date: null,
    }),
  );
  const panel = await details();
  expect(panel).toHaveTextContent("No organization");
  expect(panel).toHaveTextContent("No main contact");
  expect(panel).toHaveTextContent("ClosedNot set");
  expect(
    screen.getByText("This deal has no organization. Edit it to choose one."),
  ).toBeInTheDocument();
});

test("Edit opens the deal's form, filled in", async () => {
  open(dealRow());
  await details();
  await userEvent.click(screen.getByRole("button", { name: "Edit" }));
  const panel = await screen.findByRole("dialog", { name: "Edit deal" });
  expect(await within(panel).findByLabelText(/Name/)).toHaveValue("Fleet renewal");
  await userEvent.click(within(panel).getByRole("button", { name: "Close" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

test("deleting the deal goes back to the deals list", async () => {
  open(dealRow(), {
    "GET /deals/1/delete-impact": { name: "Fleet renewal", activities: 0, stage_changes: 0 },
    "DELETE /deals/1": () => ({ status: 204 }),
  });
  await details();
  await userEvent.click(screen.getByRole("button", { name: "Delete deal" }));
  const confirm = await screen.findByRole("alertdialog", { name: "Delete Fleet renewal?" });
  expect(confirm).toHaveTextContent("Fleet renewal will be deleted. This can't be undone.");
  await userEvent.click(within(confirm).getByRole("button", { name: "Delete deal" }));
  expect(await screen.findByRole("heading", { name: "Deals" })).toBeInTheDocument();
});

test("a deal that isn't there says so", async () => {
  mockApi({ "GET /deals/9": () => ({ status: 404, body: { message: "Not found." } }) });
  renderApp("/deals/9");
  expect(
    await screen.findByRole("heading", { name: "We couldn't find that deal" }),
  ).toBeInTheDocument();
});
