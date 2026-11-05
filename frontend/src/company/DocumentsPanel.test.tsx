import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { mockApi, renderApp, user, type Call } from "../test-utils";
import type { SampleLook } from "./documentPreview";
import type { CompanySettings } from "./settings";
import { SettingsPage } from "./SettingsPage";

// jsdom loads no images, so the browser's reading of a picture's size is stood in for.
vi.mock("../lib/files", async (original) => ({
  ...(await original<typeof import("../lib/files")>()),
  imageSize: async () => ({ width: 600, height: 200 }),
}));

const SAVED: CompanySettings = {
  company_name: "Plainsong Systems",
  address: "48 Orchard Row",
  email: null,
  phone: null,
  tax_label: "Sales tax",
  tax_rate: "8.875",
  payment_terms_days: 30,
  quote_prefix: "QT-",
  invoice_prefix: "INV-",
  invoice_design: "banner",
  accent_color: "#0E6B6B",
  logo: null,
  updated_at: "2026-11-05T12:00:00Z",
  updated_by: null,
};

const WITH_LOGO: CompanySettings = { ...SAVED, logo: { media_type: "image/png", width: 300, height: 100 } };

/** Says what it was given, as the invoices area's sample would draw it. */
function Preview({ look }: { look: SampleLook }) {
  const logo = look.logo ? `logo ${look.logo.width}x${look.logo.height}` : "no logo";
  return <p data-testid="preview">{`${look.design} ${look.accent} ${logo} ${look.taxRate} ${look.invoicePrefix}`}</p>;
}

async function open(settings: CompanySettings = SAVED, routes: Record<string, unknown> = {}) {
  const calls = mockApi({ "GET /settings": settings, ...routes });
  const logoFetched = vi.fn();
  const answer = globalThis.fetch;
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    if (url === "/api/settings/logo") {
      logoFetched();
      return new Response("saved logo bytes", { status: 200, headers: { "content-type": "image/png" } });
    }
    return answer(url, init);
  });
  renderApp(<SettingsPage preview={Preview} />);
  await screen.findByRole("group", { name: "Design" });
  return { calls, logoFetched };
}

function preview() {
  return screen.getByTestId("preview").textContent;
}

function patches(calls: Call[]) {
  return calls.filter((call) => call.method === "PATCH");
}

function file(name: string, bytes: number | string) {
  const content = typeof bytes === "string" ? bytes : new Uint8Array(bytes);
  return new File([content], name, { type: name.endsWith(".png") ? "image/png" : "application/octet-stream" });
}

/** A file handed to the logo's picker, as when "All files" lets any be chosen. */
async function choose(chosen: File) {
  fireEvent.change(screen.getByLabelText<HTMLInputElement>("Logo file"), { target: { files: [chosen] } });
}

function radio(name: string) {
  return screen.getByRole<HTMLInputElement>("radio", { name });
}

