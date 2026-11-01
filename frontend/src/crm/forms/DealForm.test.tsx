import { screen, waitFor, within } from "@testing-library/react";
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
    renderApp(<DealForm record={{ ...DEAL, main_contact_id: 12, main_contact_name: "Elena Petrova" }} onClose={vi.fn()} />);
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
