import { useMemo } from "react";

import { DESIGNS, layOut, type DocumentValues, type FontKey, type Item, type Page } from "./layout";

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
  title,
  number,
  of,
  logoUrl,
}: {
  items: Page;
  title: string;
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
        aria-label={`${title} preview, page ${number} of ${of}`}
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
  values: DocumentValues;
  /** The logo's address, such as a data address, or null to leave it out. */
  logoUrl: string | null;
  /** How many pages to show, such as 1 for the settings' sample. Every page by default. */
  pages?: number;
};

/**
 * A quote or an invoice exactly as the customer will see it (V19, V24, Q31): the layout's pages
 * as SVG, one under another, scaled to the column, as pdf.py draws them. Text is SVG text drawn
 * by React, never markup (V25, Q32). Each page is named for screen readers, such as "Quote
 * preview, page 1 of 2".
 */
export function DocumentDrawing({ values, logoUrl, pages }: Props) {
  const laidOut = useMemo(() => layOut(values), [values]);
  const shown = pages === undefined ? laidOut : laidOut.slice(0, pages);
  const title = DESIGNS.kinds[values.kind].words.title;
  return (
    <div className="flex flex-col gap-6">
      {shown.map((items, index) => (
        <PageDrawn key={index} items={items} title={title} number={index + 1} of={laidOut.length} logoUrl={logoUrl} />
      ))}
    </div>
  );
}
