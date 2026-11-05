"""The quote's PDF (Q30 to Q32), read back with pypdf, so the tests see the words and figures a customer would."""

import io
import re
from datetime import date
from typing import Any

import pytest
from accountable import db
from accountable.company import tax
from accountable.quotes import pdf
from accountable.quotes.schemas import Company, Line, PreparedFor, QuoteDocument
from pdf_text import pages_text
from pypdf import PdfReader
from pypdf.generic import ArrayObject, DictionaryObject

PLAINSONG = Company(
    name="Plainsong Systems",
    address="48 Orchard Row, Suite 210\nBrooklyn, NY 11201",
    email="accounts@plainsong.example",
    phone="(718) 555-0142",
)
HARBOR_AND_PINE = PreparedFor(organization="Harbor & Pine", contact="Sam Carter", email="sam.carter@harborpine.example")


def line(number: int, quantity: int, unit_price_cents: int, **changes: Any) -> Line:
    values = {
        "id": number,
        "product_id": number,
        "name": f"Product {number}",
        "description": None,
        "quantity": quantity,
        "unit_price_cents": unit_price_cents,
        "amount_cents": tax.line_amount(quantity, unit_price_cents),
        **changes,
    }
    return Line(**values)


def document(lines: list[Line], *, rate: int = 8875, rate_text: str = "8.875", **changes: Any) -> QuoteDocument:
    """A quote built by hand, its sums worked out as the backend works them out."""
    sums = tax.totals(lines, rate)
    values = {
        "number": "QT-0004",
        "quote_date": date(2026, 11, 5),
        "valid_until": date(2026, 12, 5),
        "company": PLAINSONG,
        "prepared_for": HARBOR_AND_PINE,
        "tax_label": "Sales tax",
        "tax_rate": rate_text,
        "lines": lines,
        "subtotal_cents": sums.subtotal_cents,
        "tax_cents": sums.tax_cents,
        "total_cents": sums.total_cents,
        **changes,
    }
    return QuoteDocument(**values)


def text_of(doc: QuoteDocument, *, draft: bool = False) -> str:
    return "\n".join(pages_text(pdf.quote_pdf(doc, draft=draft)))


THREE_LINES = [
    line(1, 12, 48000, name="Standard license, per user per year", description="One named user, with every module."),
    line(2, 2, 125000, name="Training day, on site", description="Up to 12 people, at the customer's site."),
    line(3, 3, 4950, name="Extra user seat, per month"),
]


@pytest.fixture(scope="module")
def three_lines() -> str:
    """Made once for the module, because each PDF takes about a tenth of a second."""
    return text_of(document(THREE_LINES))


def test_a_three_line_quote_adds_up_to_the_cent(three_lines):
    # 12 x $480.00 + 2 x $1,250.00 + 3 x $49.50 = $8,408.50, and 8.875% of that is $746.254375.
    assert "Standard license, per user per year 12 $480.00 $5,760.00" in three_lines
    assert "Training day, on site 2 $1,250.00 $2,500.00" in three_lines
    assert "Extra user seat, per month 3 $49.50 $148.50" in three_lines
    assert "Subtotal $8,408.50" in three_lines
    assert "Sales tax (8.875%) $746.25" in three_lines
    assert "Total $9,154.75" in three_lines


def test_it_shows_the_company_the_quote_and_who_its_prepared_for(three_lines):
    for shown in (
        "Plainsong Systems\n48 Orchard Row, Suite 210\nBrooklyn, NY 11201\naccounts@plainsong.example\n(718) 555-0142",
        "Number QT-0004",
        "Date Nov 5, 2026",
        "Valid until Dec 5, 2026",
        "Prepared for\nHarbor & Pine\nSam Carter\nsam.carter@harborpine.example",
        "Item Qty Unit price Amount",
        "One named user, with every module.",
        "QT-0004 Page 1 of 1",
    ):
        assert shown in three_lines


def test_only_a_drafts_pdf_is_marked_draft(three_lines):
    assert "Draft" not in three_lines
    assert "Quote Draft" in text_of(document(THREE_LINES), draft=True)


@pytest.mark.parametrize(
    ("label", "rate", "rate_text", "shown"),
    [
        (None, 8500, "8.5", "Tax (8.5%) $12.75"),
        ("VAT", 20000, "20", "VAT (20%) $30.00"),
        ("Sales tax", 0, "0", "Sales tax (0%) $0.00"),
    ],
)
def test_the_tax_shows_its_label_or_tax_and_the_rate_as_saved(label, rate, rate_text, shown):
    doc = document([line(1, 1, 15000)], rate=rate, rate_text=rate_text, tax_label=label)
    assert shown in text_of(doc)


