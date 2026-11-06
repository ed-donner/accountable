import { useMemo } from "react";

import { DocumentDrawing } from "../company/DocumentDrawing";
import type { DocumentLook, DocumentValues } from "../company/layout";
import type { Company, PreparedFor } from "./queries";

/** How a quote looks, from Company settings as they are now (Q31): the design, accent color and logo, and the logo's image. */
export type QuoteLook = DocumentLook & { logoUrl: string | null };

export type PreviewLine = { name: string; description: string | null; quantity: number; unit_price_cents: number };

export type PreviewFigures = { subtotal_cents: number; tax_cents: number; total_cents: number };

type Props = {
  look: QuoteLook;
  /** None on a new draft, which takes its number when it's first saved (Q9). */
  number: string | null;
  draft: boolean;
  quoteDate: string;
  /** Blank while the draft's date box is. */
  validUntil: string;
  company: Company;
  preparedFor: PreparedFor;
  taxLabel: string | null;
  taxRate: string;
  lines: PreviewLine[];
  figures: PreviewFigures;
};

/** Who the quote is prepared for, on its lines, leaving out any that's blank, as the backend's PDF writes it (Q18). */
export function recipient(preparedFor: PreparedFor): string | null {
  const parts = [preparedFor.organization, preparedFor.contact, preparedFor.email];
  return parts.filter(Boolean).join("\n") || null;
}

/**
 * The quote as the customer will see it, laid out as its PDF is, in the design, accent color and
 * logo Company settings have (Q31). A draft is marked as one, and no other status is (Q30).
 */
export function QuotePreview({
  look,
  number,
  draft,
  quoteDate,
  validUntil,
  company,
  preparedFor,
  taxLabel,
  taxRate,
  lines,
  figures,
}: Props) {
  const { logoUrl, ...chosen } = look;
  const { subtotal_cents, tax_cents, total_cents } = figures;
  const values = useMemo<DocumentValues>(
    () => ({
      kind: "quote",
      design: chosen.design,
      accent: chosen.accent,
      logo: chosen.logo,
      company,
      number,
      date: quoteDate,
      end_date: validUntil,
      recipient: recipient(preparedFor),
      lines,
      subtotal_cents,
      tax_cents,
      total_cents,
      paid_cents: 0,
      tax_label: taxLabel,
      tax_rate: taxRate,
      mark: draft ? "draft" : null,
    }),
    [
      chosen.design,
      chosen.accent,
      chosen.logo,
      company,
      number,
      quoteDate,
      validUntil,
      preparedFor,
      lines,
      subtotal_cents,
      tax_cents,
      total_cents,
      taxLabel,
      taxRate,
      draft,
    ],
  );
  return (
    <article aria-label="Preview">
      <DocumentDrawing values={values} logoUrl={logoUrl} />
    </article>
  );
}
