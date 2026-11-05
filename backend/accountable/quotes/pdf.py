"""The quote's PDF (Q30 to Q32), drawn with fpdf2 from the same document the quote's page shows,
laid out as the spec's quote document sets it out, in points on US Letter.

Every value goes in through cell() and multi_cell() as plain text, with fpdf2's markdown left
off and its HTML never used, so whatever someone typed shows exactly as typed (Q32). fpdf2 would
also swap "{nb}" in any text for the page count, so that's turned off, and each page's foot is
drawn once the pages are counted.
"""

from dataclasses import dataclass
from datetime import date
from pathlib import Path

from fpdf import FPDF
from fpdf.enums import Align, MethodReturnValue, XPos, YPos

from accountable.quotes.schemas import Line, QuoteDocument

FONTS = Path(__file__).parent / "fonts"

# The paper tokens in frontend/src/styles.css, which a test compares, and Sea Green for the total.
PAPER = "#ffffff"
PAPER_INK = "#073b4c"
PAPER_MUTED = "#4a6b76"
PAPER_BAND = "#f0f4f5"
SEA_GREEN = "#06d6a0"

PAGE_WIDTH, PAGE_HEIGHT = 612, 792
MARGIN = 54
LEFT, RIGHT = MARGIN, PAGE_WIDTH - MARGIN
WIDTH = RIGHT - LEFT
# The lines and totals stay above this, and each page's foot sits below it.
BOTTOM = PAGE_HEIGHT - MARGIN
FOOT_TOP = PAGE_HEIGHT - 38

QUOTE_BLOCK_WIDTH = 200
COMPANY_WIDTH = WIDTH - QUOTE_BLOCK_WIDTH - 24
BAND_HEIGHT = 22
PADDING = 10
COLUMN_GAP = 14
LINE_GAP = 10
TOTALS_WIDTH = 236
RADIUS = 6

# Every JetBrains Mono character is 0.6 of its size wide, so a column of figures can be sized
# by counting characters, as the preview sizes its own.
MONO_ADVANCE = 0.6
FIGURE_SIZE = 9.5
# The narrowest each figure column gets, so its heading fits.
QUANTITY_MIN, PRICE_MIN, AMOUNT_MIN = 36, 64, 64


def money(cents: int) -> str:
    """$1,250.00: always with the cents, as the page shows them (Q15)."""
    return f"${cents // 100:,}.{cents % 100:02d}"


def day(value: date) -> str:
    """Nov 5, 2026, as the page shows a date."""
    return f"{value:%b} {value.day}, {value.year}"


def tax_line(label: str | None, rate: str) -> str:
    """Sales tax (8.875%), or Tax for a blank label (Q17)."""
    return f"{label or 'Tax'} ({rate}%)"


@dataclass(frozen=True)
class Columns:
    """Where the lines' figures sit: each column's right edge and width, sized to its widest figure."""

    quantity_right: float
    quantity_width: float
    price_right: float
    price_width: float
    amount_right: float
    amount_width: float

    @property
    def item_width(self) -> float:
        return self.quantity_right - self.quantity_width - COLUMN_GAP - (LEFT + PADDING)


def _figure_width(minimum: float, texts: list[str]) -> float:
    return max([minimum, *(len(text) * MONO_ADVANCE * FIGURE_SIZE for text in texts)])


def columns_for(lines: list[Line]) -> Columns:
    amount = _figure_width(AMOUNT_MIN, [money(line.amount_cents) for line in lines])
    price = _figure_width(PRICE_MIN, [money(line.unit_price_cents) for line in lines])
    quantity = _figure_width(QUANTITY_MIN, [f"{line.quantity:,}" for line in lines])
    amount_right = RIGHT - PADDING
    price_right = amount_right - amount - COLUMN_GAP
    quantity_right = price_right - price - COLUMN_GAP
    return Columns(quantity_right, quantity, price_right, price, amount_right, amount)


