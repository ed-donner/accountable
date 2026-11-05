import { render, screen, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, it } from "vitest";

import { QuotePreview } from "./QuotePreview";

const LOGO = "data:image/png;base64,iVBORw0KGgo=";

const PLAINSONG = {
  name: "Plainsong Systems",
  address: "48 Orchard Row, Suite 210\nBrooklyn, NY 11201",
  email: "accounts@plainsong.example",
  phone: "(718) 555-0142",
};

const QUOTE: ComponentProps<typeof QuotePreview> = {
  look: { design: "classic", accent: "#107FA4", logo: { width: 600, height: 200 }, logoUrl: LOGO },
  number: "QT-0004",
  draft: false,
  quoteDate: "2026-11-05",
  validUntil: "2026-12-05",
  company: PLAINSONG,
  preparedFor: { organization: "Harbor & Pine", contact: "Sam Carter", email: "sam.carter@harborpine.example" },
  taxLabel: "Sales tax",
  taxRate: "8.875",
  lines: [
    { name: "Pro license", description: "Annual license, per seat", quantity: 12, unit_price_cents: 48000 },
    { name: "Training day", description: null, quantity: 2, unit_price_cents: 125000 },
  ],
  figures: { subtotal_cents: 826000, tax_cents: 73308, total_cents: 899308 },
};

function show(changes: Partial<ComponentProps<typeof QuotePreview>> = {}) {
  const { container } = render(<QuotePreview {...QUOTE} {...changes} />);
  return within(container).getByRole("article", { name: "Preview" });
}

function texts(sheet: HTMLElement) {
  return [...sheet.querySelectorAll("text")].map((element) => element.textContent);
}

describe("the quote's preview", () => {
  it("shows the company, the quote's dates, Prepared for, the lines and the totals, laid out as its PDF is", () => {
    const sheet = show();
    const shown = sheet.textContent!;
    for (const part of [
      "Plainsong Systems48 Orchard Row, Suite 210Brooklyn, NY 11201accounts@plainsong.example(718) 555-0142",
      "Quote",
      "NumberQT-0004",
      "DateNov 5, 2026",
      "Valid untilDec 5, 2026",
      "Prepared forHarbor & PineSam Cartersam.carter@harborpine.example",
      "DescriptionQtyUnit priceAmount",
      "Pro licenseAnnual license, per seat12$480.00$5,760.00",
      "Training day2$1,250.00$2,500.00",
      "Subtotal$8,260.00",
      "Sales tax (8.875%)$733.08",
      "Total$8,993.08",
      "QT-0004, page 1 of 1",
    ]) {
      expect(shown).toContain(part);
    }
    expect(screen.getByRole("img").getAttribute("aria-label")).toBe("Quote preview, page 1 of 1");
  });

  it("is drawn in the design, accent color and logo Company settings have (Q31)", () => {
    const sheet = show();
    expect(
      [...sheet.querySelectorAll("text, rect")].some((element) => element.getAttribute("fill") === "#107FA4"),
    ).toBe(true);
    expect(sheet.querySelector("image")!.getAttribute("href")).toBe(LOGO);
    const banner = show({ look: { ...QUOTE.look, design: "banner", logo: null, logoUrl: null } });
    // The banner shows a quote's total where an invoice shows its balance.
    expect(banner.textContent).toMatch(/^QuoteQT-0004DateNov 5, 2026Valid untilDec 5, 2026Total\$8,993\.08Plainsong/);
    expect(banner.querySelector("image")).toBeNull();
  });

  it("shows a blank tax label as Tax, with the rate as saved (Q17)", () => {
    expect(show({ taxLabel: null, taxRate: "8.5" }).textContent).toContain("Tax (8.5%)");
  });

  it("leaves out blank details, and Prepared for with nobody to prepare it for", () => {
    const sheet = show({
      company: { name: "Plainsong Systems", address: null, email: null, phone: "(718) 555-0142" },
      preparedFor: { organization: null, contact: null, email: null },
    });
    expect(texts(sheet).slice(0, 2)).toEqual(["Plainsong Systems", "(718) 555-0142"]);
    expect(sheet.textContent).not.toContain("Prepared for");
  });

  it("shows only the organization when the deal has no main contact", () => {
    const sheet = show({ preparedFor: { organization: "Harbor & Pine", contact: null, email: null } });
    expect(sheet.textContent).toContain("Prepared forHarbor & PineDescription");
  });

  it("marks only a draft, with DRAFT under its title (Q30)", () => {
    expect(texts(show())).not.toContain("DRAFT");
    expect(texts(show({ draft: true }))).toContain("DRAFT");
  });

  it("shows Draft where the number goes on a new draft, which has none yet", () => {
    const shown = texts(show({ number: null, draft: true }));
    expect(shown).toContain("Draft");
    expect(shown).toContain("Draft, page 1 of 1");
  });

  it("shows a blank valid-until date as blank while its box is", () => {
    const sheet = show({ validUntil: "" });
    expect(sheet.textContent).toContain("Valid untilPrepared for");
    expect(sheet.textContent).not.toMatch(/NaN|undefined/);
  });

  it("shows typed text exactly as typed, never as markup (Q32)", () => {
    const typed = "<b>Rush</b> **bold**";
    const sheet = show({
      company: { ...PLAINSONG, name: typed },
      lines: [{ ...QUOTE.lines[0], description: `${typed}\nSecond line` }],
    });
    expect(sheet.querySelector("b")).toBeNull();
    expect(texts(sheet)).toContain(typed);
    expect(sheet.textContent).toContain(`${typed}Second line`);
  });
});
