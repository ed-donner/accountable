import { screen, waitFor, within } from "@testing-library/react";
import { toast } from "sonner";
import { describe, expect, it, vi } from "vitest";

import { todayIso } from "../../lib/dates";
import { META, mockApi, renderApp, user } from "../../test-utils";
import type { Deal } from "../queries";
import { DealForm } from "./DealForm";

const ORGANIZATIONS = [
  { id: 1, name: "Harbor & Pine" },
  { id: 2, name: "Lantern Hotels" },
];
const CONTACTS = [
  { id: 11, name: "Sam Carter", organization_id: 1, organization_name: "Harbor & Pine" },
  { id: 12, name: "Elena Petrova", organization_id: 2, organization_name: "Lantern Hotels" },
  { id: 13, name: "Mia Chen", organization_id: 1, organization_name: "Harbor & Pine" },
];

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

function api(extra = {}) {
  return mockApi({ "GET /meta": META, "GET /organizations": ORGANIZATIONS, "GET /contacts": CONTACTS, ...extra });
}

function field(label: string) {
  return screen.getByLabelText(label) as HTMLInputElement;
}

function picker(name: string) {
  return screen.getByRole("combobox", { name });
}

async function ready() {
  await screen.findByLabelText("Probability");
}

async function choose(name: string, option: RegExp | string) {
  await user().click(picker(name));
  await user().click(await screen.findByRole("option", { name: option }));
}

