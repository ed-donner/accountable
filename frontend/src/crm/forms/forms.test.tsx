import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import { toast } from "sonner";
import { describe, expect, it, vi } from "vitest";

import { META, mockApi, renderApp, user } from "../../test-utils";
import type { ContactDetail, Deal, OrganizationDetail, TimelineEntry } from "../queries";
import { EditActivity, LogActivity } from "./ActivityForm";
import { ContactForm } from "./ContactForm";
import { DealForm } from "./DealForm";
import { DeleteActivity, DeleteContact, DeleteDeal, DeleteOrganization } from "./DeleteDialogs";
import { OrganizationForm } from "./OrganizationForm";

const ORGANIZATIONS = [{ id: 1, name: "Harbor & Pine" }];
const CONTACTS = [{ id: 11, name: "Sam Carter", organization_id: 1, organization_name: "Harbor & Pine" }];
const READS = { "GET /meta": META, "GET /organizations": ORGANIZATIONS, "GET /contacts": CONTACTS };

const ORGANIZATION: OrganizationDetail = {
  id: 1,
  name: "Harbor & Pine",
  website: null,
  industry: null,
  notes: null,
  contacts: [],
  deals: [],
  created_at: "2026-10-12T12:00:00Z",
  created_by: null,
  updated_at: "2026-10-12T12:00:00Z",
  updated_by: null,
};
const CONTACT: ContactDetail = {
  id: 11,
  name: "Sam Carter",
  email: null,
  phone: null,
  job_title: null,
  organization_id: 1,
  organization_name: "Harbor & Pine",
  status: "lead",
  deals: [],
  created_at: "2026-10-12T12:00:00Z",
  created_by: null,
  updated_at: "2026-10-12T12:00:00Z",
  updated_by: null,
};
const DEAL: Deal = {
  id: 5,
  name: "Annual support",
  organization_id: 1,
  organization_name: "Harbor & Pine",
  main_contact_id: 11,
  main_contact_name: "Sam Carter",
  stage: "proposal",
  value: 36000,
  probability: 33,
  expected_revenue: 11880,
  close_date: "2026-12-18",
  position: 0,
};
const ENTRY: TimelineEntry = {
  kind: "activity",
  id: 9,
  at: "2026-10-30T15:20:00Z",
  type: "call",
  description: "Called them",
  follow_up_date: "2026-11-20",
  follow_up_done: true,
  about: { kind: "deal", id: 5, name: "Annual support" },
  created_by: null,
};

type Case = {
  name: string;
  form: (onClose: () => void) => ReactElement;
  field: string;
  save: string;
  route: string;
  reply: unknown;
};

const FORMS: Case[] = [
  {
    name: "organization",
    form: (onClose) => <OrganizationForm record={ORGANIZATION} onClose={onClose} />,
    field: "Name",
    save: "Save organization",
    route: "PATCH /organizations/1",
    reply: ORGANIZATION,
  },
  {
    name: "contact",
    form: (onClose) => <ContactForm record={CONTACT} onClose={onClose} />,
    field: "Name",
    save: "Save contact",
    route: "PATCH /contacts/11",
    reply: CONTACT,
  },
  {
    name: "deal",
    form: (onClose) => <DealForm record={DEAL} onClose={onClose} />,
    field: "Name",
    save: "Save deal",
    route: "PATCH /deals/5",
    reply: DEAL,
  },
  {
    name: "activity",
    form: (onClose) => <EditActivity entry={ENTRY} onClose={onClose} />,
    field: "Description",
    save: "Save activity",
    route: "PATCH /activities/9",
    reply: { id: 9 },
  },
];

function box(label: string) {
  return screen.getByLabelText(label) as HTMLInputElement;
}

/**
 * Keeps every save unanswered until released. The stand-in backend answers at once,
 * which would finish the first save before a second press could overlap it.
 */
function holdSaves() {
  let release = () => undefined as void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const answer = globalThis.fetch;
  vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
    if (init.method && init.method !== "GET") await held;
    return answer(url, init);
  });
  return release;
}

async function retype(label: string, text: string) {
  await user().clear(box(label));
  await user().type(box(label), text);
}

