"""The PDF (V24 to V28): its text read back from the file, against the figures the API gives."""

import base64
import io
import json
from datetime import timedelta

import pytest
from accountable import db
from accountable.invoices import layout, pdf
from conftest import TODAY
from PIL import Image
from pypdf import PdfReader
from pypdf.generic import DictionaryObject


def a_logo() -> str:
    made = io.BytesIO()
    Image.new("RGB", (600, 200), "#0E6B6B").save(made, "PNG")
    return base64.b64encode(made.getvalue()).decode()


def downloaded(billing, invoice: dict):
    reply = billing.api.get(f"/api/invoices/{invoice['id']}/pdf")
    assert reply.status_code == 200, reply.text
    return reply


def read(data: bytes) -> PdfReader:
    assert data.startswith(b"%PDF")
    return PdfReader(io.BytesIO(data))


def resources(reader: PdfReader, page: int = 0) -> DictionaryObject:
    found = reader.pages[page]["/Resources"].get_object()
    assert isinstance(found, DictionaryObject)
    return found


def text_of(reader: PdfReader) -> str:
    return "\n".join(page.extract_text() for page in reader.pages)


def three_lines(billing) -> dict:
    """2 x $49.50, $3,600.00 and $1,257.00, so the 8.875% tax is $439.845 and rounds up to $439.85."""
    return billing.issued(
        billing.line("Pro license", quantity=2),
        billing.line("Annual support plan"),
        billing.line("Training day", unit_price_cents=125700),
    )


@pytest.mark.parametrize("design", ["classic", "banner", "ledger"])
@pytest.mark.parametrize("with_logo", [True, False], ids=["with a logo", "without"])
def test_each_design_holds_the_figures_the_api_gives(billing, design, with_logo):
    billing.api.patch("/api/settings", json={"invoice_design": design, "logo": a_logo() if with_logo else None})
    invoice = three_lines(billing)
    reply = downloaded(billing, invoice)
    assert reply.headers["content-type"] == "application/pdf"
    assert reply.headers["content-disposition"] == 'attachment; filename="INV-0001.pdf"'
    reader = read(reply.content)
    assert len(reader.pages) == 1
    text = text_of(reader)
    for line in invoice["bill_to"].split("\n"):
        assert line in text
    for line in invoice["lines"]:
        assert line["name"] in text
        assert layout.money(line["amount_cents"]) in text
    figures = [invoice[key] for key in ("subtotal_cents", "tax_cents", "total_cents")]
    assert figures == [495600, 43985, 539585]
    for cents in figures:
        assert layout.money(cents) in text
    assert "INV-0001" in text and "Sales tax (8.875%)" in text and "Plainsong Systems" in text
    images = resources(reader).get("/XObject", {})
    assert bool(images) is with_logo


def test_markup_typed_into_an_invoice_comes_back_as_typed(billing):
    draft = billing.draft()
    markup = '<font color="red">x</font>'
    billing.api.post(
        f"/api/invoices/{draft['id']}/issue",
        json={"bill_to": "<b>Acme</b> & Co", "lines": [billing.line("Pro license", description=markup)]},
    )
    text = text_of(read(downloaded(billing, draft).content))
    assert "<b>Acme</b> & Co" in text
    assert markup in text


def test_paid_overdue_and_void_marks(billing):
    paid = billing.issued()
    billing.pay(paid, paid["total_cents"])
    overdue = billing.issued(on=TODAY - timedelta(days=45))
    void = billing.api.post(f"/api/invoices/{billing.issued()['id']}/void", json={}).json()
    plain = billing.issued()
    marks = {"PAID": paid, "OVERDUE": overdue, "VOID": void}
    for word, invoice in marks.items():
        text = text_of(read(downloaded(billing, invoice).content))
        assert word in text, word
        assert not ({"PAID", "OVERDUE", "VOID"} - {word}) & set(text.split()), word
    assert text_of(read(downloaded(billing, void).content)).count("VOID") == 2
    assert not {"PAID", "OVERDUE", "VOID"} & set(text_of(read(downloaded(billing, plain).content)).split())


def test_once_anything_is_paid_the_totals_add_paid_and_balance_due(billing):
    invoice = billing.issued(billing.line("Annual support plan"))
    billing.pay(invoice, 100000)
    text = text_of(read(downloaded(billing, invoice).content))
    assert "Paid" in text and "$1,000.00" in text
    assert "Balance due" in text and "$2,919.50" in text


def test_the_look_follows_the_settings_and_the_words_stay_as_issued(billing):
    invoice = billing.issued()
    billing.api.patch("/api/settings", json={"company_name": "Renamed Ltd", "invoice_design": "ledger"})
    text = text_of(read(downloaded(billing, invoice).content))
    assert "Plainsong Systems" in text and "Renamed Ltd" not in text


def test_a_draft_has_no_pdf(billing):
    reply = billing.api.get(f"/api/invoices/{billing.draft()['id']}/pdf")
    assert (reply.status_code, reply.json()) == (409, {"detail": "A draft has no PDF. Issue it first."})
    assert billing.api.get("/api/invoices/999/pdf").status_code == 404


def test_the_fonts_are_carried_in_the_file_cut_down_and_its_title_is_the_number(billing):
    reader = read(downloaded(billing, billing.issued()).content)
    assert reader.metadata is not None and reader.metadata.title == "INV-0001"
    used = resources(reader)["/Font"].get_object()
    assert isinstance(used, DictionaryObject)
    assert len(used) >= 3
    for font in used.values():
        descriptor = font.get_object()["/FontDescriptor"].get_object()
        assert "/FontFile2" in descriptor
        assert "+" in descriptor["/FontName"]  # A subset's name starts with its own tag.


@pytest.fixture(scope="module")
def hundred_lines() -> PdfReader:
    """Made once, from the shared case, for the tests that read it."""
    cases = json.loads((db.ROOT / "shared" / "invoice-layout-cases.json").read_text())["cases"]
    [case] = [case for case in cases if case["name"] == "100 lines over several pages"]
    return read(pdf.draw(layout.lay_out(case["invoice"]), title="INV-0042", logo=None))


def test_100_lines_run_over_pages_with_the_headings_and_the_page_on_each(hundred_lines):
    assert len(hundred_lines.pages) == 5
    for number, page in enumerate(hundred_lines.pages, start=1):
        text = page.extract_text()
        assert "Description" in text and "Unit price" in text
        assert f"INV-0042, page {number} of 5" in text
    assert "Line 100 for a stretch of work" in hundred_lines.pages[-1].extract_text()
