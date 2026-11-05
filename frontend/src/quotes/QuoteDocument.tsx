import { memo, useMemo } from "react";

import { useSize } from "../components/charts/useSize";
import { formatDate } from "../lib/dates";
import { price } from "../lib/money";
import type { Company, PreparedFor } from "./queries";

// The quote document as quotes.md sets it out, at the PDF's sizes in points, which backend's
// quotes/pdf.py draws from the same numbers. The sheet keeps to the paper tokens, which dark
// mode leaves alone, because it shows the paper the customer gets.

const SHEET_WIDTH_PT = 612;
const PX_PER_PT = 96 / 72;
// Every JetBrains Mono character is 0.6 of its size wide, so the figure columns are sized by
// counting characters, as the PDF sizes them.
const MONO_ADVANCE = 0.6;
const FIGURE_SIZE_PT = 9.5;
const QUANTITY_MIN_PT = 36;
const PRICE_MIN_PT = 64;
const AMOUNT_MIN_PT = 64;

export type DocumentLine = {
  key: string | number;
  name: string;
  description: string | null;
  quantity: number;
  unit_price_cents: number;
  amount_cents: number;
};

export type DocumentFigures = { subtotal_cents: number; tax_cents: number; total_cents: number };

type Props = {
  /** None on a new draft, which takes its number when it's first saved (Q9). */
  number: string | null;
  draft: boolean;
  quoteDate: string;
  validUntil: string;
  company: Company;
  preparedFor: PreparedFor;
  taxLabel: string | null;
  taxRate: string;
  lines: DocumentLine[];
  figures: DocumentFigures;
};

/** The tax as Q17 labels it, such as "Sales tax (8.875%)", with "Tax" for a blank label. */
export function taxLine(label: string | null, rate: string) {
  return `${label || "Tax"} (${rate}%)`;
}

function figureWidth(minimum: number, texts: string[]) {
  return Math.max(minimum, ...texts.map((text) => text.length * MONO_ADVANCE * FIGURE_SIZE_PT));
}

/** The lines' grid: the item, then each figure column sized to its widest figure. */
function useColumns(lines: DocumentLine[]) {
  const quantity = figureWidth(
    QUANTITY_MIN_PT,
    lines.map((line) => line.quantity.toLocaleString("en-US")),
  );
  const unitPrice = figureWidth(
    PRICE_MIN_PT,
    lines.map((line) => price(line.unit_price_cents)),
  );
  const amount = figureWidth(
    AMOUNT_MIN_PT,
    lines.map((line) => price(line.amount_cents)),
  );
  return useMemo(
    () => ({ gridTemplateColumns: `minmax(0,1fr) ${quantity}pt ${unitPrice}pt ${amount}pt` }),
    [quantity, unitPrice, amount],
  );
}

/** The sheet, scaled to the width of its column. */
export function QuoteDocument(props: Props) {
  const { ref, size } = useSize();
  const zoom = size.width > 0 ? size.width / (SHEET_WIDTH_PT * PX_PER_PT) : undefined;
  return (
    <div ref={ref} className="overflow-hidden rounded-panel bg-paper">
      <article
        aria-label="Preview"
        style={{ zoom }}
        className="flex min-h-[792pt] w-[612pt] flex-col bg-paper px-[54pt] pt-[54pt] pb-[28pt] text-paper-ink"
      >
        <Sheet {...props} />
      </article>
    </div>
  );
}

