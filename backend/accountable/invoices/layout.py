"""Where everything goes on each page of an invoice (V24, V26 to V28), from shared/invoice-designs.json.

frontend/src/invoices/layout.ts does the same, step for step, from the same JSON and the same
widths in shared/invoice-fonts.json, so the preview and the PDF break lines and turn pages at
the same places. Both run the cases in shared/invoice-layout-cases.json. Text is measured
from those widths alone, never by the browser or ReportLab.

A layout is a list of pages, each a list of items in points from the top left of the page:
text, at its baseline, a block of color, or the logo. pdf.py and InvoicePreview.tsx draw the
items and decide nothing. A text's angle turns it counterclockwise about its point.
"""

import json
import re
from collections.abc import Sequence
from typing import Any

from accountable import db
from accountable.invoices import fonts

DESIGNS = json.loads((db.ROOT / "shared" / "invoice-designs.json").read_text())
FONTS = fonts.read()["fonts"]

Item = dict[str, Any]
Page = list[Item]

MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
MARKS = {"paid": "PAID", "overdue": "OVERDUE", "void": "VOID", "draft": "DRAFT"}
# A character no font has, such as one typed into a draft and not yet refused, is measured as "?".
STAND_IN = "?"
TOTALS_GAP = 12


# Words and figures as invoices write them


def money(cents: int) -> str:
    """$1,250.00, from whole cents."""
    return f"${cents // 100:,}.{cents % 100:02d}"


def quantity(count: int) -> str:
    return f"{count:,}"


def day(iso: str) -> str:
    """Oct 31, 2026, from 2026-10-31."""
    year, month, date = (int(part) for part in iso.split("-"))
    return f"{MONTHS[month - 1]} {date}, {year}"


def tax_text(label: str | None, rate: str) -> str:
    """Sales tax (8.875%)."""
    return f"{label or 'Tax'} ({rate}%)"


# Measuring and breaking lines


def units(text: str, font: str) -> int:
    widths = FONTS[font]["widths"]
    return sum(widths.get(character, widths[STAND_IN]) for character in text)


def width_of(text: str, font: str, size: float) -> float:
    return units(text, font) * size / FONTS[font]["units_per_em"]


def _fits(text: str, font: str, size: float, width: float) -> bool:
    return units(text, font) * size <= width * FONTS[font]["units_per_em"]


def _break_word(line: str, word: str, font: str, size: float, width: float) -> tuple[list[str], str]:
    """A word wider than the column breaks between characters, with at least one on each line."""
    done = []
    for character in word:
        if line.strip(" ") and not _fits(line + character, font, size, width):
            done.append(line.rstrip(" "))
            line = ""
        line += character
    return done, line


def _wrap_paragraph(paragraph: str, font: str, size: float, width: float) -> list[str]:
    done: list[str] = []
    line = ""
    for token in re.findall(r" +|[^ ]+", paragraph):
        if token.startswith(" ") or _fits(line + token, font, size, width):
            line += token
            continue
        if line.strip(" "):
            done.append(line.rstrip(" "))
            line = ""
        if _fits(line + token, font, size, width):
            line += token
        else:
            broken, line = _break_word(line, token, font, size, width)
            done.extend(broken)
    done.append(line.rstrip(" "))
    return done


def wrap(text: str, font: str, size: float, width: float) -> list[str]:
    """Breaks greedily at spaces, keeps explicit line breaks, and leaves out spaces at a line's end."""
    return [line for paragraph in text.split("\n") for line in _wrap_paragraph(paragraph, font, size, width)]


def baseline(line_top: float, line_height: float, size: float) -> float:
    return line_top + (line_height + 0.7 * size) / 2


# Colors and items


def color(name: str, invoice: dict[str, Any]) -> str:
    if name == "accent":
        return invoice["accent"]
    if name == "mark":
        return DESIGNS["colors"][invoice["mark"]]
    return DESIGNS["colors"][name]


