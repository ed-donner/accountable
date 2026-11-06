import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { SampleLook } from "../company/documentPreview";
import { SampleInvoice } from "./SampleInvoice";

const LOGO = "data:image/png;base64,iVBORw0KGgo=";

function textIn(container: HTMLElement, text: string) {
  return [...container.querySelectorAll("text")].filter((element) => element.textContent === text);
}

const LOOK: SampleLook = {
  design: "ledger",
  accent: "#0E6B6B",
  logo: { url: LOGO, width: 600, height: 200 },
  company: { name: "Plainsong Systems", address: "48 Orchard Row", email: "", phone: "" },
  taxLabel: "VAT",
  taxRate: "20",
  invoicePrefix: "BILL-",
  paymentTermsDays: 14,
};

describe("the sample invoice", () => {
  it("draws the first page in the look given, with the page's company, prefix and rate", () => {
    const { container } = render(<SampleInvoice look={LOOK} />);
    expect(screen.getAllByRole("img")).toHaveLength(1);
    for (const text of ["Plainsong Systems", "BILL-0042", "VAT (20%)", "Harbor & Pine"]) {
      expect(textIn(container, text)).toHaveLength(1);
    }
    expect(container.querySelector("image")).not.toBeNull();
  });

  it("names the company something while no name is typed", () => {
    const { container } = render(<SampleInvoice look={{ ...LOOK, company: { ...LOOK.company, name: " " } }} />);
    expect(textIn(container, "Your company")).toHaveLength(1);
  });
});
