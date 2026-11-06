import designsJson from "../../../shared/document-designs.json";
import fontsJson from "../../../shared/document-fonts.json";
import type { CompanySettings } from "./settings";

// Where everything goes on each page of a quote or an invoice (V24, V26 to V28, Q31), from
// shared/document-designs.json, in the design, accent color and logo Company settings have.
//
// backend/accountable/company/layout.py does the same, step for step, from the same JSON and
// the same widths in shared/document-fonts.json, so the preview and the PDF break lines and turn
// pages at the same places. Both run the cases in shared/document-layout-cases.json. Text is
// measured from those widths alone, never by the browser.
//
// A layout is a list of pages, each a list of items in points from the top left of the page:
// text, at its baseline, a block of color, or the logo. The pages' previews and pdf.py draw the
// items and decide nothing. A text's angle turns it counterclockwise about its point.

export type FontKey = "sans" | "sans_semibold" | "serif" | "mono" | "mono_medium";
export type Kind = "invoice" | "quote";
export type Design = "classic" | "banner" | "ledger";
export type Mark = "paid" | "overdue" | "void" | "draft";
type Anchor = "start" | "end" | "middle";

type Style = { font: FontKey; size: number; color: string };
type RowStyle = Style & { line_height: number };
type TextRow = RowStyle & ({ word: string; heads?: string; field?: never } | { field: string; word?: never });
type Backing = { color: string; radius: number; padding_x: number; padding_y: number };

type Placed = { id: string; y?: number; below?: string[]; gap?: number };
type TextBlock = Placed & {
  kind: "text";
  x: number;
  width: number;
  anchor: "start" | "end";
  rows: TextRow[];
  backing?: Backing;
};
type PairsBlock = Placed & {
  kind: "pairs";
  x: number;
  width: number;
  line_height: number;
  label: Style;
  value: Style;
  rows: { word: string; field: string }[];
};
type LogoBlock = Placed & { kind: "logo"; x: number; align: "start" | "end" };
type FillBlock = Placed & { kind: "block"; x: number; width: number; height: number; color: string; radius: number };
type Block = TextBlock | PairsBlock | LogoBlock | FillBlock;

type Table = {
  below: string[];
  gap: number;
  inset: number;
  column_gap: number;
  labels: [string, string, string, string];
  heading: Style & { height: number };
  name: RowStyle;
  description: RowStyle;
  figures: Style;
  padding: number;
  stripe: { color: string; radius: number } | null;
};
type Totals = {
  gap: number;
  x: number;
  right: number;
  line_height: number;
  label: Style;
  value: Style;
  total: {
    line_height: number;
    label: Style;
    value: Style;
    fill: { color: string; radius: number; padding: number } | null;
  };
};
type DesignSpec = { blocks: Block[]; table: Table; totals: Totals };

type Designs = {
  page: {
    width: number;
    height: number;
    left: number;
    right: number;
    top: number;
    bottom: number;
    footer: Style & { x: number; y: number };
  };
  colors: Record<string, string>;
  logo: { width: number; height: number };
  watermark: Style & { text: string; opacity: number; angle: number; x: number; y: number };
  kinds: Record<Kind, { words: Record<string, string>; heading_when_blank: boolean }>;
  designs: Record<Design, DesignSpec>;
};

type Fonts = Record<FontKey, { units_per_em: number; widths: Record<string, number> }>;

export const DESIGNS = designsJson as unknown as Designs;
const FONTS = fontsJson.fonts as unknown as Fonts;

/** A quote or an invoice as the layout takes it: plain values, as the backend gives layout.py. */
export type DocumentValues = {
  kind: Kind;
  design: Design;
  accent: string;
  /** The logo's size in pixels, or null for none. */
  logo: { width: number; height: number } | null;
  company: { name: string | null; address: string | null; email: string | null; phone: string | null };
  /** Null on a draft. */
  number: string | null;
  /**
   * ISO dates: an invoice's issue and due dates, or a quote's date and valid-until date. A draft
   * invoice's are the ones it would have if issued today. Blank while a draft's date box is.
   */
  date: string;
  end_date: string;
  /** Who it's for: an invoice's Bill to, or who a quote is prepared for, on its lines. */
  recipient: string | null;
  lines: { name: string; description: string | null; quantity: number; unit_price_cents: number }[];
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
  paid_cents: number;
  tax_label: string | null;
  tax_rate: string;
  mark: Mark | null;
};