def text_item(text: str, x: float, y: float, style: dict[str, Any], anchor: str, invoice: dict[str, Any]) -> Item:
    return {
        "kind": "text",
        "x": x,
        "y": y,
        "font": style["font"],
        "size": style["size"],
        "color": color(style["color"], invoice),
        "anchor": anchor,
        "text": text,
    }


def block_item(x: float, y: float, width: float, height: float, fill: str, radius: float) -> Item:
    return {"kind": "block", "x": x, "y": y, "width": width, "height": height, "color": fill, "radius": radius}


# The first page's blocks


def field(name: str, invoice: dict[str, Any]) -> str | None:
    company = invoice["company"]
    values = {
        "company_name": company["name"],
        "company_address": company["address"],
        "company_email": company["email"],
        "company_phone": company["phone"],
        "bill_to": invoice["bill_to"],
        "number": invoice["number"] or "Draft",
        "issue_date": day(invoice["issue_date"]),
        "due_date": day(invoice["due_date"]),
        "mark": MARKS.get(invoice["mark"] or ""),
        "balance_due": money(balance_due(invoice)),
    }
    return values[name]


def balance_due(invoice: dict[str, Any]) -> int:
    return 0 if invoice["mark"] == "void" else invoice["total_cents"] - invoice["paid_cents"]


def _backing(block: dict[str, Any], line: str, row: dict[str, Any], line_top: float, invoice: dict[str, Any]) -> Item:
    backing = block["backing"]
    width = width_of(line, row["font"], row["size"]) + 2 * backing["padding_x"]
    height = row["size"] + 2 * backing["padding_y"]
    x = block["x"] - backing["padding_x"] if block["anchor"] == "start" else block["x"] - width + backing["padding_x"]
    top = line_top + (row["line_height"] - height) / 2
    return block_item(x, top, width, height, color(backing["color"], invoice), backing["radius"])


def _text_block(block: dict[str, Any], top: float, invoice: dict[str, Any]) -> tuple[Page, float]:
    items: Page = []
    cursor = top
    for row in block["rows"]:
        text = row.get("text") or field(row["field"], invoice)
        if not text:
            continue
        for line in wrap(text, row["font"], row["size"], block["width"]):
            if line and "backing" in block:
                items.append(_backing(block, line, row, cursor, invoice))
            if line:
                y = baseline(cursor, row["line_height"], row["size"])
                items.append(text_item(line, block["x"], y, row, block["anchor"], invoice))
            cursor += row["line_height"]
    return items, cursor


def _pairs(block: dict[str, Any], top: float, invoice: dict[str, Any]) -> tuple[Page, float]:
    items: Page = []
    cursor = top
    label, value = block["label"], block["value"]
    for row in block["rows"]:
        shown = field(row["field"], invoice)
        y = baseline(cursor, block["line_height"], max(label["size"], value["size"]))
        items.append(text_item(row["label"], block["x"], y, label, "start", invoice))
        items.append(text_item(shown or "", block["x"] + block["width"], y, value, "end", invoice))
        cursor += block["line_height"]
    return items, cursor


def logo_size(logo: dict[str, int]) -> tuple[float, float]:
    """Fitted inside 2 inches by 0.75, keeping its shape (V28)."""
    box_width, box_height = DESIGNS["logo"]["width"], DESIGNS["logo"]["height"]
    if logo["width"] * box_height >= logo["height"] * box_width:
        return box_width, logo["height"] * box_width / logo["width"]
    return logo["width"] * box_height / logo["height"], box_height


def _logo(block: dict[str, Any], top: float, invoice: dict[str, Any]) -> tuple[Page, float]:
    """With no logo, its space is left out, so what's placed below it takes its place (B22)."""
    if invoice["logo"] is None:
        return [], top
    width, height = logo_size(invoice["logo"])
    x = block["x"] if block["align"] == "start" else block["x"] + DESIGNS["logo"]["width"] - width
    return [{"kind": "logo", "x": x, "y": top, "width": width, "height": height}], top + height


def _fill(block: dict[str, Any], top: float, invoice: dict[str, Any]) -> tuple[Page, float]:
    fill = color(block["color"], invoice)
    return [block_item(block["x"], top, block["width"], block["height"], fill, block["radius"])], top + block["height"]