describe("the Documents panel", () => {
  it("has the three designs as one radio group, the saved one chosen, and the arrow keys move between them", async () => {
    await open();
    const designs = within(screen.getByRole("group", { name: "Design" })).getAllByRole("radio");
    expect(designs.map((design) => design.closest("label")!.textContent)).toEqual(["Classic", "Banner", "Ledger"]);
    expect(radio("Banner").checked).toBe(true);

    radio("Banner").focus();
    await user().keyboard("{ArrowRight}");
    expect(radio("Ledger").checked).toBe(true);
    expect(preview()).toMatch(/^ledger /);
    await user().keyboard("{ArrowLeft}{ArrowLeft}");
    expect(radio("Classic").checked).toBe(true);
    expect(preview()).toMatch(/^classic /);
  });

  it("changes the sample as a color is typed, keeping the saved one while the typed one doesn't pass", async () => {
    await open();
    const box = screen.getByLabelText<HTMLInputElement>("Accent color");
    expect(box.value).toBe("#0E6B6B");
    await user().clear(box);
    await user().type(box, "#107fa4");
    expect(preview()).toContain("#107FA4");
    await user().clear(box);
    await user().type(box, "#FFC145");
    expect(preview()).toContain("#0E6B6B");
  });

  it("refuses an accent color too light beside its box, and sends nothing", async () => {
    const { calls } = await open();
    const box = screen.getByLabelText("Accent color");
    await user().clear(box);
    await user().type(box, "#FFC145");
    await user().click(screen.getByRole("button", { name: "Save settings" }));
    expect(await screen.findByText("Too light to read on white. Choose a darker color")).toBeTruthy();
    expect(patches(calls)).toEqual([]);
  });

  it("takes a color from the picker as # and six capitals", async () => {
    await open();
    fireEvent.input(screen.getByLabelText("Pick the accent color"), { target: { value: "#047a5b" } });
    expect(screen.getByLabelText<HTMLInputElement>("Accent color").value).toBe("#047A5B");
    expect(preview()).toContain("#047A5B");
  });

  it("shows a chosen logo at once, in the tile and the sample, before anything is saved", async () => {
    const { calls } = await open();
    expect(screen.getByText("No logo")).toBeTruthy();
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Remove logo" }).disabled).toBe(true);
    await choose(file("logo.png", "\x89PNG"));
    expect((await screen.findByAltText<HTMLImageElement>("Logo")).src).toMatch(/^data:image\/png;base64,/);
    expect(preview()).toContain("logo 600x200");
    expect(patches(calls)).toEqual([]);
  });

  it("refuses a file not named .png, .jpg or .jpeg, or over 1 MB, before sending anything", async () => {
    const { calls } = await open();
    await choose(file("logo.svg", "<svg/>"));
    expect(await screen.findByText("Choose a PNG or JPEG image")).toBeTruthy();
    await choose(file("logo.png", 1024 * 1024 + 1));
    expect(await screen.findByText("Choose an image of 1 MB or less")).toBeTruthy();
    expect(screen.getByText("No logo")).toBeTruthy();
    expect(preview()).toContain("no logo");
    expect(patches(calls)).toEqual([]);
  });

  it("takes a JPEG named .jpeg or .JPG", async () => {
    await open();
    await choose(file("Logo.JPG", "\xff\xd8\xff"));
    expect((await screen.findByAltText<HTMLImageElement>("Logo")).src).toMatch(/^data:image\/jpeg;base64,/);
  });

  it("shows the saved logo, read with the token, and Remove logo takes it out of the sample", async () => {
    const { logoFetched } = await open(WITH_LOGO);
    expect(await screen.findByAltText("Logo")).toBeTruthy();
    expect(logoFetched).toHaveBeenCalled();
    await waitFor(() => expect(preview()).toContain("logo 300x100"));
    await user().click(screen.getByRole("button", { name: "Remove logo" }));
    expect(screen.getByText("No logo")).toBeTruthy();
    expect(preview()).toContain("no logo");
  });

  it("sends the design, the accent color and a new logo with the rest, and only a changed logo", async () => {
    const { calls } = await open(SAVED, { "PATCH /settings": WITH_LOGO });
    await user().click(radio("Ledger"));
    await choose(file("logo.png", "PNG!"));
    await screen.findByAltText("Logo");
    await user().click(screen.getByRole("button", { name: "Save settings" }));
    await waitFor(() => expect(patches(calls)).toHaveLength(1));
    expect(patches(calls)[0].body).toMatchObject({
      invoice_design: "ledger",
      accent_color: "#0E6B6B",
      logo: btoa("PNG!"),
    });

    await user().click(screen.getByRole("button", { name: "Save settings" }));
    await waitFor(() => expect(patches(calls)).toHaveLength(2));
    expect("logo" in (patches(calls)[1].body as object)).toBe(false);
  });

  it("sends null to remove the logo", async () => {
    const { calls } = await open(WITH_LOGO, { "PATCH /settings": SAVED });
    await screen.findByAltText("Logo");
    await user().click(screen.getByRole("button", { name: "Remove logo" }));
    await user().click(screen.getByRole("button", { name: "Save settings" }));
    await waitFor(() => expect(patches(calls)).toHaveLength(1));
    expect((patches(calls)[0].body as { logo: unknown }).logo).toBeNull();
  });

  it("puts the backend's message beside Logo", async () => {
    await open(SAVED, {
      "PATCH /settings": () => ({
        status: 422,
        body: { detail: "Check the form.", fields: { logo: "Choose a PNG or JPEG image" } },
      }),
    });
    await choose(file("not-a-picture.png", "just text"));
    await screen.findByAltText("Logo");
    await user().click(screen.getByRole("button", { name: "Save settings" }));
    expect(await screen.findByText("Choose a PNG or JPEG image")).toBeTruthy();
    expect(screen.queryByText("PNG or JPEG, up to 1 MB.")).toBeNull();
  });

  it("gives the sample the page's rate and prefix as typed once they pass, and the saved ones until then", async () => {
    await open();
    const rate = screen.getByLabelText("Tax rate");
    await user().clear(rate);
    await user().type(rate, "10.50");
    expect(preview()).toContain(" 10.5 ");
    await user().clear(rate);
    await user().type(rate, "abc");
    expect(preview()).toContain(" 8.875 ");
    const prefix = screen.getByLabelText("Invoice prefix");
    await user().clear(prefix);
    await user().type(prefix, "BILL-");
    expect(preview()).toMatch(/BILL-$/);
  });
});
