// A failed list of organizations says so and can be retried, keeping what was typed.
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockApi, renderWithProviders } from "../shared/test-utils";
import { ContactForm } from "./ContactForm";

afterEach(() => vi.unstubAllGlobals());

const organizations = {
  items: [{ id: 2, name: "Bolt Freight", industry: null, website: null, notes: null, contact_count: 0, open_deal_count: 0, open_value: 0 }],
  total: 1,
};

test("a list that fails to load says so and can be retried, keeping what was typed", async () => {
  let failing = true;
  mockApi({
    "GET /organizations": () =>
      failing ? { status: 500, body: { message: "Something went wrong.", fields: {} } } : { body: organizations },
  });
  renderWithProviders(<ContactForm organizationId={2} onSaved={vi.fn()} onCancel={vi.fn()} />);
  const alert = await screen.findByText(/Couldn't load the organizations\./);
  await userEvent.type(screen.getByLabelText(/Name/), "Ann Bolt");
  failing = false;
  await userEvent.click(within(alert).getByRole("button", { name: "Retry" }));
  await screen.findByRole("option", { name: "Bolt Freight" });
  await waitFor(() => expect(screen.getByLabelText(/Organization/)).toHaveDisplayValue("Bolt Freight"));
  expect(screen.getByLabelText(/Name/)).toHaveValue("Ann Bolt");
});