DRAW = {"text": _text_block, "pairs": _pairs, "logo": _logo, "block": _fill}


def below(placed: dict[str, tuple[float, float, bool]], ids: Sequence[str], gap: float) -> float:
    """The lowest bottom of these blocks plus the gap, where a block with nothing in it counts its top and no gap."""
    return max(bottom + gap if drawn else top for top, bottom, drawn in (placed[name] for name in ids))


def _first_page(design: dict[str, Any], invoice: dict[str, Any]) -> tuple[Page, dict[str, tuple[float, float, bool]]]:
    items: Page = []
    placed: dict[str, tuple[float, float, bool]] = {}
    for block in design["blocks"]:
        top = block["y"] if "y" in block else below(placed, block["below"], block["gap"])
        drawn, bottom = DRAW[block["kind"]](block, top, invoice)
        placed[block["id"]] = (top, bottom, bool(drawn))
        items.extend(drawn)
    return items, placed


# The lines' table


def _columns(table: dict[str, Any], lines: list[dict[str, Any]]) -> dict[str, float]:
    """From the right: each figure's column as wide as its widest figure or its heading."""
    page = DESIGNS["page"]
    heading, figures = table["heading"], table["figures"]
    left, right = page["left"] + table["inset"], page["right"] - table["inset"]

    def widest(label: str, texts: list[str]) -> float:
        measured = [width_of(text, figures["font"], figures["size"]) for text in texts]
        return max([width_of(label, heading["font"], heading["size"]), *measured])

    _, qty_label, unit_label, amount_label = table["labels"]
    amount = widest(amount_label, [money(line["quantity"] * line["unit_price_cents"]) for line in lines])
    unit = widest(unit_label, [money(line["unit_price_cents"]) for line in lines])
    qty = widest(qty_label, [quantity(line["quantity"]) for line in lines])
    gap = table["column_gap"]
    unit_right = right - amount - gap
    qty_right = unit_right - unit - gap
    return {
        "left": left,
        "right": right,
        "amount": right,
        "unit": unit_right,
        "qty": qty_right,
        "description": qty_right - qty - gap - left,
    }


def _heading(table: dict[str, Any], columns: dict[str, float], top: float, invoice: dict[str, Any]) -> Page:
    style = table["heading"]
    y = baseline(top, style["height"], style["size"])
    description, qty, unit, amount = table["labels"]
    return [
        text_item(description, columns["left"], y, style, "start", invoice),
        text_item(qty, columns["qty"], y, style, "end", invoice),
        text_item(unit, columns["unit"], y, style, "end", invoice),
        text_item(amount, columns["amount"], y, style, "end", invoice),
    ]


RowText = list[tuple[dict[str, Any], str]]
"""A row's lines of text, each with its style: the name's, then the description's."""


def _row_text(table: dict[str, Any], columns: dict[str, float], line: dict[str, Any]) -> RowText:
    name, description = table["name"], table["description"]
    width = columns["description"]
    names = wrap(line["name"], name["font"], name["size"], width)
    described = (
        wrap(line["description"], description["font"], description["size"], width) if line["description"] else []
    )
    return [(name, text) for text in names] + [(description, text) for text in described]


def _height(table: dict[str, Any], texts: RowText) -> float:
    return 2 * table["padding"] + sum(style["line_height"] for style, _ in texts)


def _fitting(table: dict[str, Any], texts: RowText, room: float) -> int:
    """How many of a row's lines fit in this much room, with the row's padding above and below."""
    count = 0
    while count < len(texts) and _height(table, texts[: count + 1]) <= room:
        count += 1
    return count


