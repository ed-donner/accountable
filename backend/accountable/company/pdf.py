"""A quote's or an invoice's PDF: laid out by layout.py and drawn on a ReportLab canvas (V24 to V28, Q30 to Q32).

Drawing decides nothing: every place comes from layout.py, which the pages' previews draw from
too. Text is drawn as text with drawString and its kin, never through Paragraph or any of
ReportLab's markup, so anything typed shows exactly as typed (V25, Q32). The fonts are carried
in the file, cut down to the characters it uses, so it looks the same on any computer.
"""

import io
from functools import cache
from typing import Any

from fastapi import Response
from reportlab.lib.colors import HexColor
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen.canvas import Canvas
from sqlalchemy import Row

from accountable.company import characters, fonts
from accountable.company.layout import DESIGNS, Item, Page, lay_out

PAGE_WIDTH = DESIGNS["page"]["width"]
PAGE_HEIGHT = DESIGNS["page"]["height"]


@cache
def _font_names() -> dict[str, str]:
    """Registered once per process, since reading the font files takes a moment."""
    names = {}
    for key, file in fonts.FILES.items():
        name = f"Invoice-{key}"
        pdfmetrics.registerFont(TTFont(name, str(fonts.FOLDER / file)))
        names[key] = name
    return names


def _up(y: float, height: float = 0) -> float:
    """The layout measures down from the page's top, and ReportLab up from its bottom."""
    return PAGE_HEIGHT - y - height


def _text(pdf: Canvas, item: Item, _logo: ImageReader | None) -> None:
    pdf.saveState()
    pdf.setFillColor(HexColor(item["color"]))
    if "opacity" in item:
        pdf.setFillAlpha(item["opacity"])
    pdf.setFont(_font_names()[item["font"]], item["size"])
    x, y = item["x"], _up(item["y"])
    if item.get("angle"):
        pdf.translate(x, y)
        pdf.rotate(item["angle"])
        x, y = 0, 0
    draw = {"start": pdf.drawString, "end": pdf.drawRightString, "middle": pdf.drawCentredString}[item["anchor"]]
    draw(x, y, item["text"])
    pdf.restoreState()


def _block(pdf: Canvas, item: Item, _logo: ImageReader | None) -> None:
    pdf.saveState()
    pdf.setFillColor(HexColor(item["color"]))
    x, y, width, height = item["x"], _up(item["y"], item["height"]), item["width"], item["height"]
    if item["radius"]:
        pdf.roundRect(x, y, width, height, item["radius"], stroke=0, fill=1)
    else:
        pdf.rect(x, y, width, height, stroke=0, fill=1)
    pdf.restoreState()


def _logo(pdf: Canvas, item: Item, logo: ImageReader | None) -> None:
    if logo is not None:
        y = _up(item["y"], item["height"])
        pdf.drawImage(logo, item["x"], y, width=item["width"], height=item["height"], mask="auto")


_DRAW = {"text": _text, "block": _block, "logo": _logo}


def draw(pages: list[Page], *, title: str, logo: bytes | None) -> bytes:
    """The PDF's bytes. Invariant, so the same invoice gives the same file, with no date in it."""
    made = io.BytesIO()
    # Started in the invoice's own font, so the file names no font it doesn't carry, such as Helvetica.
    starting_font = _font_names()["sans"]
    pdf = Canvas(
        made,
        pagesize=(PAGE_WIDTH, PAGE_HEIGHT),
        invariant=True,
        pageCompression=1,
        initialFontName=starting_font,
        initialFontSize=10,
    )
    pdf.setTitle(title)
    pdf.setCreator("Accountable")
    image = ImageReader(io.BytesIO(logo)) if logo is not None else None
    for items in pages:
        for item in items:
            _DRAW[item["kind"]](pdf, item, image)
        pdf.showPage()
    pdf.save()
    return made.getvalue()


def look(settings: Row, logo: Row | None) -> dict[str, Any]:
    """How quotes and invoices look, as Company settings have it at this moment (B18, V13): the
    design, the accent color and the logo's size, as the layout takes them."""
    return {
        "design": settings.invoice_design,
        "accent": settings.accent_color,
        "logo": None if logo is None else {"width": logo.width, "height": logo.height},
    }


def download(document: dict[str, Any], logo: Row | None) -> Response:
    """The document laid out and drawn now, as a download named after its number, such as
    QT-0004.pdf. A number is a prefix's letters, digits and hyphens and its figures (B4), so the
    name needs no escaping."""
    number = document["number"]
    made = draw(lay_out(_drawable(document)), title=number, logo=None if logo is None else logo.image)
    return Response(
        made, media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="{number}.pdf"'}
    )


def _drawable(value: Any) -> Any:
    """The document's values with each character the fonts can't draw left out of their text, so
    the PDF leaves it blank rather than print a box (Q31)."""
    if isinstance(value, str):
        return characters.printable(value)
    if isinstance(value, list):
        return [_drawable(item) for item in value]
    if isinstance(value, dict):
        return {key: _drawable(item) for key, item in value.items()}
    return value
