import { addDays, format, parseISO } from "date-fns";
import { useMemo } from "react";

import { DocumentDrawing } from "../company/DocumentDrawing";
import type { SampleLook } from "../company/documentPreview";
import type { DocumentValues } from "../company/layout";
import { totals } from "../company/tax";
import { todayIso } from "../lib/dates";

const SAMPLE_LINES = [
  {
    name: "Annual support plan",
    description: "Email and phone support on weekdays, 9 to 5.",
    quantity: 2,
    unit_price_cents: 360000,
  },
  {
    name: "Training day, on site",
    description: "Up to 12 people, at the customer's site.",
    quantity: 3,
    unit_price_cents: 125000,
  },
  { name: "Setup and configuration", description: null, quantity: 1, unit_price_cents: 240000 },
];

/** A made-up invoice in the look the Company settings page has chosen, before it's saved (B19). */
export function SampleInvoice({ look }: { look: SampleLook }) {
  const today = todayIso();
  const invoice = useMemo<DocumentValues>(() => {
    const figures = totals(SAMPLE_LINES, look.taxRate);
    const blank = (text: string) => text.trim() || null;
    return {
      kind: "invoice",
      design: look.design,
      accent: look.accent,
      logo: look.logo && { width: look.logo.width, height: look.logo.height },
      company: {
        name: blank(look.company.name) ?? "Your company",
        address: blank(look.company.address),
        email: blank(look.company.email),
        phone: blank(look.company.phone),
      },
      number: `${look.invoicePrefix}0042`,
      date: today,
      end_date: format(addDays(parseISO(today), look.paymentTermsDays), "yyyy-MM-dd"),
      recipient: "Harbor & Pine\nAttn: Sam Carter\nsam@harbor.example",
      lines: SAMPLE_LINES,
      ...figures,
      paid_cents: 0,
      tax_label: blank(look.taxLabel),
      tax_rate: look.taxRate,
      mark: null,
    };
  }, [look, today]);
  return <DocumentDrawing values={invoice} logoUrl={look.logo?.url ?? null} pages={1} />;
}