# Short enough not to wrap anywhere it goes, so the text reads back on one row.
TYPED = "<b>Rush</b> **bold** {nb}"
MORE_MARKUP = "__under__ -- &amp; [link](https://x.example)"


def test_typed_text_shows_exactly_as_typed_never_as_markup():
    doc = document(
        [line(1, 1, 100, name=f"Name {TYPED}", description=f"First {TYPED}\n{MORE_MARKUP}\n\nAfter a gap")],
        company=Company(name=f"Co {TYPED}", address=f"Street {TYPED}\nTown", email=None, phone=None),
        prepared_for=PreparedFor(organization=f"Org {TYPED}", contact=None, email=None),
    )
    text = text_of(doc)
    for typed in (f"Name {TYPED}", f"Co {TYPED}", f"Street {TYPED}\nTown", f"Org {TYPED}"):
        assert typed in text
    assert f"First {TYPED}\n{MORE_MARKUP}\n" in text
    assert "After a gap" in text


def test_blank_details_are_left_out():
    doc = document(
        [line(1, 1, 100)],
        company=Company(name="Plainsong Systems", address=None, email=None, phone="(718) 555-0142"),
        prepared_for=PreparedFor(organization="Harbor & Pine", contact=None, email=None),
    )
    assert "Plainsong Systems\n(718) 555-0142\nQuote" in text_of(doc)
    assert "Prepared for\nHarbor & Pine\nItem" in text_of(doc)


def test_nobody_to_prepare_it_for_leaves_out_the_heading():
    doc = document([line(1, 1, 100)], prepared_for=PreparedFor(organization=None, contact=None, email=None))
    assert "Prepared for" not in text_of(doc)


@pytest.fixture(scope="module")
def hundred_lines() -> list[str]:
    lines = [line(number, number, 4950 + number, description=f"Seat {number}") for number in range(1, 101)]
    return pages_text(pdf.quote_pdf(document(lines), draft=False))


def test_a_hundred_lines_run_over_several_pages_with_the_headings_at_the_top_of_each(hundred_lines):
    pages = len(hundred_lines)
    assert pages >= 3
    for number, page in enumerate(hundred_lines, start=1):
        assert "Item Qty Unit price Amount" in page, number
        assert page.endswith(f"QT-0004 Page {number} of {pages}"), number
    assert hundred_lines[1].startswith("Item Qty Unit price Amount")


def test_no_line_is_split_across_two_pages_and_the_totals_stay_together_on_the_last(hundred_lines):
    for number in range(1, 101):
        [page] = [page for page in hundred_lines if re.search(rf"^Product {number} ", page, re.MULTILINE)]
        assert f"Seat {number}\n" in page, number
    assert all("Subtotal" not in page for page in hundred_lines[:-1])
    assert re.search(r"Subtotal .*\nSales tax .*\nTotal ", hundred_lines[-1])


def test_a_line_taller_than_a_page_carries_on_over_the_next_rather_than_being_cut_off():
    rows = "\n".join(f"Row {number}" for number in range(90))
    text = text_of(document([line(1, 1, 100, description=rows), line(2, 1, 100)]))
    assert all(f"Row {number}\n" in text for number in range(90))
    assert "Product 2 1 $1.00 $1.00" in text


def dictionary(value: Any) -> DictionaryObject:
    """A PDF dictionary, followed through its reference if it's one."""
    found = value.get_object()
    assert isinstance(found, DictionaryObject)
    return found


def test_the_brand_fonts_are_embedded():
    reader = PdfReader(io.BytesIO(pdf.quote_pdf(document(THREE_LINES), draft=True)))
    fonts = dictionary(dictionary(reader.pages[0]["/Resources"])["/Font"])
    embedded = set()
    for reference in fonts.values():
        font = dictionary(reference)
        descendants = font["/DescendantFonts"].get_object()
        assert isinstance(descendants, ArrayObject)
        [descendant] = descendants
        descriptor = dictionary(dictionary(descendant)["/FontDescriptor"])
        assert "/FontFile2" in descriptor
        embedded.add(str(font["/BaseFont"]).split("+", 1)[1])
    assert embedded == {"InstrumentSans", "InstrumentSansSemiBold", "JetBrainsMono", "JetBrainsMonoMedium"}