class _Sheet(FPDF):
    """The quote's pages, with the lines' headings repeated at the top of each page after the first."""

    def __init__(self, columns: Columns) -> None:
        super().__init__(unit="pt", format="letter")
        self.columns = columns
        self.c_margin = 0
        self.set_margins(MARGIN, MARGIN, MARGIN)
        self.set_auto_page_break(True, MARGIN)
        self.str_alias_nb_pages = ""
        self.add_font("sans", "", FONTS / "InstrumentSans-Regular.ttf")
        self.add_font("sans", "B", FONTS / "InstrumentSans-SemiBold.ttf")
        self.add_font("mono", "", FONTS / "JetBrainsMono-Regular.ttf")
        self.add_font("mono", "B", FONTS / "JetBrainsMono-Medium.ttf")

    def header(self) -> None:
        self.set_fill_color(PAPER)
        self.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT, style="F")
        if self.page > 1:
            self.set_y(self.band(MARGIN))

    def write_text(
        self,
        x: float,
        y: float,
        width: float,
        line_height: float,
        text: str,
        *,
        size: float,
        font: str = "sans",
        style: str = "",
        color: str = PAPER_INK,
        align: Align = Align.L,
    ) -> float:
        """Plain text from its top at y, wrapped within the width, with its line breaks kept. Returns the y below it."""
        self.set_font(font, style, size)
        self.set_text_color(color)
        self.set_xy(x, y)
        self.multi_cell(width, line_height, text, align=align, new_x=XPos.LEFT, new_y=YPos.NEXT)
        return self.get_y()

    def rows(self, text: str, width: float, *, size: float, style: str = "") -> int:
        """How many rows the text takes when wrapped within the width."""
        self.set_font("sans", style, size)
        rows = self.multi_cell(width, size, text, dry_run=True, output=MethodReturnValue.LINES)
        # Asked for LINES, multi_cell gives the wrapped rows, but its type allows every output it has.
        assert isinstance(rows, list)
        return len(rows)

    def band(self, y: float) -> float:
        """The lines' column headings on the paper band. Returns the y where the first line starts."""
        self.set_fill_color(PAPER_BAND)
        self.rect(LEFT, y, WIDTH, BAND_HEIGHT, style="F", round_corners=True, corner_radius=RADIUS)
        columns = self.columns
        headings = [
            ("Item", LEFT + PADDING, columns.item_width, Align.L),
            ("Qty", columns.quantity_right - columns.quantity_width, columns.quantity_width, Align.R),
            ("Unit price", columns.price_right - columns.price_width, columns.price_width, Align.R),
            ("Amount", columns.amount_right - columns.amount_width, columns.amount_width, Align.R),
        ]
        self.set_font("sans", "B", 9)
        self.set_text_color(PAPER_MUTED)
        for text, x, width, align in headings:
            self.set_xy(x, y)
            self.cell(width, BAND_HEIGHT, text, align=align)
        return y + BAND_HEIGHT + 8


def _company(sheet: _Sheet, company) -> float:
    y = MARGIN
    if company.name:
        y = sheet.write_text(LEFT, y, COMPANY_WIDTH, 22, company.name, size=18, style="B") + 4
    for detail in (company.address, company.email, company.phone):
        if detail:
            y = sheet.write_text(LEFT, y, COMPANY_WIDTH, 13, detail, size=9, color=PAPER_MUTED)
    return y


CHIP_HEIGHT = 16
# Fully round. fpdf2 shrinks a radius of half the height or more to almost nothing, so this is just under.
CHIP_RADIUS = CHIP_HEIGHT / 2 - 0.01


def _draft_chip(sheet: _Sheet, x: float, y: float) -> None:
    sheet.set_font("sans", "B", 9)
    width = sheet.get_string_width("Draft") + 14
    sheet.set_fill_color(PAPER_BAND)
    sheet.rect(x, y, width, CHIP_HEIGHT, style="F", round_corners=True, corner_radius=CHIP_RADIUS)
    sheet.set_text_color(PAPER_MUTED)
    sheet.set_xy(x, y)
    sheet.cell(width, CHIP_HEIGHT, "Draft", align=Align.C)


def _quote_block(sheet: _Sheet, doc: QuoteDocument, draft: bool) -> float:
    x = RIGHT - QUOTE_BLOCK_WIDTH
    sheet.set_font("sans", "B", 24)
    sheet.set_text_color(PAPER_INK)
    sheet.set_xy(x, MARGIN)
    sheet.cell(sheet.get_string_width("Quote"), 28, "Quote")
    if draft:
        _draft_chip(sheet, sheet.get_x() + 8, MARGIN + 6)
    y = MARGIN + 36
    for label, value in (
        ("Number", doc.number),
        ("Date", day(doc.quote_date)),
        ("Valid until", day(doc.valid_until)),
    ):
        sheet.write_text(x, y, QUOTE_BLOCK_WIDTH, 16, label, size=9, style="B", color=PAPER_MUTED)
        y = sheet.write_text(x, y, QUOTE_BLOCK_WIDTH, 16, value, size=10, font="mono", align=Align.R)
    return y


def _prepared_for(sheet: _Sheet, doc: QuoteDocument, y: float) -> float:
    """The label, then whichever of the organization, the contact and their email aren't blank (Q18)."""
    who = doc.prepared_for
    shown = [
        (text, size, style, line_height)
        for text, size, style, line_height in (
            (who.organization, 11, "B", 15),
            (who.contact, 10, "", 14),
            (who.email, 10, "", 14),
        )
        if text
    ]
    if not shown:
        return y
    y = sheet.write_text(LEFT, y, COMPANY_WIDTH, 13, "Prepared for", size=9, style="B", color=PAPER_MUTED) + 3
    for text, size, style, line_height in shown:
        y = sheet.write_text(LEFT, y, COMPANY_WIDTH, line_height, text, size=size, style=style)
    return y + 24


