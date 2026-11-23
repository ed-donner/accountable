// C5, D9, A6: a record's timeline, newest first, with edit, delete and Mark done.
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockApi, renderWithProviders, timelineEntry } from "../shared/test-utils";
import { localToday } from "../shared/today";
import { Timeline } from "./Timeline";

afterEach(() => vi.unstubAllGlobals());

const call = timelineEntry({
  follow_up_on: localToday(),
  follow_up_status: "upcoming",
  deal: { id: 5, name: "Fleet renewal" },
});
const email = timelineEntry({
  id: 31,
  type: "email",
  text: "Sent the quote",
  description: "Sent the quote",
  follow_up_on: "2026-01-04",
  follow_up_status: "done",
  done: true,
});
const move = timelineEntry({
  kind: "stage_change",
  id: 3,
  text: "Moved from New to Proposal",
  type: null,
  from_stage: "new",
  to_stage: "proposal",
});
const items = { items: [call, email, move] };

function show(kind: "contact" | "deal", extra = {}) {
  const calls = mockApi({ [`GET /${kind}s/7/timeline`]: items, ...extra });
  renderWithProviders(<Timeline kind={kind} id={7} />);
  return calls;
}

const timeline = () => screen.findByRole("list");

test("each entry shows what happened, when, and its follow-up", async () => {
  show("contact");
  const [first, second, third] = within(await timeline()).getAllByRole("listitem");
  expect(first).toHaveTextContent("CallCalled about the renewal");
  expect(within(first).getByLabelText("Follow-up Today, due")).toBeInTheDocument();
  expect(first).toHaveTextContent("3 Nov 2026");
  expect(second).toHaveTextContent("EmailSent the quote");
  expect(within(second).getByLabelText("Follow-up 4 Jan, done")).toBeInTheDocument();
  expect(within(second).queryByRole("button", { name: "Mark done" })).not.toBeInTheDocument();
  expect(third).toHaveTextContent("Stage changeMoved from New to Proposal");
  expect(within(third).queryByRole("button")).not.toBeInTheDocument();
});

test("on a contact, an entry links to its deal", async () => {
  show("contact");
  expect(within(await timeline()).getByRole("link", { name: "Fleet renewal" })).toHaveAttribute(
    "href",
    "/deals/5",
  );
});

test("on the deal itself, an entry doesn't link back to it", async () => {
  show("deal");
  await timeline();
  expect(screen.queryByRole("link", { name: "Fleet renewal" })).not.toBeInTheDocument();
});

test("Mark done saves the follow-up as done and says so", async () => {
  const calls = show("contact", { "PATCH /activities/30": { id: 30 } });
  await userEvent.click(within(await timeline()).getByRole("button", { name: "Mark done" }));
  expect(await screen.findByText("Follow-up marked done.")).toBeInTheDocument();
  expect(calls).toContainEqual({ method: "PATCH", path: "/activities/30", body: { done: true } });
});

test("a Mark done that fails says why", async () => {
  show("contact", {
    "PATCH /activities/30": () => ({ status: 400, body: { message: "Already done." } }),
  });
  await userEvent.click(within(await timeline()).getByRole("button", { name: "Mark done" }));
  expect(
    await screen.findByText("Couldn't mark the follow-up done. Already done."),
  ).toBeInTheDocument();
});

test("Edit opens the activity in a panel, filled in", async () => {
  show("deal");
  await timeline();
  await userEvent.click(screen.getByRole("button", { name: "Edit email: Sent the quote" }));
  const panel = await screen.findByRole("dialog", { name: "Edit activity" });
  expect(within(panel).getByLabelText(/What happened/)).toHaveValue("Sent the quote");
  await userEvent.click(within(panel).getByRole("button", { name: "Cancel" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

test("Delete asks first, then deletes the activity", async () => {
  const calls = show("deal", { "DELETE /activities/30": () => ({ status: 204 }) });
  await timeline();
  await userEvent.click(
    screen.getByRole("button", { name: "Delete call: Called about the renewal" }),
  );
  const confirm = screen.getByRole("alertdialog", { name: "Delete this activity?" });
  expect(confirm).toHaveTextContent(
    "The call “Called about the renewal” will be deleted. This can't be undone.",
  );
  await userEvent.click(within(confirm).getByRole("button", { name: "Delete activity" }));
  expect(await screen.findByText("Activity deleted.")).toBeInTheDocument();
  expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  expect(calls).toContainEqual({ method: "DELETE", path: "/activities/30", body: undefined });
});

test("a delete that fails says why and leaves the question open", async () => {
  show("deal", {
    "DELETE /activities/30": () => ({ status: 404, body: { message: "It's already gone." } }),
  });
  await timeline();
  await userEvent.click(
    screen.getByRole("button", { name: "Delete call: Called about the renewal" }),
  );
  const confirm = screen.getByRole("alertdialog");
  await userEvent.click(within(confirm).getByRole("button", { name: "Delete activity" }));
  expect(
    await screen.findByText("Couldn't delete the activity. It's already gone."),
  ).toBeInTheDocument();
  await userEvent.click(within(confirm).getByRole("button", { name: "Cancel" }));
  await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
});

test("an empty timeline invites the first entry", async () => {
  mockApi({ "GET /deals/7/timeline": { items: [] } });
  renderWithProviders(<Timeline kind="deal" id={7} />);
  expect(await screen.findByText(/Nothing logged yet/)).toBeInTheDocument();
});

test("a timeline that fails to load says so", async () => {
  mockApi({ "GET /deals/7/timeline": () => ({ status: 500, body: {} }) });
  renderWithProviders(<Timeline kind="deal" id={7} />);
  expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't load this timeline.");
});
