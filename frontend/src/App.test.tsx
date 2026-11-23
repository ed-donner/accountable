// The app's frame: the sidebar takes you to each section, and a bad link says so.
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { list, mockApi, organizationRow, renderApp } from "./shared/test-utils";

afterEach(() => vi.unstubAllGlobals());

test("the sidebar names the app and marks the section you're in", async () => {
  mockApi({ "GET /organizations": list([organizationRow()]) });
  renderApp("/organizations");
  const nav = screen.getByRole("navigation", { name: "Sections" });
  expect(screen.getByText("Accountable")).toBeInTheDocument();
  expect(
    within(nav)
      .getAllByRole("link")
      .map((link) => link.textContent),
  ).toEqual(["Dashboard", "Pipeline", "Deals", "Contacts", "Organizations"]);
  expect(within(nav).getByRole("link", { name: "Organizations" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  expect(within(nav).getByRole("link", { name: "Dashboard" })).not.toHaveAttribute("aria-current");
  expect(await screen.findByRole("heading", { name: "Organizations" })).toBeInTheDocument();
});

test("a sidebar link opens its section", async () => {
  mockApi({
    "GET /organizations": list([organizationRow()]),
    "GET /deals": list([]),
  });
  renderApp("/organizations");
  await userEvent.click(screen.getByRole("link", { name: "Deals" }));
  expect(await screen.findByRole("heading", { name: "Deals" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Deals" })).toHaveAttribute("aria-current", "page");
});

test("a link to nowhere says so and offers the way back", () => {
  mockApi({});
  renderApp("/no-such-page");
  expect(screen.getByRole("heading", { name: "We couldn't find that page" })).toBeInTheDocument();
  expect(
    screen.getByText(/It may have been deleted, or the link may be wrong/),
  ).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Go to the dashboard" })).toHaveAttribute("href", "/");
});