describe.each(FORMS)("the $name form", ({ form, field, save, route, reply }) => {
  async function open(routes: Record<string, unknown>) {
    const calls = mockApi({ ...READS, ...routes });
    const onClose = vi.fn();
    const view = renderApp(form(onClose));
    await screen.findByLabelText(field);
    return { calls, onClose, ...view };
  }

  it("stays open with what was typed if the save fails, and says so", async () => {
    const failure = vi.spyOn(toast, "error");
    const { onClose } = await open({ [route]: () => ({ status: 500, body: { detail: "Something went wrong." } }) });
    await retype(field, "Better words");
    await user().click(screen.getByRole("button", { name: save }));

    await waitFor(() => expect(failure).toHaveBeenCalledWith("Something went wrong."));
    expect(onClose).not.toHaveBeenCalled();
    expect(box(field).value).toBe("Better words");
    expect((screen.getByRole("button", { name: save }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("can be saved again after a failure", async () => {
    let broken = true;
    const { onClose } = await open({
      [route]: () => (broken ? { status: 500, body: { detail: "Something went wrong." } } : { body: reply }),
    });
    await user().click(screen.getByRole("button", { name: save }));
    await waitFor(() => expect(toast.getHistory().length).toBeGreaterThan(0));
    broken = false;
    await user().click(screen.getByRole("button", { name: save }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("saves once, however quickly Save is pressed", async () => {
    const { calls, onClose } = await open({ [route]: reply });
    const release = holdSaves();
    await user().dblClick(screen.getByRole("button", { name: save }));
    release();
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const [method, path] = route.split(" ");
    expect(calls.filter((call) => call.method === method && call.path === path)).toHaveLength(1);
  });

  it("leaves what's typed alone when the data behind it refreshes", async () => {
    const { client } = await open({ [route]: reply });
    await retype(field, "Still typing");
    await act(() => client.invalidateQueries());
    expect(box(field).value).toBe("Still typing");
  });
});

describe("the contact form", () => {
  it("waits for the organizations, rather than showing an empty picker", async () => {
    let arrive = () => undefined as void;
    const held = new Promise<void>((resolve) => {
      arrive = resolve;
    });
    mockApi(READS);
    const answer = globalThis.fetch;
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      await held;
      return answer(url, init);
    });

    renderApp(<ContactForm onClose={vi.fn()} />);
    await act(async () => undefined);
    expect(screen.queryByRole("dialog")).toBeNull();

    arrive();
    await user().click(await screen.findByRole("combobox", { name: "Organization" }));
    expect(await screen.findByRole("option", { name: "Harbor & Pine" })).toBeTruthy();
  });

  it("closes and says so if the organizations can't be read, rather than showing none", async () => {
    const failure = vi.spyOn(toast, "error");
    const onClose = vi.fn();
    mockApi({ "GET /organizations": () => ({ status: 500, body: { detail: "Something went wrong." } }) });
    renderApp(<ContactForm onClose={onClose} />);
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(failure).toHaveBeenCalledWith("Couldn't open the form. Try again.", expect.anything());
  });

  it("keeps what's typed when a new organization is added from the picker", async () => {
    mockApi({ ...READS, "POST /organizations": { ...ORGANIZATION, id: 3, name: "Brand new" } });
    renderApp(<ContactForm onClose={vi.fn()} />);
    await screen.findByLabelText("Name");
    await user().type(box("Name"), "Typed name");
    await user().type(box("Email"), "typed@example.com");

    await user().click(screen.getByRole("combobox", { name: "Organization" }));
    await user().type(await screen.findByPlaceholderText("Search organizations"), "Brand new");
    await user().click(await screen.findByRole("option", { name: /Add "Brand new"/ }));
    await user().click(await screen.findByRole("button", { name: "Save organization" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Save organization" })).toBeNull());

    expect(box("Name").value).toBe("Typed name");
    expect(box("Email").value).toBe("typed@example.com");
  });
});

describe("the activity form", () => {
  it("shows a message for an error on the record it's logged against, which has no field here", async () => {
    const failure = vi.spyOn(toast, "error");
    const onClose = vi.fn();
    mockApi({
      "POST /activities": () => ({
        status: 422,
        body: { detail: "Check the form.", fields: { deal_id: "That record no longer exists" } },
      }),
    });
    renderApp(<LogActivity link={{ deal_id: 5 }} onClose={onClose} />);
    await user().type(await screen.findByLabelText("Description"), "Called them");
    await user().click(screen.getByRole("button", { name: "Save activity" }));

    await waitFor(() => expect(failure).toHaveBeenCalledWith("That record no longer exists"));
    expect(onClose).not.toHaveBeenCalled();
    expect(box("Description").value).toBe("Called them");
  });

  it("keeps the follow-up date when the type changes", async () => {
    mockApi({});
    renderApp(<LogActivity link={{ deal_id: 5 }} onClose={vi.fn()} />);
    await user().type(await screen.findByLabelText("Follow-up date"), "2027-01-02");
    await user().selectOptions(screen.getByLabelText("Type"), "email");
    expect(box("Follow-up date").value).toBe("2027-01-02");
  });

  it("leaves the exact time alone when an edit doesn't touch it", async () => {
    const calls = mockApi({ "PATCH /activities/9": { id: 9 } });
    renderApp(<EditActivity entry={{ ...ENTRY, at: "2026-10-30T15:20:37.123456Z" }} onClose={vi.fn()} />);
    await retype("Description", "Better words");
    await user().click(screen.getByRole("button", { name: "Save activity" }));
    await waitFor(() => expect(calls.some((call) => call.method === "PATCH")).toBe(true));
    expect(calls.find((call) => call.method === "PATCH")?.body).toMatchObject({
      occurred_at: "2026-10-30T15:20:37.123456Z",
    });
  });

  it("saves a new time when one is chosen", async () => {
    const calls = mockApi({ "PATCH /activities/9": { id: 9 } });
    renderApp(<EditActivity entry={ENTRY} onClose={vi.fn()} />);
    const when = screen.getByLabelText("When") as HTMLInputElement;
    fireEvent.change(when, { target: { value: "2026-01-02T09:30" } });
    await user().click(screen.getByRole("button", { name: "Save activity" }));
    await waitFor(() => expect(calls.some((call) => call.method === "PATCH")).toBe(true));
    expect(calls.find((call) => call.method === "PATCH")?.body).toMatchObject({
      occurred_at: new Date("2026-01-02T09:30").toISOString(),
    });
  });

  it("logs a new activity to the second, so it sorts above what came just before it", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-10-30T15:20:37Z") });
    try {
      const calls = mockApi({ "POST /activities": { id: 9 } });
      renderApp(<LogActivity link={{ deal_id: 5 }} onClose={vi.fn()} />);
      await user().type(await screen.findByLabelText("Description"), "Called them");
      await user().click(screen.getByRole("button", { name: "Save activity" }));
      await waitFor(() => expect(calls.some((call) => call.method === "POST")).toBe(true));
      expect(calls.find((call) => call.method === "POST")?.body).toMatchObject({
        occurred_at: "2026-10-30T15:20:37.000Z",
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("can't leave a follow-up marked done once its date has gone", async () => {
    const calls = mockApi({ "PATCH /activities/9": { id: 9 } });
    renderApp(<EditActivity entry={ENTRY} onClose={vi.fn()} />);
    await user().clear(await screen.findByLabelText("Follow-up date"));
    await user().click(screen.getByRole("button", { name: "Save activity" }));
    await waitFor(() => expect(calls.some((call) => call.method === "PATCH")).toBe(true));
    expect(calls.find((call) => call.method === "PATCH")?.body).toMatchObject({
      follow_up_date: null,
      follow_up_done: false,
    });
  });
});

describe("adding a record", () => {
  it("adds it once, however quickly Save is pressed", async () => {
    const calls = mockApi({ "POST /organizations": ORGANIZATION });
    const onClose = vi.fn();
    renderApp(<OrganizationForm onClose={onClose} />);
    await user().type(await screen.findByLabelText("Name"), "Harbor & Pine");
    const release = holdSaves();
    await user().dblClick(screen.getByRole("button", { name: "Save organization" }));
    release();
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(calls.filter((call) => call.method === "POST")).toHaveLength(1);
  });

  it("adds it once when Enter is pressed twice", async () => {
    const calls = mockApi({ "POST /organizations": ORGANIZATION });
    const onClose = vi.fn();
    renderApp(<OrganizationForm onClose={onClose} />);
    await user().type(await screen.findByLabelText("Name"), "Harbor & Pine");
    const release = holdSaves();
    await user().keyboard("{Enter}{Enter}");
    release();
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(calls.filter((call) => call.method === "POST")).toHaveLength(1);
  });

  it("isn't held back by a save that was refused", async () => {
    const calls = mockApi({ "POST /organizations": ORGANIZATION });
    const onClose = vi.fn();
    renderApp(<OrganizationForm onClose={onClose} />);
    await user().click(await screen.findByRole("button", { name: "Save organization" }));
    expect(await screen.findByText("Enter a name")).toBeTruthy();
    await user().type(screen.getByLabelText("Name"), "Harbor & Pine");
    await user().click(screen.getByRole("button", { name: "Save organization" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(calls.filter((call) => call.method === "POST")).toHaveLength(1);
  });
});

type DeleteCase = {
  name: string;
  dialog: (onClose: () => void) => ReactElement;
  impact?: string;
  counts?: unknown;
  confirm: string;
  route: string;
};

const DELETES: DeleteCase[] = [
  {
    name: "organization",
    dialog: (onClose) => <DeleteOrganization id={1} name="Harbor & Pine" onClose={onClose} />,
    impact: "GET /organizations/1/delete-impact",
    counts: { contacts: 1, deals: 2 },
    confirm: "Delete organization",
    route: "DELETE /organizations/1",
  },
  {
    name: "contact",
    dialog: (onClose) => <DeleteContact id={11} name="Sam Carter" onClose={onClose} />,
    impact: "GET /contacts/11/delete-impact",
    counts: { deals: 1, activities: 3 },
    confirm: "Delete contact",
    route: "DELETE /contacts/11",
  },
  {
    name: "deal",
    dialog: (onClose) => <DeleteDeal id={5} name="Annual support" onClose={onClose} />,
    impact: "GET /deals/5/delete-impact",
    counts: { activities: 1, stage_changes: 2, won: false, value: 100 },
    confirm: "Delete deal",
    route: "DELETE /deals/5",
  },
  {
    name: "activity",
    dialog: (onClose) => <DeleteActivity id={9} description="Called them" onClose={onClose} />,
    confirm: "Delete activity",
    route: "DELETE /activities/9",
  },
];

describe.each(DELETES)("the $name delete dialog", ({ dialog, impact, counts, confirm, route }) => {
  const reads = impact ? { [impact]: counts } : {};

  async function button() {
    const found = await screen.findByRole("button", { name: confirm });
    await waitFor(() => expect((found as HTMLButtonElement).disabled).toBe(false));
    return found;
  }

  it("deletes once, however quickly it's pressed", async () => {
    const calls = mockApi({ ...reads, [route]: () => ({ status: 204, body: null }) });
    const onClose = vi.fn();
    renderApp(dialog(onClose));
    const pressed = await button();
    const release = holdSaves();
    await user().dblClick(pressed);
    release();
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(calls.filter((call) => call.method === "DELETE")).toHaveLength(1);
  });

  it("stays open and says so if the delete fails, and can try again", async () => {
    const failure = vi.spyOn(toast, "error");
    let broken = true;
    const calls = mockApi({
      ...reads,
      [route]: () =>
        broken ? { status: 500, body: { detail: "Something went wrong." } } : { status: 204, body: null },
    });
    const onClose = vi.fn();
    renderApp(dialog(onClose));
    await user().click(await button());
    await waitFor(() => expect(failure).toHaveBeenCalledWith("Something went wrong."));
    expect(onClose).not.toHaveBeenCalled();

    broken = false;
    await user().click(await button());
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(calls.filter((call) => call.method === "DELETE")).toHaveLength(2);
  });
});

describe.each(DELETES.filter((item) => item.impact))(
  "the $name delete dialog's counts",
  ({ dialog, impact, confirm }) => {
    it("says so if they can't be read, and won't delete without them", async () => {
      mockApi({ [impact!]: () => ({ status: 500, body: { detail: "Something went wrong." } }) });
      renderApp(dialog(vi.fn()));
      expect(await screen.findByText("Couldn't check what's linked, so this can't be deleted right now.")).toBeTruthy();
      expect((screen.getByRole("button", { name: confirm }) as HTMLButtonElement).disabled).toBe(true);
    });
  },
);
