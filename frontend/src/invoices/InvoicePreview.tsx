import { addDays, format, parseISO } from "date-fns";
import { useMemo } from "react";

import type { SampleLook } from "../company/documentPreview";
import { totals } from "../company/tax";
import { todayIso } from "../lib/dates";
import { DESIGNS, layOut, type FontKey, type InvoiceValues, type Item, type Page } from "./layout";

/** The app's own fonts, as the PDF carries them: the same faces at the same weights. */
const FONTS: Record<FontKey, { family: string; weight: number }> = {
  sans: { family: "var(--font-sans)", weight: 400 },
  sans_semibold: { family: "var(--font-sans)", weight: 600 },
  serif: { family: "var(--font-serif)", weight: 400 },
  mono: { family: "var(--font-mono)", weight: 400 },
  mono_medium: { family: "var(--font-mono)", weight: 500 },
};

const { width: PAGE_WIDTH, height: PAGE_HEIGHT } = DESIGNS.page;

function Drawn({ item, logoUrl }: { item: Item; logoUrl: string | null }) {
  if (item.kind === "block") {
    return <rect x={item.x} y={item.y} width={item.width} height={item.height} rx={item.radius} fill={item.color} />;
  }
  if (item.kind === "logo") {
    if (logoUrl === null) return null;
    return <image href={logoUrl} x={item.x} y={item.y} width={item.width} height={item.height} />;
  }
  const font = FONTS[item.font];
  // An item's angle turns it counterclockwise, and SVG turns clockwise.
  const turned = item.angle ? `rotate(${-item.angle} ${item.x} ${item.y})` : undefined;
  return (
    <text
      x={item.x}
      y={item.y}
      fill={item.color}
      fillOpacity={item.opacity}
      fontSize={item.size}
      textAnchor={item.anchor}
      transform={turned}
      xmlSpace="preserve"
      aria-hidden={item.angle ? true : undefined}
      // As ReportLab draws it, with no kerning or ligatures, so lines end where the PDF's do.
      style={{
        fontFamily: font.family,
        fontWeight: font.weight,
        whiteSpace: "pre",
        fontKerning: "none",
        fontVariantLigatures: "none",
      }}
    >
      {item.text}
    </text>
  );
}

function PageDrawn({
  items,
  number,
  of,
  logoUrl,
}: {
  items: Page;
  number: number;
  of: number;
  logoUrl: string | null;
}) {
  return (
    <div className="overflow-hidden rounded-[4px]">
      <svg
        viewBox={`0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}`}
        width="100%"
        role="img"
        aria-label={`Invoice preview, page ${number} of ${of}`}
        className="block"
      >
        <rect width={PAGE_WIDTH} height={PAGE_HEIGHT} fill={DESIGNS.colors.paper} />
        {items.map((item, index) => (
          <Drawn key={index} item={item} logoUrl={logoUrl} />
        ))}
      </svg>
    </div>
  );
}

type Props = {
  invoice: InvoiceValues;
  /** The logo's address, such as a data address, or null to leave it out. */
  logoUrl: string | null;
  /** How many pages to show, such as 1 for the settings' sample. Every page by default. */
  pages?: number;
};

/**
 * An invoice exactly as the customer will see it (V19, V24): the layout's pages as SVG, one
 * under another, scaled to the column. Text is SVG text drawn by React, never markup (V25).
 */
export function InvoicePreview({ invoice, logoUrl, pages }: Props) {
  const laidOut = useMemo(() => layOut(invoice), [invoice]);
  const shown = pages === undefined ? laidOut : laidOut.slice(0, pages);
  return (
    <div className="flex flex-col gap-6">
      {shown.map((items, index) => (
        <PageDrawn key={index} items={items} number={index + 1} of={laidOut.length} logoUrl={logoUrl} />
      ))}
    </div>
  );
}

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
  const invoice = useMemo<InvoiceValues>(() => {
    const figures = totals(SAMPLE_LINES, look.taxRate);
    const blank = (text: string) => text.trim() || null;
    return {
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
      issue_date: today,
      due_date: format(addDays(parseISO(today), look.paymentTermsDays), "yyyy-MM-dd"),
      bill_to: "Harbor & Pine\nAttn: Sam Carter\nsam@harbor.example",
      lines: SAMPLE_LINES,
      ...figures,
      paid_cents: 0,
      tax_label: blank(look.taxLabel),
      tax_rate: look.taxRate,
      mark: null,
    };
  }, [look, today]);
  return <InvoicePreview invoice={invoice} logoUrl={look.logo?.url ?? null} pages={1} />;
}