function Sheet({
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
  const columns = useColumns(lines);
  return (
    <>
      <div className="flex justify-between gap-[24pt]">
        <CompanyDetails company={company} />
        <QuoteDetails number={number} draft={draft} quoteDate={quoteDate} validUntil={validUntil} />
      </div>
      <PreparedForDetails preparedFor={preparedFor} />
      <div
        style={columns}
        className="mt-[28pt] grid h-[22pt] items-center gap-x-[14pt] rounded-[6pt] bg-paper-band px-[10pt] text-[9pt] font-semibold text-paper-muted"
      >
        <span>Item</span>
        <span className="text-right">Qty</span>
        <span className="text-right">Unit price</span>
        <span className="text-right">Amount</span>
      </div>
      <ol className="mt-[8pt] flex flex-col gap-[10pt]">
        {lines.map((line) => (
          <SheetLine
            key={line.key}
            columns={columns}
            name={line.name}
            description={line.description}
            quantity={line.quantity}
            unitPrice={line.unit_price_cents}
            amount={line.amount_cents}
          />
        ))}
      </ol>
      <Totals taxLabel={taxLabel} taxRate={taxRate} figures={figures} />
      {number && <p className="num mt-auto pt-[28pt] text-[8pt] leading-[10pt] text-paper-muted">{number}</p>}
    </>
  );
}

function CompanyDetails({ company }: { company: Company }) {
  return (
    <div className="w-[280pt] min-w-0 break-words">
      {company.name && <p className="mb-[4pt] text-[18pt] leading-[22pt] font-semibold">{company.name}</p>}
      {[company.address, company.email, company.phone].map(
        (detail, index) =>
          detail && (
            <p key={index} className="text-[9pt] leading-[13pt] whitespace-pre-wrap text-paper-muted">
              {detail}
            </p>
          ),
      )}
    </div>
  );
}

type QuoteDetailsProps = { number: string | null; draft: boolean; quoteDate: string; validUntil: string };

function QuoteDetails({ number, draft, quoteDate, validUntil }: QuoteDetailsProps) {
  const rows: [string, string][] = [
    ...(number ? [["Number", number] as [string, string]] : []),
    ["Date", formatDate(quoteDate)],
    ["Valid until", validUntil ? formatDate(validUntil) : ""],
  ];
  return (
    <div className="w-[200pt] flex-none">
      <div className="flex h-[28pt] items-center gap-[8pt]">
        <p className="text-[24pt] leading-[28pt] font-semibold">Quote</p>
        {draft && (
          <span className="flex h-[16pt] items-center rounded-full bg-paper-band px-[7pt] text-[9pt] font-semibold text-paper-muted">
            Draft
          </span>
        )}
      </div>
      <dl className="mt-[8pt]">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between">
            <dt className="text-[9pt] leading-[16pt] font-semibold text-paper-muted">{label}</dt>
            <dd className="num text-[10pt] leading-[16pt]">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function PreparedForDetails({ preparedFor }: { preparedFor: PreparedFor }) {
  const { organization, contact, email } = preparedFor;
  if (!organization && !contact && !email) return null;
  return (
    <div className="mt-[28pt] w-[280pt] break-words">
      <p className="mb-[3pt] text-[9pt] leading-[13pt] font-semibold text-paper-muted">Prepared for</p>
      {organization && <p className="text-[11pt] leading-[15pt] font-semibold">{organization}</p>}
      {contact && <p className="text-[10pt] leading-[14pt]">{contact}</p>}
      {email && <p className="text-[10pt] leading-[14pt]">{email}</p>}
    </div>
  );
}

type SheetLineProps = {
  columns: { gridTemplateColumns: string };
  name: string;
  description: string | null;
  quantity: number;
  unitPrice: number;
  amount: number;
};

/** One line, drawn again only when its own figures or words change, so a 100-line preview keeps up (Q1). */
const SheetLine = memo(function SheetLine({ columns, name, description, quantity, unitPrice, amount }: SheetLineProps) {
  return (
    <li style={columns} className="grid gap-x-[14pt] px-[10pt]">
      <div className="min-w-0 break-words">
        <p className="text-[10pt] leading-[14pt] font-semibold">{name}</p>
        {description && (
          <p className="mt-[1pt] text-[9pt] leading-[12pt] whitespace-pre-wrap text-paper-muted">{description}</p>
        )}
      </div>
      <span className="num text-right text-[9.5pt] leading-[14pt]">{quantity.toLocaleString("en-US")}</span>
      <span className="num text-right text-[9.5pt] leading-[14pt]">{price(unitPrice)}</span>
      <span className="num text-right text-[9.5pt] leading-[14pt]">{price(amount)}</span>
    </li>
  );
});

type TotalsProps = { taxLabel: string | null; taxRate: string; figures: DocumentFigures };

function Totals({ taxLabel, taxRate, figures }: TotalsProps) {
  const sums: [string, number][] = [
    ["Subtotal", figures.subtotal_cents],
    [taxLine(taxLabel, taxRate), figures.tax_cents],
  ];
  return (
    <div className="mt-[10pt] ml-auto w-[236pt]">
      {sums.map(([label, cents]) => (
        <div key={label} className="flex justify-between gap-[14pt] px-[10pt] text-[10pt] leading-[18pt]">
          <span className="min-w-0 break-words">{label}</span>
          <span className="num">{price(cents)}</span>
        </div>
      ))}
      <div className="mt-[6pt] flex h-[30pt] items-center justify-between gap-[14pt] rounded-[6pt] bg-sea-green px-[10pt] text-paper-ink">
        <span className="text-[11pt] font-semibold">Total</span>
        <span className="num text-[12pt] font-medium">{price(figures.total_cents)}</span>
      </div>
    </div>
  );
}