/** How a quote or an invoice looks: the design, the accent color and the logo's size. */
export type DocumentLook = Pick<DocumentValues, "design" | "accent" | "logo">;

/** How quotes and invoices look, from Company settings as they are now (B18, V13), as pdf.py's look() gives it. */
export function look(settings: CompanySettings): DocumentLook {
  return {
    design: settings.invoice_design,
    accent: settings.accent_color,
    logo: settings.logo && { width: settings.logo.width, height: settings.logo.height },
  };
}

export type TextItem = Style & {
  kind: "text";
  x: number;
  y: number;
  anchor: Anchor;
  text: string;
  angle?: number;
  opacity?: number;
};
export type BlockItem = {
  kind: "block";
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  radius: number;
};
export type LogoItem = { kind: "logo"; x: number; y: number; width: number; height: number };
export type Item = TextItem | BlockItem | LogoItem;
export type Page = Item[];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MARKS: Record<Mark, string> = { paid: "PAID", overdue: "OVERDUE", void: "VOID", draft: "DRAFT" };
// A character no font has, such as one typed into a draft and not yet refused, is measured as "?".
const STAND_IN = "?";
const TOTALS_GAP = 12;

// Words and figures as quotes and invoices write them

function grouped(whole: number): string {
  return String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** $1,250.00, from whole cents. */
export function money(cents: number): string {
  const rest = cents % 100;
  return `$${grouped((cents - rest) / 100)}.${String(rest).padStart(2, "0")}`;
}

export function quantity(count: number): string {
  return grouped(count);
}

/** Oct 31, 2026, from 2026-10-31. */
export function day(iso: string): string {
  const [year, month, date] = iso.split("-").map(Number);
  return `${MONTHS[month - 1]} ${date}, ${year}`;
}

/** Sales tax (8.875%). */
export function taxText(label: string | null, rate: string): string {
  return `${label || "Tax"} (${rate}%)`;
}

// Measuring and breaking lines

function units(text: string, font: FontKey): number {
  const widths = FONTS[font].widths;
  let total = 0;
  for (const character of text) total += widths[character] ?? widths[STAND_IN];
  return total;
}

export function widthOf(text: string, font: FontKey, size: number): number {
  return (units(text, font) * size) / FONTS[font].units_per_em;
}

function fits(text: string, font: FontKey, size: number, width: number): boolean {
  return units(text, font) * size <= width * FONTS[font].units_per_em;
}

const hasText = (line: string) => /[^ ]/.test(line);
const trimEnd = (line: string) => line.replace(/ +$/, "");

/** A word wider than the column breaks between characters, with at least one on each line. */
function breakWord(start: string, word: string, font: FontKey, size: number, width: number): [string[], string] {
  const done: string[] = [];
  let line = start;
  for (const character of word) {
    if (hasText(line) && !fits(line + character, font, size, width)) {
      done.push(trimEnd(line));
      line = "";
    }
    line += character;
  }
  return [done, line];
}

function wrapParagraph(paragraph: string, font: FontKey, size: number, width: number): string[] {
  const done: string[] = [];
  let line = "";
  for (const token of paragraph.match(/ +|[^ ]+/g) ?? []) {
    if (token.startsWith(" ") || fits(line + token, font, size, width)) {
      line += token;
      continue;
    }
    if (hasText(line)) {
      done.push(trimEnd(line));
      line = "";
    }
    if (fits(line + token, font, size, width)) line += token;
    else {
      const [broken, rest] = breakWord(line, token, font, size, width);
      done.push(...broken);
      line = rest;
    }
  }
  done.push(trimEnd(line));
  return done;
}

/** Breaks greedily at spaces, keeps explicit line breaks, and leaves out spaces at a line's end. */
export function wrap(text: string, font: FontKey, size: number, width: number): string[] {
  return text.split("\n").flatMap((paragraph) => wrapParagraph(paragraph, font, size, width));
}

function baseline(lineTop: number, lineHeight: number, size: number): number {
  return lineTop + (lineHeight + 0.7 * size) / 2;
}

// Colors and items

function color(name: string, doc: DocumentValues): string {
  if (name === "accent") return doc.accent;
  if (name === "mark") return DESIGNS.colors[doc.mark ?? ""];
  return DESIGNS.colors[name];
}

function textItem(text: string, x: number, y: number, style: Style, anchor: Anchor, doc: DocumentValues): TextItem {
  return { kind: "text", x, y, font: style.font, size: style.size, color: color(style.color, doc), anchor, text };
}

function blockItem(x: number, y: number, width: number, height: number, fill: string, radius: number): BlockItem {
  return { kind: "block", x, y, width, height, color: fill, radius };
}

// The first page's blocks

/** What's still to pay: an invoice's balance, nothing on a void one, and a quote's total. */
function amountDue(doc: DocumentValues): number {
  return doc.mark === "void" ? 0 : doc.total_cents - doc.paid_cents;
}

function field(name: string, doc: DocumentValues): string | null {
  const { company } = doc;
  const values: Record<string, string | null> = {
    company_name: company.name,
    company_address: company.address,
    company_email: company.email,
    company_phone: company.phone,
    recipient: doc.recipient,
    number: doc.number ?? "Draft",
    date: doc.date ? day(doc.date) : null,
    end_date: doc.end_date ? day(doc.end_date) : null,
    mark: doc.mark ? MARKS[doc.mark] : null,
    amount_due: money(amountDue(doc)),
  };
  return values[name];
}

/** One of the document's own words, such as Invoice or Quote for its title. */
function word(name: string, doc: DocumentValues): string {
  return DESIGNS.kinds[doc.kind].words[name];
}

/**
 * A row's text: one of the document's own words or a field's value. A heading over a blank
 * field is left out where its kind says so, as a quote's Prepared for is (Q18).
 */
function blockRowText(row: TextRow, doc: DocumentValues): string | null {
  if (row.word === undefined) return field(row.field!, doc);
  if (row.heads && !field(row.heads, doc) && !DESIGNS.kinds[doc.kind].heading_when_blank) return null;
  return word(row.word, doc);
}

type Drawn = [Page, number];

function backingItem(block: TextBlock, line: string, row: TextRow, lineTop: number, doc: DocumentValues) {
  const backing = block.backing!;
  const width = widthOf(line, row.font, row.size) + 2 * backing.padding_x;
  const height = row.size + 2 * backing.padding_y;
  const x = block.anchor === "start" ? block.x - backing.padding_x : block.x - width + backing.padding_x;
  const top = lineTop + (row.line_height - height) / 2;
  return blockItem(x, top, width, height, color(backing.color, doc), backing.radius);
}

function textBlock(block: TextBlock, top: number, doc: DocumentValues): Drawn {
  const items: Page = [];
  let cursor = top;
  for (const row of block.rows) {
    const text = blockRowText(row, doc);
    if (!text) continue;
    for (const line of wrap(text, row.font, row.size, block.width)) {
      if (line && block.backing) items.push(backingItem(block, line, row, cursor, doc));
      if (line) {
        const y = baseline(cursor, row.line_height, row.size);
        items.push(textItem(line, block.x, y, row, block.anchor, doc));
      }
      cursor += row.line_height;
    }
  }
  return [items, cursor];
}

function pairs(block: PairsBlock, top: number, doc: DocumentValues): Drawn {
  const items: Page = [];
  let cursor = top;
  const { label, value } = block;
  for (const row of block.rows) {
    const shown = field(row.field, doc);
    const y = baseline(cursor, block.line_height, Math.max(label.size, value.size));
    items.push(textItem(word(row.word, doc), block.x, y, label, "start", doc));
    items.push(textItem(shown ?? "", block.x + block.width, y, value, "end", doc));
    cursor += block.line_height;
  }
  return [items, cursor];
}

/** Fitted inside 2 inches by 0.75, keeping its shape (V28). */
export function logoSize(logo: { width: number; height: number }): [number, number] {
  const { width: boxWidth, height: boxHeight } = DESIGNS.logo;
  if (logo.width * boxHeight >= logo.height * boxWidth) return [boxWidth, (logo.height * boxWidth) / logo.width];
  return [(logo.width * boxHeight) / logo.height, boxHeight];
}

/** With no logo, its space is left out, so what's placed below it takes its place (B22). */
function logo(block: LogoBlock, top: number, doc: DocumentValues): Drawn {
  if (doc.logo === null) return [[], top];
  const [width, height] = logoSize(doc.logo);
  const x = block.align === "start" ? block.x : block.x + DESIGNS.logo.width - width;
  return [[{ kind: "logo", x, y: top, width, height }], top + height];
}

function fill(block: FillBlock, top: number, doc: DocumentValues): Drawn {
  const shade = color(block.color, doc);
  return [[blockItem(block.x, top, block.width, block.height, shade, block.radius)], top + block.height];
}

function draw(block: Block, top: number, doc: DocumentValues): Drawn {
  switch (block.kind) {
    case "text":
      return textBlock(block, top, doc);
    case "pairs":
      return pairs(block, top, doc);
    case "logo":
      return logo(block, top, doc);
    case "block":
      return fill(block, top, doc);
  }
}

type Placement = { top: number; bottom: number; drawn: boolean };

/** The lowest bottom of these blocks plus the gap, where a block with nothing in it counts its top and no gap. */
function below(placed: Map<string, Placement>, ids: string[], gap: number): number {
  return Math.max(
    ...ids.map((id) => {
      const { top, bottom, drawn } = placed.get(id)!;
      return drawn ? bottom + gap : top;
    }),
  );
}

function firstPage(design: DesignSpec, doc: DocumentValues): [Page, Map<string, Placement>] {
  const items: Page = [];
  const placed = new Map<string, Placement>();
  for (const block of design.blocks) {
    const top = block.y ?? below(placed, block.below!, block.gap!);
    const [drawn, bottom] = draw(block, top, doc);
    placed.set(block.id, { top, bottom, drawn: drawn.length > 0 });
    items.push(...drawn);
  }
  return [items, placed];
}

// The lines' table

type Line = DocumentValues["lines"][number];
type Columns = { left: number; right: number; amount: number; unit: number; qty: number; description: number };

/** From the right: each figure's column as wide as its widest figure or its heading. */
function columnsFor(table: Table, lines: Line[]): Columns {
  const { page } = DESIGNS;
  const { heading, figures } = table;
  const left = page.left + table.inset;
  const right = page.right - table.inset;
  const widest = (label: string, texts: string[]) =>
    Math.max(
      widthOf(label, heading.font, heading.size),
      ...texts.map((text) => widthOf(text, figures.font, figures.size)),
    );
  const [, qtyLabel, unitLabel, amountLabel] = table.labels;
  const amount = widest(
    amountLabel,
    lines.map((line) => money(line.quantity * line.unit_price_cents)),
  );
  const unit = widest(
    unitLabel,
    lines.map((line) => money(line.unit_price_cents)),
  );
  const qty = widest(
    qtyLabel,
    lines.map((line) => quantity(line.quantity)),
  );
  const gap = table.column_gap;
  const unitRight = right - amount - gap;
  const qtyRight = unitRight - unit - gap;
  return { left, right, amount: right, unit: unitRight, qty: qtyRight, description: qtyRight - qty - gap - left };
}

function heading(table: Table, columns: Columns, top: number, doc: DocumentValues): Page {
  const style = table.heading;
  const y = baseline(top, style.height, style.size);
  const [description, qty, unit, amount] = table.labels;
  return [
    textItem(description, columns.left, y, style, "start", doc),
    textItem(qty, columns.qty, y, style, "end", doc),
    textItem(unit, columns.unit, y, style, "end", doc),
    textItem(amount, columns.amount, y, style, "end", doc),
  ];
}

/** A row's lines of text, each with its style: the name's, then the description's. */
type RowText = [RowStyle, string][];

function rowText(table: Table, columns: Columns, line: Line): RowText {
  const { name, description } = table;
  const width = columns.description;
  const names = wrap(line.name, name.font, name.size, width);
  const described = line.description ? wrap(line.description, description.font, description.size, width) : [];
  return [
    ...names.map((text): [RowStyle, string] => [name, text]),
    ...described.map((text): [RowStyle, string] => [description, text]),
  ];
}

function rowHeight(table: Table, texts: RowText): number {
  return 2 * table.padding + texts.reduce((sum, [style]) => sum + style.line_height, 0);
}

/** How many of a row's lines fit in this much room, with the row's padding above and below. */
function fitting(table: Table, texts: RowText, room: number): number {
  let count = 0;
  while (count < texts.length && rowHeight(table, texts.slice(0, count + 1)) <= room) count += 1;
  return count;
}

/**
 * A row, or the part of one on this page. Its figures sit beside its first line, so a later
 * part of a row too tall for one page is given no line, and has none.
 */
function rowItems(
  table: Table,
  columns: Columns,
  line: Line | null,
  texts: RowText,
  top: number,
  index: number,
  doc: DocumentValues,
) {
  const items: Page = [];
  const { stripe } = table;
  if (stripe !== null && index % 2 === 0) {
    const width = columns.right - columns.left + 2 * table.inset;
    const height = rowHeight(table, texts);
    items.push(blockItem(columns.left - table.inset, top, width, height, color(stripe.color, doc), stripe.radius));
  }
  let cursor = top + table.padding;
  const first = baseline(cursor, table.name.line_height, table.name.size);
  for (const [style, text] of texts) {
    if (text)
      items.push(textItem(text, columns.left, baseline(cursor, style.line_height, style.size), style, "start", doc));
    cursor += style.line_height;
  }
  if (line === null) return items;
  const { figures } = table;
  const amount = line.quantity * line.unit_price_cents;
  items.push(textItem(quantity(line.quantity), columns.qty, first, figures, "end", doc));
  items.push(textItem(money(line.unit_price_cents), columns.unit, first, figures, "end", doc));
  items.push(textItem(money(amount), columns.amount, first, figures, "end", doc));
  return items;
}

// The totals

/** Each row's label, figure and whether it's the total. Once anything is paid, Paid and Balance due follow (V27). */
function totalsRows(doc: DocumentValues): [string, number, boolean][] {
  const rows: [string, number, boolean][] = [
    ["Subtotal", doc.subtotal_cents, false],
    [taxText(doc.tax_label, doc.tax_rate), doc.tax_cents, false],
    ["Total", doc.total_cents, true],
  ];
  if (doc.paid_cents > 0) {
    rows.push(["Paid", doc.paid_cents, false], ["Balance due", amountDue(doc), false]);
  }
  return rows;
}

/** The totals' height, and a function that places them at a top, so they're kept together. */
function totalsFor(design: DesignSpec, doc: DocumentValues): [number, (top: number) => Page] {
  const { totals } = design;
  const rows = totalsRows(doc);
  const styles = (isTotal: boolean) =>
    isTotal ? totals.total : { label: totals.label, value: totals.value, line_height: totals.line_height };
  const valueWidth = Math.max(
    ...rows.map(([, cents, isTotal]) => widthOf(money(cents), styles(isTotal).value.font, styles(isTotal).value.size)),
  );
  const labelWidth = totals.right - totals.x - valueWidth - TOTALS_GAP;
  const laid = rows.map(([label, cents, isTotal]) => {
    const style = styles(isTotal);
    return {
      ...style,
      texts: wrap(label, style.label.font, style.label.size, labelWidth),
      figure: money(cents),
      isTotal,
    };
  });
  const height = laid.reduce((sum, { texts, line_height }) => sum + texts.length * line_height, 0);

  function place(top: number): Page {
    const items: Page = [];
    let cursor = top;
    for (const { texts, figure, isTotal, label, value, line_height } of laid) {
      const filled = totals.total.fill;
      if (isTotal && filled !== null) {
        const width = totals.right - totals.x + 2 * filled.padding;
        const shade = color(filled.color, doc);
        items.push(
          blockItem(totals.x - filled.padding, cursor, width, texts.length * line_height, shade, filled.radius),
        );
      }
      const first = baseline(cursor, line_height, label.size);
      for (const text of texts) {
        items.push(textItem(text, totals.x, baseline(cursor, line_height, label.size), label, "start", doc));
        cursor += line_height;
      }
      items.push(textItem(figure, totals.right, first, value, "end", doc));
    }
    return items;
  }

  return [height, place];
}

// The pages

/** The pages as the lines fill them, with the headings over each page's first row (V26). */
class Pages {
  table: Table;
  columns: Columns;
  doc: DocumentValues;
  pages: Page[];
  cursor: number;
  headed = false;

  constructor(table: Table, columns: Columns, doc: DocumentValues, first: Page, top: number) {
    this.table = table;
    this.columns = columns;
    this.doc = doc;
    this.pages = [first];
    this.cursor = top;
  }

  /** What's left on this page for a row, after the headings if they're still to come. */
  room() {
    const headingHeight = this.headed ? 0 : this.table.heading.height;
    return DESIGNS.page.bottom - this.cursor - headingHeight;
  }

  /** A new page with nothing on it yet, which a row never leaves for the next. */
  fresh() {
    return !this.headed && this.cursor <= DESIGNS.page.top;
  }

  turn() {
    this.pages.push([]);
    this.cursor = DESIGNS.page.top;
    this.headed = false;
  }

  head() {
    if (this.headed) return;
    this.pages[this.pages.length - 1].push(...heading(this.table, this.columns, this.cursor, this.doc));
    this.cursor += this.table.heading.height;
    this.headed = true;
  }

  place(line: Line | null, texts: RowText, index: number) {
    this.head();
    const items = rowItems(this.table, this.columns, line, texts, this.cursor, index, this.doc);
    this.pages[this.pages.length - 1].push(...items);
    this.cursor += rowHeight(this.table, texts);
  }

  /** On this page, or the next if it doesn't fit. */
  placeWhole(line: Line, texts: RowText, index: number) {
    if (rowHeight(this.table, texts) > this.room() && !this.fresh()) this.turn();
    this.place(line, texts, index);
  }

  /** A row taller than a page carries on from page to page, as much on each as fits. */
  placeInParts(line: Line, texts: RowText, index: number) {
    let shown: Line | null = line;
    let left = texts;
    while (left.length > 0) {
      const fits = fitting(this.table, left, this.room());
      if (fits === 0 && !this.fresh()) {
        this.turn();
        continue;
      }
      const count = Math.max(fits, 1);
      this.place(shown, left.slice(0, count), index);
      left = left.slice(count);
      shown = null;
      if (left.length > 0) this.turn();
    }
  }
}

/**
 * The lines from the top given, onto new pages as they fill, then the totals, kept together
 * (V26). Each row is kept whole, unless it's taller than a page on its own.
 */
function flow(design: DesignSpec, doc: DocumentValues, first: Page, top: number): Page[] {
  const { page } = DESIGNS;
  const { table } = design;
  const { lines } = doc;
  const columns = columnsFor(table, lines);
  const pages = new Pages(table, columns, doc, first, top);
  const wholePage = page.bottom - page.top - table.heading.height;
  lines.forEach((line, index) => {
    const texts = rowText(table, columns, line);
    if (rowHeight(table, texts) <= wholePage) pages.placeWhole(line, texts, index);
    else pages.placeInParts(line, texts, index);
  });
  pages.head();
  const [height, place] = totalsFor(design, doc);
  pages.cursor += design.totals.gap;
  if (pages.cursor + height > page.bottom) pages.turn();
  pages.pages[pages.pages.length - 1].push(...place(pages.cursor));
  return pages.pages;
}

/** Each page ends with the number and the page, and a void invoice has VOID across every page (V26, V27). */
function footerAndWatermark(pages: Page[], doc: DocumentValues) {
  const { footer } = DESIGNS.page;
  const { watermark } = DESIGNS;
  pages.forEach((items, index) => {
    const said = `${doc.number ?? "Draft"}, page ${index + 1} of ${pages.length}`;
    items.push(textItem(said, footer.x, footer.y, footer, "start", doc));
    if (doc.mark === "void") {
      const mark = textItem(watermark.text, watermark.x, watermark.y, watermark, "middle", doc);
      items.push({ ...mark, angle: watermark.angle, opacity: watermark.opacity });
    }
  });
}

/** A quote's or an invoice's pages, from its plain values, as layout.py lays them out. */
export function layOut(doc: DocumentValues): Page[] {
  const design = DESIGNS.designs[doc.design];
  const [first, placed] = firstPage(design, doc);
  const top = below(placed, design.table.below, design.table.gap);
  const pages = flow(design, doc, first, top);
  footerAndWatermark(pages, doc);
  return pages;
}