describe("adding a deal", () => {
  it("defaults to New with its usual probability", async () => {
    api();
    renderApp(<DealForm onClose={vi.fn()} />);
    await ready();
    expect((screen.getByLabelText("Stage") as HTMLSelectElement).value).toBe("new");
    expect(field("Probability").value).toBe("5");
    expect(field("Close date").value).toBe("");
  });

  it("starts at the column's stage", async () => {
    api();
    renderApp(<DealForm defaultStage="negotiation" onClose={vi.fn()} />);
    await ready();
    expect((screen.getByLabelText("Stage") as HTMLSelectElement).value).toBe("negotiation");
    expect(field("Probability").value).toBe("70");
  });

  it("defaults the close date to today at Won or Lost", async () => {
    api();
    renderApp(<DealForm defaultStage="won" onClose={vi.fn()} />);
    await ready();
    expect(field("Close date").value).toBe(todayIso());
    expect(field("Probability").value).toBe("100");
  });

  it("names every missing field in plain words", async () => {
    api();
    renderApp(<DealForm onClose={vi.fn()} />);
    await ready();
    await user().click(screen.getByRole("button", { name: "Save deal" }));
    const alerts = (await screen.findAllByRole("alert")).map((alert) => alert.textContent);
    expect(alerts).toEqual([
      "Enter a name",
      "Choose an organization",
      "Choose a main contact",
      "Enter a whole number of dollars, zero or more",
      "Choose a close date",
    ]);
  });

  it.each(["-5", "12.5", "lots"])("refuses a value of %s", async (value) => {
    api();
    renderApp(<DealForm onClose={vi.fn()} />);
    await ready();
    await user().type(field("Value"), value);
    await user().click(screen.getByRole("button", { name: "Save deal" }));
    expect(await screen.findByText("Enter a whole number of dollars, zero or more")).toBeTruthy();
  });

  it.each(["101", "12.5", "high"])("refuses a probability of %s", async (value) => {
    api();
    renderApp(<DealForm onClose={vi.fn()} />);
    await ready();
    await user().clear(field("Probability"));
    await user().type(field("Probability"), value);
    await user().click(screen.getByRole("button", { name: "Save deal" }));
    expect(await screen.findByText("Enter a whole number from 0 to 100")).toBeTruthy();
  });

  it("saves what's shown", async () => {
    const calls = api({ "POST /deals": () => ({ status: 201, body: DEAL }) });
    const onClose = vi.fn();
    renderApp(<DealForm onClose={onClose} />);
    await ready();
    await user().type(field("Name"), "New deal");
    await choose("Organization", "Harbor & Pine");
    await choose("Main contact", /Sam Carter/);
    await user().type(field("Value"), "$48,000");
    await user().type(field("Close date"), "2026-12-01");
    await user().click(screen.getByRole("button", { name: "Save deal" }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(calls.find((call) => call.method === "POST")?.body).toEqual({
      name: "New deal",
      organization_id: 1,
      main_contact_id: 11,
      stage: "new",
      value: 48000,
      probability: 5,
      close_date: "2026-12-01",
    });
  });

  it("refuses a future close date for a won deal before it reaches the server", async () => {
    const calls = api();
    renderApp(<DealForm record={{ ...DEAL, stage: "won", close_date: "2020-01-01" }} onClose={vi.fn()} />);
    await ready();
    await user().clear(field("Close date"));
    await user().type(field("Close date"), "2999-01-01");
    await user().click(screen.getByRole("button", { name: "Save deal" }));
    expect(await screen.findByText("A won or lost deal can't have a close date in the future")).toBeTruthy();
    expect(calls.some((call) => call.method === "PATCH")).toBe(false);
  });

  it("allows an open deal any close date", async () => {
    const calls = api({ "PATCH /deals/5": DEAL });
    renderApp(<DealForm record={DEAL} onClose={vi.fn()} />);
    await ready();
    await user().clear(field("Close date"));
    await user().type(field("Close date"), "2999-01-01");
    await user().click(screen.getByRole("button", { name: "Save deal" }));
    await waitFor(() => expect(calls.some((call) => call.method === "PATCH")).toBe(true));
  });

  it("shows a server error beside its field and stays open", async () => {
    api({
      "POST /deals": () => ({
        status: 422,
        body: { detail: "Check the form.", fields: { value: "That's too large" } },
      }),
    });
    const onClose = vi.fn();
    renderApp(<DealForm defaultStage="won" defaultOrganizationId={1} defaultContactId={11} onClose={onClose} />);
    await ready();
    await user().type(field("Name"), "Won deal");
    await user().type(field("Value"), "100");
    await user().click(screen.getByRole("button", { name: "Save deal" }));
    expect(await screen.findByText("That's too large")).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("linked pickers", () => {
  it("narrows main contacts to the chosen organization", async () => {
    api();
    renderApp(<DealForm onClose={vi.fn()} />);
    await ready();
    await choose("Organization", "Lantern Hotels");
    await user().click(picker("Main contact"));
    const names = within(await screen.findByRole("listbox")).getAllByRole("option");
    expect(names).toHaveLength(1);
    expect(names[0].textContent).toContain("Elena Petrova");
  });

  it("shows everyone until an organization is chosen", async () => {
    api();
    renderApp(<DealForm onClose={vi.fn()} />);
    await ready();
    await user().click(picker("Main contact"));
    expect(within(await screen.findByRole("listbox")).getAllByRole("option")).toHaveLength(3);
  });

  it("fills in the organization when a contact is chosen first", async () => {
    api();
    renderApp(<DealForm onClose={vi.fn()} />);
    await ready();
    await choose("Main contact", /Elena Petrova/);
    expect(picker("Organization").textContent).toContain("Lantern Hotels");
  });

  it("leaves the chosen organization alone when a contact from elsewhere is kept", async () => {
    api();
    renderApp(
      <DealForm record={{ ...DEAL, main_contact_id: 12, main_contact_name: "Elena Petrova" }} onClose={vi.fn()} />,
    );
    await ready();
    expect(picker("Organization").textContent).toContain("Harbor & Pine");
    await waitFor(() => expect(picker("Main contact").textContent).toContain("Elena Petrova"));
  });

  it("fills in the organization for a contact's Add deal button", async () => {
    api();
    renderApp(<DealForm defaultContactId={12} defaultOrganizationId={2} onClose={vi.fn()} />);
    await ready();
    await waitFor(() => expect(picker("Main contact").textContent).toContain("Elena Petrova"));
    expect(picker("Organization").textContent).toContain("Lantern Hotels");
  });
});

describe("a contact added from the picker", () => {
  it("clears the organization's error when it fills the organization in", async () => {
    api({
      "POST /contacts": {
        id: 14,
        name: "Brand new",
        organization_id: 2,
        organization_name: "Lantern Hotels",
        status: "lead",
        deals: [],
      },
    });
    renderApp(<DealForm onClose={vi.fn()} />);
    await ready();
    await user().click(screen.getByRole("button", { name: "Save deal" }));
    await screen.findByText("Choose a main contact", { selector: "p" });
    expect(screen.getByText("Choose an organization", { selector: "p" })).toBeTruthy();

    await user().click(picker("Main contact"));
    await user().type(await screen.findByPlaceholderText("Search contacts"), "Brand new");
    await user().click(await screen.findByRole("option", { name: /Add "Brand new"/ }));
    const form = await screen.findByRole("dialog", { name: "Add contact" });
    await user().click(within(form).getByRole("combobox", { name: "Organization" }));
    await user().click(await screen.findByRole("option", { name: "Lantern Hotels" }));
    await user().click(within(form).getByRole("button", { name: "Save contact" }));

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Add contact" })).toBeNull());
    expect(picker("Organization").textContent).toContain("Lantern Hotels");
    expect(screen.queryByText("Choose an organization", { selector: "p" })).toBeNull();
  });
});

describe("changing the stage", () => {
  it("shows the new probability", async () => {
    api();
    renderApp(<DealForm record={DEAL} onClose={vi.fn()} />);
    await ready();
    await user().selectOptions(screen.getByLabelText("Stage"), "negotiation");
    expect(field("Probability").value).toBe("70");
    expect(field("Close date").value).toBe("2026-12-18");
  });

  it("shows today as the close date for Won and Lost", async () => {
    api();
    renderApp(<DealForm record={DEAL} onClose={vi.fn()} />);
    await ready();
    await user().selectOptions(screen.getByLabelText("Stage"), "won");
    expect(field("Probability").value).toBe("100");
    expect(field("Close date").value).toBe(todayIso());
    await user().selectOptions(screen.getByLabelText("Stage"), "lost");
    expect(field("Probability").value).toBe("0");
  });

  it("puts things back when the stage goes back", async () => {
    api();
    renderApp(<DealForm record={DEAL} onClose={vi.fn()} />);
    await ready();
    await user().selectOptions(screen.getByLabelText("Stage"), "won");
    await user().selectOptions(screen.getByLabelText("Stage"), "proposal");
    expect(field("Probability").value).toBe("33");
    expect(field("Close date").value).toBe("2026-12-18");
  });

  it("lets both be overtyped, and saves what's shown", async () => {
    const calls = api({ "PATCH /deals/5": DEAL });
    renderApp(<DealForm record={DEAL} onClose={vi.fn()} />);
    await ready();
    await user().selectOptions(screen.getByLabelText("Stage"), "won");
    await user().clear(field("Probability"));
    await user().type(field("Probability"), "90");
    await user().clear(field("Close date"));
    await user().type(field("Close date"), "2026-10-20");
    await user().click(screen.getByRole("button", { name: "Save deal" }));

    await waitFor(() => expect(calls.some((call) => call.method === "PATCH")).toBe(true));
    const saved = calls.find((call) => call.method === "PATCH")?.body as Record<string, unknown>;
    expect(saved.stage).toBe("won");
    expect(saved.probability).toBe(90);
    expect(saved.close_date).toBe("2026-10-20");
  });
});

describe("a close date that's been typed", () => {
  const WON: Deal = { ...DEAL, stage: "won", probability: 100, close_date: "2026-10-01" };

  async function typeDate(date: string) {
    await user().clear(field("Close date"));
    await user().type(field("Close date"), date);
  }

  async function stage(name: string) {
    await user().selectOptions(screen.getByLabelText("Stage"), name);
  }

  it("stays when adding a deal, moving between open stages", async () => {
    api();
    renderApp(<DealForm onClose={vi.fn()} />);
    await ready();
    await typeDate("2027-03-15");
    await stage("qualified");
    await stage("negotiation");
    expect(field("Close date").value).toBe("2027-03-15");
  });

  it("stays when editing a deal, moving between open stages", async () => {
    api();
    renderApp(<DealForm record={DEAL} onClose={vi.fn()} />);
    await ready();
    await typeDate("2027-03-15");
    await stage("negotiation");
    expect(field("Close date").value).toBe("2027-03-15");
  });

  it("is what gets saved after a move between open stages", async () => {
    const calls = api({ "PATCH /deals/5": DEAL });
    renderApp(<DealForm record={DEAL} onClose={vi.fn()} />);
    await ready();
    await typeDate("2027-03-15");
    await stage("negotiation");
    await user().click(screen.getByRole("button", { name: "Save deal" }));
    await waitFor(() => expect(calls.some((call) => call.method === "PATCH")).toBe(true));
    expect(calls.find((call) => call.method === "PATCH")?.body).toMatchObject({
      close_date: "2027-03-15",
      stage: "negotiation",
    });
  });

  it("comes back after a trip through Won", async () => {
    api();
    renderApp(<DealForm record={DEAL} onClose={vi.fn()} />);
    await ready();
    await typeDate("2027-03-15");
    await stage("won");
    expect(field("Close date").value).toBe(todayIso());
    await stage("proposal");
    expect(field("Close date").value).toBe("2027-03-15");
  });

  it("comes back after a trip through Lost when adding a deal", async () => {
    api();
    renderApp(<DealForm onClose={vi.fn()} />);
    await ready();
    await typeDate("2027-03-15");
    await stage("lost");
    await stage("qualified");
    expect(field("Close date").value).toBe("2027-03-15");
  });

  it("isn't invented for a new deal that leaves Won", async () => {
    api();
    renderApp(<DealForm defaultStage="won" onClose={vi.fn()} />);
    await ready();
    await stage("new");
    expect(field("Close date").value).toBe("");
  });

  it("stays the saved one when a closed deal is reopened in the form", async () => {
    api();
    renderApp(<DealForm record={WON} onClose={vi.fn()} />);
    await ready();
    await stage("proposal");
    expect(field("Close date").value).toBe("2026-10-01");
  });

  it("becomes today going from Won to Lost, and comes back with Won", async () => {
    api();
    renderApp(<DealForm record={WON} onClose={vi.fn()} />);
    await ready();
    await stage("lost");
    expect(field("Close date").value).toBe(todayIso());
    await stage("won");
    expect(field("Close date").value).toBe("2026-10-01");
  });

  it("clears a close date error only when the date changes", async () => {
    api();
    renderApp(<DealForm onClose={vi.fn()} />);
    await ready();
    await user().click(screen.getByRole("button", { name: "Save deal" }));
    expect(await screen.findByText("Choose a close date")).toBeTruthy();
    await stage("qualified");
    expect(screen.getByText("Choose a close date")).toBeTruthy();
    await stage("won");
    await waitFor(() => expect(screen.queryByText("Choose a close date")).toBeNull());
  });
});

describe("what else has been typed", () => {
  async function typeTheBasics() {
    await user().type(field("Name"), "Typed name");
    await user().type(field("Value"), "1234");
  }

  it("stays when the stage changes", async () => {
    api();
    renderApp(<DealForm onClose={vi.fn()} />);
    await ready();
    await typeTheBasics();
    await user().selectOptions(screen.getByLabelText("Stage"), "won");
    expect(field("Name").value).toBe("Typed name");
    expect(field("Value").value).toBe("1234");
  });

  it("stays when an organization is chosen", async () => {
    api();
    renderApp(<DealForm onClose={vi.fn()} />);
    await ready();
    await typeTheBasics();
    await user().type(field("Close date"), "2027-03-15");
    await choose("Organization", /Harbor/);
    expect(field("Name").value).toBe("Typed name");
    expect(field("Value").value).toBe("1234");
    expect(field("Close date").value).toBe("2027-03-15");
  });

  it("keeps the chosen contact when the organization changes", async () => {
    api();
    renderApp(<DealForm record={DEAL} onClose={vi.fn()} />);
    await ready();
    await choose("Organization", /Lantern/);
    expect(picker("Main contact").textContent).toContain("Sam Carter");
  });

  it("stays when a new organization is added from the picker", async () => {
    api({
      "POST /organizations": {
        id: 3,
        name: "Brand new",
        website: null,
        industry: null,
        notes: null,
        contacts: [],
        deals: [],
      },
    });
    renderApp(<DealForm onClose={vi.fn()} />);
    await ready();
    await typeTheBasics();
    await user().click(picker("Organization"));
    await user().type(await screen.findByPlaceholderText("Search organizations"), "Brand new");
    await user().click(await screen.findByRole("option", { name: /Add "Brand new"/ }));
    await user().click(await screen.findByRole("button", { name: "Save organization" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Save organization" })).toBeNull());
    expect(field("Name").value).toBe("Typed name");
    expect(field("Value").value).toBe("1234");
  });

  it("replaces a hand-set probability when the stage changes, as the rules say", async () => {
    api();
    renderApp(<DealForm record={DEAL} onClose={vi.fn()} />);
    await ready();
    await user().clear(field("Probability"));
    await user().type(field("Probability"), "55");
    await user().selectOptions(screen.getByLabelText("Stage"), "qualified");
    expect(field("Probability").value).toBe("20");
  });
});

describe("when something goes wrong", () => {
  it("closes and says so if its lists can't be read", async () => {
    const failure = vi.spyOn(toast, "error");
    const onClose = vi.fn();
    api({ "GET /contacts": () => ({ status: 500, body: { detail: "Something went wrong." } }) });
    renderApp(<DealForm onClose={onClose} />);
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(failure).toHaveBeenCalledWith("Couldn't open the form. Try again.", expect.anything());
  });

  it("does the same for the organizations list and the stages", async () => {
    for (const route of ["GET /organizations", "GET /meta"]) {
      const onClose = vi.fn();
      api({ [route]: () => ({ status: 500, body: { detail: "Something went wrong." } }) });
      const view = renderApp(<DealForm onClose={onClose} />);
      await waitFor(() => expect(onClose).toHaveBeenCalled());
      view.unmount();
    }
  });
});

describe("blank links", () => {
  const BLANK: Deal = {
    ...DEAL,
    organization_id: null,
    organization_name: null,
    main_contact_id: null,
    main_contact_name: null,
  };

  it("shows None and saves blank", async () => {
    const calls = api({ "PATCH /deals/5": BLANK });
    renderApp(<DealForm record={BLANK} onClose={vi.fn()} />);
    await ready();
    expect(picker("Organization").textContent).toContain("None");
    expect(picker("Main contact").textContent).toContain("None");

    await user().click(screen.getByRole("button", { name: "Save deal" }));

    await waitFor(() => expect(calls.some((call) => call.method === "PATCH")).toBe(true));
    const saved = calls.find((call) => call.method === "PATCH")?.body as Record<string, unknown>;
    expect(saved.organization_id).toBeNull();
    expect(saved.main_contact_id).toBeNull();
  });
});

describe("the dialog", () => {
  it("is titled for adding or editing", async () => {
    api();
    renderApp(<DealForm record={DEAL} onClose={vi.fn()} />);
    await ready();
    expect(within(screen.getByRole("dialog")).getByRole("heading", { name: "Edit deal" })).toBeTruthy();
  });
});