def _line_height(sheet: _Sheet, line: Line) -> float:
    width = sheet.columns.item_width
    height = sheet.rows(line.name, width, size=10, style="B") * 14
    if line.description:
        height += 1 + sheet.rows(line.description, width, size=9) * 12
    return height


def _line(sheet: _Sheet, line: Line, y: float) -> float:
    """A line's name, its figures beside it, and its description under the name. Returns the y below it.

    Drawn in reading order, so the PDF's text reads that way when copied.
    """
    columns = sheet.columns
    item_x = LEFT + PADDING
    bottom = sheet.write_text(item_x, y, columns.item_width, 14, line.name, size=10, style="B")
    sheet.set_font("mono", "", FIGURE_SIZE)
    for text, right, width in (
        (f"{line.quantity:,}", columns.quantity_right, columns.quantity_width),
        (money(line.unit_price_cents), columns.price_right, columns.price_width),
        (money(line.amount_cents), columns.amount_right, columns.amount_width),
    ):
        sheet.set_xy(right - width, y)
        sheet.cell(width, 14, text, align=Align.R)
    if line.description:
        bottom = sheet.write_text(
            item_x, bottom + 1, columns.item_width, 12, line.description, size=9, color=PAPER_MUTED
        )
    return bottom


def _sums(doc: QuoteDocument) -> list[tuple[str, str]]:
    return [("Subtotal", money(doc.subtotal_cents)), (tax_line(doc.tax_label, doc.tax_rate), money(doc.tax_cents))]


def _sum_label_width(sheet: _Sheet, amount: str) -> float:
    sheet.set_font("mono", "", 10)
    return TOTALS_WIDTH - 2 * PADDING - sheet.get_string_width(amount) - COLUMN_GAP


def _totals_height(sheet: _Sheet, doc: QuoteDocument) -> float:
    rows = sum(sheet.rows(label, _sum_label_width(sheet, amount), size=10) for label, amount in _sums(doc))
    return rows * 18 + 6 + 30


def _totals(sheet: _Sheet, doc: QuoteDocument, y: float) -> None:
    """Subtotal and tax, then the total on Sea Green, with the amounts lined up on the Amount column."""
    x = RIGHT - TOTALS_WIDTH
    amount_right = RIGHT - PADDING
    for label, amount in _sums(doc):
        bottom = sheet.write_text(x + PADDING, y, _sum_label_width(sheet, amount), 18, label, size=10)
        sheet.write_text(amount_right - 200, y, 200, 18, amount, size=10, font="mono", align=Align.R)
        y = bottom
    y += 6
    sheet.set_fill_color(SEA_GREEN)
    sheet.rect(x, y, TOTALS_WIDTH, 30, style="F", round_corners=True, corner_radius=RADIUS)
    sheet.write_text(x + PADDING, y, 80, 30, "Total", size=11, style="B")
    sheet.write_text(
        amount_right - 200, y, 200, 30, money(doc.total_cents), size=12, font="mono", style="B", align=Align.R
    )


def _feet(sheet: _Sheet, number: str) -> None:
    """The number and "Page 1 of 2" at the foot of each page, now that the pages are counted."""
    sheet.set_auto_page_break(False)
    pages = sheet.pages_count
    for page in range(1, pages + 1):
        sheet.page = page
        sheet.write_text(LEFT, FOOT_TOP, WIDTH / 2, 10, number, size=8, font="mono", color=PAPER_MUTED)
        sheet.write_text(
            LEFT + WIDTH / 2,
            FOOT_TOP,
            WIDTH / 2,
            10,
            f"Page {page} of {pages}",
            size=8,
            color=PAPER_MUTED,
            align=Align.R,
        )


def quote_pdf(doc: QuoteDocument, *, draft: bool) -> bytes:
    """The quote as a PDF: a new page whenever the next line won't fit, never splitting one that
    would fit on a page of its own, and the totals kept together on the last page (Q31)."""
    sheet = _Sheet(columns_for(doc.lines))
    sheet.add_page()
    y = max(_company(sheet, doc.company), _quote_block(sheet, doc, draft)) + 28
    y = sheet.band(_prepared_for(sheet, doc, y))
    for line in doc.lines:
        if y + _line_height(sheet, line) > BOTTOM:
            sheet.add_page()
            y = sheet.get_y()
        y = _line(sheet, line, y) + LINE_GAP
    if y + _totals_height(sheet, doc) > BOTTOM:
        sheet.add_page()
        y = sheet.get_y()
    _totals(sheet, doc, y)
    _feet(sheet, doc.number)
    return bytes(sheet.output())