def theme_colors() -> dict[str, str]:
    """The light mode tokens in styles.css's @theme block, the ones the dark block doesn't change included."""
    css = (db.ROOT / "frontend" / "src" / "styles.css").read_text()
    theme = css[css.index("@theme {") : css.index(":root[data-mode")]
    return dict(re.findall(r"(--color-[\w-]+):\s*(#[0-9a-f]{6})\b", theme))


def test_the_paper_colors_match_the_previews():
    colors = theme_colors()
    assert colors["--color-paper"] == pdf.PAPER
    assert colors["--color-paper-ink"] == pdf.PAPER_INK
    assert colors["--color-paper-muted"] == pdf.PAPER_MUTED
    assert colors["--color-paper-band"] == pdf.PAPER_BAND
    assert colors["--color-sea-green"] == pdf.SEA_GREEN


def test_the_dark_mode_leaves_the_paper_alone():
    css = (db.ROOT / "frontend" / "src" / "styles.css").read_text()
    dark = css[css.index(":root[data-mode") :]
    assert "--color-paper" not in dark


# Through the API, from the same reply the quote's page shows


SETTINGS = {
    "company_name": "Plainsong Systems",
    "address": "48 Orchard Row, Suite 210\nBrooklyn, NY 11201",
    "email": "accounts@plainsong.example",
    "phone": "(718) 555-0142",
    "tax_label": "Sales tax",
    "tax_rate": "8.875",
}


@pytest.fixture
def three_line_quote(api, make) -> dict[str, Any]:
    """A draft on a deal in Proposal, with the company's settings saved."""
    assert api.patch("/api/settings", json=SETTINGS).status_code == 200
    organization = make.organization("Harbor & Pine")
    contact = make.contact("Sam Carter", email="sam.carter@harborpine.example", organization_id=organization)
    deal = make.deal("Renewal", stage="proposal", organization_id=organization, main_contact_id=contact)
    lines = [
        {"product_id": make.product("Standard license"), "quantity": 12, "unit_price_cents": 48000},
        {"product_id": make.product("Training day"), "quantity": 2, "unit_price_cents": 125000},
        {"product_id": make.product("Extra user seat"), "quantity": 3, "unit_price_cents": 4950},
    ]
    reply = api.post("/api/quotes", json={"deal_id": deal, "lines": lines})
    assert reply.status_code == 201, reply.text
    return reply.json()


def downloaded(api, quote: dict[str, Any]) -> str:
    reply = api.get(f"/api/quotes/{quote['id']}/pdf")
    assert reply.status_code == 200, reply.text
    assert reply.headers["content-type"] == "application/pdf"
    assert reply.headers["content-disposition"] == f'attachment; filename="{quote["number"]}.pdf"'
    assert reply.content.startswith(b"%PDF-")
    return "\n".join(pages_text(reply.content))


def test_the_pdf_shows_what_the_quotes_reply_shows(api, three_line_quote):
    text = downloaded(api, three_line_quote)
    quote = three_line_quote
    assert "Quote Draft" in text
    assert f"Subtotal {pdf.money(quote['subtotal_cents'])}" in text
    assert f"Sales tax (8.875%) {pdf.money(quote['tax_cents'])}" in text
    assert f"Total {pdf.money(quote['total_cents'])}" in text
    assert "Total $9,154.75" in text
    for line in quote["lines"]:
        assert f"{line['name']} {line['quantity']:,} {pdf.money(line['unit_price_cents'])}" in text
    assert "Prepared for\nHarbor & Pine\nSam Carter\nsam.carter@harborpine.example" in text


def test_a_sent_quotes_pdf_keeps_its_details_and_a_drafts_follows_the_settings(api, three_line_quote):
    sent = api.post(f"/api/quotes/{three_line_quote['id']}/send", json={}).json()
    draft = api.post(f"/api/quotes/{sent['id']}/copy", json={}).json()
    before = downloaded(api, sent)
    api.patch("/api/settings", json={"company_name": "Plainsong Ltd", "address": "", "tax_rate": "5"})

    assert downloaded(api, sent) == before
    assert "Plainsong Systems\n48 Orchard Row" in before and "Draft" not in before
    after = downloaded(api, draft)
    assert after.startswith("Plainsong Ltd\naccounts@plainsong.example")
    assert "Sales tax (5%) $420.43" in after


def test_a_drafts_pdf_waits_for_a_company_name(api, make):
    deal = make.deal("Renewal", stage="proposal")
    quote = api.post("/api/quotes", json={"deal_id": deal}).json()
    reply = api.get(f"/api/quotes/{quote['id']}/pdf")
    assert (reply.status_code, reply.json()) == (409, {"detail": "Add the company's name in Company settings first."})