def _row_items(
    table: dict[str, Any],
    columns: dict[str, float],
    line: dict[str, Any] | None,
    texts: RowText,
    top: float,
    index: int,
    invoice: dict[str, Any],
) -> Page:
    """A row, or the part of one on this page. Its figures sit beside its first line, so a
    later part of a row too tall for one page is given no line, and has none."""
    items: Page = []
    stripe = table["stripe"]
    if stripe is not None and index % 2 == 0:
        width = columns["right"] - columns["left"] + 2 * table["inset"]
        height = _height(table, texts)
        items.append(
            block_item(
                columns["left"] - table["inset"], top, width, height, color(stripe["color"], invoice), stripe["radius"]
            )
        )
    cursor = top + table["padding"]
    first = baseline(cursor, table["name"]["line_height"], table["name"]["size"])
    for style, text in texts:
        if text:
            y = baseline(cursor, style["line_height"], style["size"])
            items.append(text_item(text, columns["left"], y, style, "start", invoice))
        cursor += style["line_height"]
    if line is None:
        return items
    figures = table["figures"]
    amount = line["quantity"] * line["unit_price_cents"]
    items.append(text_item(quantity(line["quantity"]), columns["qty"], first, figures, "end", invoice))
    items.append(text_item(money(line["unit_price_cents"]), columns["unit"], first, figures, "end", invoice))
    items.append(text_item(money(amount), columns["amount"], first, figures, "end", invoice))
    return items


# The totals


def _totals_rows(invoice: dict[str, Any]) -> list[tuple[str, int, bool]]:
    """Each row's label, figure and whether it's the total. Once anything is paid, Paid and Balance due follow (V27)."""
    rows = [
        ("Subtotal", invoice["subtotal_cents"], False),
        (tax_text(invoice["tax_label"], invoice["tax_rate"]), invoice["tax_cents"], False),
        ("Total", invoice["total_cents"], True),
    ]
    if invoice["paid_cents"] > 0:
        rows += [("Paid", invoice["paid_cents"], False), ("Balance due", balance_due(invoice), False)]
    return rows


def _totals(design: dict[str, Any], invoice: dict[str, Any]) -> tuple[float, Any]:
    """The totals' height, and a function that places them at a top, so they're kept together."""
    totals = design["totals"]
    rows = _totals_rows(invoice)

    def styles(is_total: bool) -> tuple[dict[str, Any], dict[str, Any], float]:
        chosen = totals["total"] if is_total else totals
        return chosen["label"], chosen["value"], chosen["line_height"]

    value_width = max(
        width_of(money(cents), styles(is_total)[1]["font"], styles(is_total)[1]["size"]) for _, cents, is_total in rows
    )
    label_width = totals["right"] - totals["x"] - value_width - TOTALS_GAP
    laid = []
    for label, cents, is_total in rows:
        label_style, value_style, line_height = styles(is_total)
        texts = wrap(label, label_style["font"], label_style["size"], label_width)
        laid.append((texts, money(cents), is_total, label_style, value_style, line_height))
    height = sum(len(texts) * line_height for texts, *_rest, line_height in laid)

    def place(top: float) -> Page:
        items: Page = []
        cursor = top
        for texts, value, is_total, label_style, value_style, line_height in laid:
            fill = totals["total"]["fill"]
            if is_total and fill is not None:
                width = totals["right"] - totals["x"] + 2 * fill["padding"]
                items.append(
                    block_item(
                        totals["x"] - fill["padding"],
                        cursor,
                        width,
                        len(texts) * line_height,
                        color(fill["color"], invoice),
                        fill["radius"],
                    )
                )
            first = baseline(cursor, line_height, label_style["size"])
            for text in texts:
                y = baseline(cursor, line_height, label_style["size"])
                items.append(text_item(text, totals["x"], y, label_style, "start", invoice))
                cursor += line_height
            items.append(text_item(value, totals["right"], first, value_style, "end", invoice))
        return items

    return height, place


# The pages


