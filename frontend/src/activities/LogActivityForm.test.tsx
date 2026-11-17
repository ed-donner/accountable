// TF13: an activity can be filled in and saved with the keyboard alone.
import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockApi, renderWithProviders } from "../shared/test-utils";
import { localToday } from "../shared/today";
import { LogActivityForm } from "./LogActivityForm";

afterEach(() => vi.unstubAllGlobals());

test("log an email with a follow-up using only the keyboard", async () => {
  const calls = mockApi({ "POST /activities": { status: 201, body: { id: 1 } } });
  renderWithProviders(<LogActivityForm on={{ contactId: 7 }} />);
  const user = userEvent.setup();

  // Tab into the type choice, arrow to Email, then Tab through the fields.
  await user.tab();
  expect(screen.getByRole("radio", { name: "Call" })).toHaveFocus();
  await user.keyboard("{ArrowRight}");
  expect(screen.getByRole("radio", { name: "Email" })).toBeChecked();
  await user.tab();
  expect(screen.getByLabelText(/What happened/)).toHaveFocus();
  await user.keyboard("Sent the proposal");
  await user.tab();
  const followUp = screen.getByLabelText("Follow-up date");
  expect(followUp).toHaveFocus();
  // jsdom has no date picker, so the typed date lands as a change on the focused field.
  fireEvent.change(followUp, { target: { value: "2026-11-20" } });
  await user.keyboard("{Enter}");

  await waitFor(() => expect(calls).toHaveLength(1));
  expect(calls[0]).toMatchObject({
    method: "POST",
    path: "/activities",
    body: {
      type: "email",
      description: "Sent the proposal",
      occurred_on: localToday(),
      follow_up_on: "2026-11-20",
      contact_id: 7,
      deal_id: null,
    },
  });
  // Ready for the next one, with the cursor back in the description.
  await waitFor(() => expect(screen.getByLabelText(/What happened/)).toHaveValue(""));
  await waitFor(() => expect(screen.getByLabelText(/What happened/)).toHaveFocus());
});

test("description is required", async () => {
  const calls = mockApi({});
  renderWithProviders(<LogActivityForm on={{ dealId: 3 }} />);
  await userEvent.click(screen.getByRole("button", { name: "Log activity" }));
  expect(await screen.findByText("Enter a description.")).toBeInTheDocument();
  expect(calls).toHaveLength(0);
});
