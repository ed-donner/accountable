// TF13: an activity can be filled in and saved with the keyboard alone.
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockApi, renderWithProviders } from "../shared/test-utils";
import { localToday } from "../shared/today";
import type { TimelineEntry } from "./hooks";
import { LogActivityForm } from "./LogActivityForm";

afterEach(() => vi.unstubAllGlobals());

test("log an email with a follow-up using only the keyboard", async () => {
  const calls = mockApi({
    "POST /activities": { status: 201, body: { id: 1 } },
  });
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

// RV2 (TM02): the type reads as a labelled choice in both places the form appears.
const entry: TimelineEntry = {
  kind: "activity",
  id: 5,
  on: "2026-11-03",
  at: "2026-11-03T10:00:00",
  text: "Budget approved",
  type: "note",
  description: "Budget approved",
  occurred_on: "2026-11-03",
  follow_up_on: null,
  done: false,
};

test.each([
  ["logging", () => <LogActivityForm on={{ contactId: 7 }} />, "call"],
  ["editing", () => <LogActivityForm entry={entry} />, "note"],
] as const)(
  "when %s, the type is a group labelled Type with the current one chosen",
  (_when, form, current) => {
    renderWithProviders(form());
    const group = screen.getByRole("radiogroup", { name: "Type" });
    expect(screen.getByText("Type", { selector: ".label" })).toBeVisible();
    const radios = within(group).getAllByRole("radio");
    expect(radios.map((r) => r.getAttribute("value"))).toEqual(["call", "email", "note"]);
    expect(within(group).getByRole("radio", { checked: true })).toHaveAttribute("value", current);
  },
);

test("both forms on one page keep their own type: the edit panel doesn't change the log form", async () => {
  renderWithProviders(
    <>
      <LogActivityForm on={{ contactId: 7 }} />
      <LogActivityForm entry={entry} />
    </>,
  );
  const [log, edit] = screen.getAllByRole("radiogroup", { name: "Type" });
  await userEvent.click(within(edit).getByText("Email"));
  expect(within(edit).getByRole("radio", { name: "Email" })).toBeChecked();
  expect(within(log).getByRole("radio", { name: "Call" })).toBeChecked();
});

test("clicking anywhere on a type chooses it, and arrows move through all three and wrap", async () => {
  renderWithProviders(<LogActivityForm on={{ contactId: 7 }} />);
  const user = userEvent.setup();
  for (const name of ["Note", "Email", "Call"]) {
    await user.click(screen.getByText(name));
    expect(screen.getByRole("radio", { name })).toBeChecked();
  }
  screen.getByRole("radio", { name: "Call" }).focus();
  for (const name of ["Email", "Note", "Call"]) {
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("radio", { name })).toBeChecked();
  }
  await user.keyboard("{ArrowLeft}");
  expect(screen.getByRole("radio", { name: "Note" })).toBeChecked();
});

test("after logging, the next one starts with the type just used", async () => {
  const calls = mockApi({
    "POST /activities": { status: 201, body: { id: 1 } },
  });
  renderWithProviders(<LogActivityForm on={{ dealId: 3 }} />);
  const user = userEvent.setup();
  await user.click(screen.getByText("Note"));
  await user.type(screen.getByLabelText(/What happened/), "Left a note{Enter}");
  await waitFor(() => expect(calls).toHaveLength(1));
  expect(calls[0].body).toMatchObject({
    type: "note",
    deal_id: 3,
    contact_id: null,
  });
  await waitFor(() => expect(screen.getByLabelText(/What happened/)).toHaveValue(""));
  expect(screen.getByRole("radio", { name: "Note" })).toBeChecked();
});

test("an edit saves the type that was chosen", async () => {
  const calls = mockApi({ "PATCH /activities/5": { body: { id: 5 } } });
  renderWithProviders(<LogActivityForm entry={entry} />);
  await userEvent.click(screen.getByText("Email"));
  await userEvent.click(screen.getByRole("button", { name: "Save activity" }));
  await waitFor(() => expect(calls).toHaveLength(1));
  expect(calls[0]).toMatchObject({
    method: "PATCH",
    path: "/activities/5",
    body: { type: "email" },
  });
});