class _Pages:
    """The pages as the lines fill them, with the headings over each page's first row (V26)."""

    def __init__(
        self, table: dict[str, Any], columns: dict[str, float], invoice: dict[str, Any], first: Page, top: float
    ):
        self.table, self.columns, self.invoice = table, columns, invoice
        self.pages, self.cursor, self.headed = [first], top, False

    def room(self) -> float:
        """What's left on this page for a row, after the headings if they're still to come."""
        heading = 0 if self.headed else self.table["heading"]["height"]
        return DESIGNS["page"]["bottom"] - self.cursor - heading

    def fresh(self) -> bool:
        """A new page with nothing on it yet, which a row never leaves for the next."""
        return not self.headed and self.cursor <= DESIGNS["page"]["top"]

    def turn(self) -> None:
        self.pages.append([])
        self.cursor, self.headed = DESIGNS["page"]["top"], False

    def head(self) -> None:
        if not self.headed:
            self.pages[-1].extend(_heading(self.table, self.columns, self.cursor, self.invoice))
            self.cursor += self.table["heading"]["height"]
            self.headed = True

    def place(self, line: dict[str, Any] | None, texts: RowText, index: int) -> None:
        self.head()
        self.pages[-1].extend(_row_items(self.table, self.columns, line, texts, self.cursor, index, self.invoice))
        self.cursor += _height(self.table, texts)

    def place_whole(self, line: dict[str, Any], texts: RowText, index: int) -> None:
        """On this page, or the next if it doesn't fit."""
        if _height(self.table, texts) > self.room() and not self.fresh():
            self.turn()
        self.place(line, texts, index)

    def place_in_parts(self, line: dict[str, Any], texts: RowText, index: int) -> None:
        """A row taller than a page carries on from page to page, as much on each as fits."""
        shown: dict[str, Any] | None = line
        while texts:
            fitting = _fitting(self.table, texts, self.room())
            if fitting == 0 and not self.fresh():
                self.turn()
                continue
            fitting = max(fitting, 1)
            self.place(shown, texts[:fitting], index)
            texts, shown = texts[fitting:], None
            if texts:
                self.turn()


def _flow(design: dict[str, Any], invoice: dict[str, Any], first: Page, top: float) -> list[Page]:
    """The lines from the top given, onto new pages as they fill, then the totals, kept together
    (V26). Each row is kept whole, unless it's taller than a page on its own."""
    page = DESIGNS["page"]
    table = design["table"]
    lines = invoice["lines"]
    columns = _columns(table, lines)
    flow = _Pages(table, columns, invoice, first, top)
    whole_page = page["bottom"] - page["top"] - table["heading"]["height"]
    for index, line in enumerate(lines):
        texts = _row_text(table, columns, line)
        if _height(table, texts) <= whole_page:
            flow.place_whole(line, texts, index)
        else:
            flow.place_in_parts(line, texts, index)
    flow.head()
    height, place = _totals(design, invoice)
    flow.cursor += design["totals"]["gap"]
    if flow.cursor + height > page["bottom"]:
        flow.turn()
    flow.pages[-1].extend(place(flow.cursor))
    return flow.pages


def _footer_and_watermark(pages: list[Page], invoice: dict[str, Any]) -> None:
    """Each page ends with the number and the page, and a void invoice has VOID across every page (V26, V27)."""
    footer = DESIGNS["page"]["footer"]
    watermark = DESIGNS["watermark"]
    for number, items in enumerate(pages, start=1):
        said = f"{invoice['number'] or 'Draft'}, page {number} of {len(pages)}"
        items.append(text_item(said, footer["x"], footer["y"], footer, "start", invoice))
        if invoice["mark"] == "void":
            mark = text_item(watermark["text"], watermark["x"], watermark["y"], watermark, "middle", invoice)
            items.append({**mark, "angle": watermark["angle"], "opacity": watermark["opacity"]})


def lay_out(invoice: dict[str, Any]) -> list[Page]:
    """An invoice's pages, from its plain values: the design, the accent color, the logo's size in
    pixels or None, the company's details, the number or None for a draft, the issue and due dates
    as ISO dates, the Bill to, the lines, the figures in cents, the tax label and rate, and the mark."""
    design = DESIGNS["designs"][invoice["design"]]
    first, placed = _first_page(design, invoice)
    top = below(placed, design["table"]["below"], design["table"]["gap"])
    pages = _flow(design, invoice, first, top)
    _footer_and_watermark(pages, invoice)
    return pages
