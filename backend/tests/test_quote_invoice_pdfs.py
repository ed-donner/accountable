"""Characterization tests for what quotes' and invoices' PDFs hold, written before the two are refactored.

Each PDF is downloaded through the API and its text read back with pypdf, page by page, then
compared with its record in characterization/, which shows what's on each page today. A change
to any word, figure, line break or page break fails here. The records also rest on pypdf, fpdf2
and ReportLab working as the versions in uv.lock do.
"""

import base64
import io
import re
from collections.abc import Callable
from datetime import timedelta
from pathlib import Path
from typing import Any

import pytest
from conftest import TODAY
from pdf_text import pages_text
from PIL import Image
from pypdf import PdfReader
from pypdf.generic import DictionaryObject

RECORDS = Path(__file__).parent / "characterization"
PAGE_HEADING = re.compile(r"^--- page \d+ ---\n", re.MULTILINE)

LONG_NAME = (
    "Implementation services for the warehouse rollout, including data migration, "
    "two rounds of user acceptance testing and go-live support"
)
LONG_DESCRIPTION = (
    "Covers the discovery workshops, the configuration of every site and the training of each shift lead, "
    "with a named consultant on call through the first month after go-live.\n"
    "Travel is billed separately."
)
SPARSE_SETTINGS = {"address": "", "email": "", "phone": "", "tax_label": "", "tax_rate": "0"}


def recorded(name: str) -> list[str]:
    """The pages as characterization/<name>.txt records them, each under its own --- page N --- heading."""
    text = (RECORDS / f"{name}.txt").read_text()
    return [page.rstrip("\n") for page in PAGE_HEADING.split(text)[1:]]


def read_back(pdf: bytes) -> list[str]:
    """Each page's text. pypdf ends a ReportLab page with a line break and an fpdf2 one without, so neither keeps it."""
    return [page.rstrip("\n") for page in pages_text(pdf)]


def ok(reply) -> Any:
    """The reply's JSON, once it has said yes."""
    assert reply.status_code in (200, 201), reply.text
    return reply.json()


def download(api, path: str):
    reply = api.get(f"{path}/pdf")
    assert reply.status_code == 200, reply.text
    return reply


def a_logo() -> str:
    made = io.BytesIO()
    Image.new("RGB", (600, 200), "#0E6B6B").save(made, "PNG")
    return base64.b64encode(made.getvalue()).decode()


# What each record is made from. The billing fixture saves Plainsong Systems' settings, with
# Sales tax at 8.875%, and a won deal for Harbor & Pine with Sam Carter as its main contact.


def add_quote(billing, deal: int, lines: list[dict[str, Any]]) -> dict[str, Any]:
    return ok(billing.api.post("/api/quotes", json={"deal_id": deal, "lines": lines}))


def three_line_quote(billing, deal: int) -> dict[str, Any]:
    products = billing.products
    return add_quote(
        billing,
        deal,
        [
            {
                "product_id": products["Annual support plan"],
                "quantity": 12,
                "unit_price_cents": 48000,
                "description": "One named user, with every module.",
            },
            {
                "product_id": products["Training day"],
                "quantity": 2,
                "unit_price_cents": 125000,
                "description": "Up to 12 people\nat the customer's site",
            },
            {"product_id": products["Pro license"], "quantity": 3, "unit_price_cents": 4950},
        ],
    )


def sparse_quote(billing, make) -> bytes:
    """A draft with only the company's name saved, no tax label at 0%, on a deal with nobody to prepare it for."""
    ok(billing.api.patch("/api/settings", json=SPARSE_SETTINGS))
    walk_in = make.deal("Walk-in sale", stage="new")
    line = {"product_id": billing.products["Pro license"], "quantity": 1, "unit_price_cents": 4950}
    quote = add_quote(billing, walk_in, [line])
    return download(billing.api, f"/api/quotes/{quote['id']}").content


def long_text_quote(billing, make, deal: int) -> bytes:
    """A name and a description that wrap, then the widest figures there can be, at 100%."""
    ok(billing.api.patch("/api/settings", json={"tax_rate": "100"}))
    lines = [
        {"product_id": make.product(LONG_NAME), "quantity": 1, "unit_price_cents": 0, "description": LONG_DESCRIPTION},
        {"product_id": make.product("Enterprise platform"), "quantity": 1_000_000, "unit_price_cents": 100_000_000},
    ]
    quote = add_quote(billing, deal, lines)
    return download(billing.api, f"/api/quotes/{quote['id']}").content


def hundred_line_quote(billing, make, deal: int) -> bytes:
    lines = [
        {
            "product_id": make.product(f"Product {number:03d}"),
            "quantity": number,
            "unit_price_cents": 4950 + number,
            "description": f"Seat {number}",
        }
        for number in range(1, 101)
    ]
    quote = add_quote(billing, deal, lines)
    return download(billing.api, f"/api/quotes/{quote['id']}").content


def three_line_invoice(billing) -> dict[str, Any]:
    """Issued today and part paid, so its totals end with Paid and Balance due."""
    invoice = billing.issued(
        billing.line("Pro license", quantity=2),
        billing.line("Annual support plan", description="Phone and email\nNext business day"),
        billing.line("Training day", unit_price_cents=125700),
    )
    billing.pay(invoice, 100000)
    return invoice


def paid_invoice(billing) -> bytes:
    invoice = billing.issued()
    billing.pay(invoice, invoice["total_cents"])
    return download(billing.api, f"/api/invoices/{invoice['id']}").content


def overdue_invoice(billing) -> bytes:
    invoice = billing.issued(on=TODAY - timedelta(days=45))
    return download(billing.api, f"/api/invoices/{invoice['id']}").content


def void_invoice(billing) -> bytes:
    invoice = ok(billing.api.post(f"/api/invoices/{billing.issued()['id']}/void", json={}))
    return download(billing.api, f"/api/invoices/{invoice['id']}").content


def sparse_invoice(billing) -> bytes:
    """Only the company's name saved, no tax label at 0%, and a one-line Bill to typed in."""
    ok(billing.api.patch("/api/settings", json=SPARSE_SETTINGS))
    draft = billing.draft()
    path = f"/api/invoices/{draft['id']}"
    ok(billing.api.post(f"{path}/issue", json={"bill_to": "Walk-in customer", "lines": [billing.line("Pro license")]}))
    return download(billing.api, path).content


def long_text_invoice(billing, make) -> bytes:
    """A name and a description that wrap, then the widest figures there can be, at 100%."""
    ok(billing.api.patch("/api/settings", json={"tax_rate": "100"}))
    invoice = billing.issued(
        {"product_id": make.product(LONG_NAME), "unit_price_cents": 0, "description": LONG_DESCRIPTION},
        {"product_id": make.product("Enterprise platform"), "quantity": 1_000_000, "unit_price_cents": 100_000_000},
    )
    return download(billing.api, f"/api/invoices/{invoice['id']}").content


def hundred_line_invoice(billing, make) -> bytes:
    invoice = billing.issued(
        *(
            {
                "product_id": make.product(f"Product {number:03d}"),
                "quantity": number,
                "unit_price_cents": 4950 + number,
                "description": f"Seat {number}",
            }
            for number in range(1, 101)
        )
    )
    return download(billing.api, f"/api/invoices/{invoice['id']}").content


# Quotes


def test_a_sent_quote_and_the_draft_it_was(billing, open_deal):
    quote = three_line_quote(billing, open_deal)
    path = f"/api/quotes/{quote['id']}"
    draft = read_back(download(billing.api, path).content)
    ok(billing.api.post(f"{path}/send", json={}))
    sent = read_back(download(billing.api, path).content)
    assert sent == recorded("quote-sent")
    # The draft differs only in the chip beside its title.
    assert draft == [page.replace("\nQuote\n", "\nQuote Draft\n", 1) for page in sent]


def test_a_quote_with_only_a_company_name_and_nobody_to_prepare_it_for(billing, make):
    assert read_back(sparse_quote(billing, make)) == recorded("quote-sparse")


def test_a_quote_with_text_that_wraps_and_the_widest_figures(billing, make, open_deal):
    assert read_back(long_text_quote(billing, make, open_deal)) == recorded("quote-long-text")


def test_a_quote_of_100_lines(billing, make, open_deal):
    assert read_back(hundred_line_quote(billing, make, open_deal)) == recorded("quote-100-lines")


# Invoices


def test_one_invoice_in_each_design_as_the_settings_have_it_at_the_download(billing):
    invoice = three_line_invoice(billing)
    path = f"/api/invoices/{invoice['id']}"
    for design in ("classic", "banner", "ledger"):
        ok(billing.api.patch("/api/settings", json={"invoice_design": design}))
        assert read_back(download(billing.api, path).content) == recorded(f"invoice-{design}"), design


@pytest.mark.parametrize(
    ("name", "make_pdf"),
    [("invoice-paid", paid_invoice), ("invoice-overdue", overdue_invoice), ("invoice-void", void_invoice)],
)
def test_a_paid_an_overdue_and_a_void_invoice(billing, name: str, make_pdf: Callable[..., bytes]):
    assert read_back(make_pdf(billing)) == recorded(name)


def test_an_invoice_with_only_a_company_name_and_a_typed_bill_to(billing):
    assert read_back(sparse_invoice(billing)) == recorded("invoice-sparse")


def test_an_invoice_with_text_that_wraps_and_the_widest_figures(billing, make):
    assert read_back(long_text_invoice(billing, make)) == recorded("invoice-long-text")


def test_an_invoice_of_100_lines(billing, make):
    assert read_back(hundred_line_invoice(billing, make)) == recorded("invoice-100-lines")


# The files themselves


def dictionary(value: Any) -> DictionaryObject:
    """A PDF dictionary, followed through its reference if it's one."""
    found = value.get_object()
    assert isinstance(found, DictionaryObject)
    return found


def font_names(reader: PdfReader) -> set[str]:
    """Each embedded font's name, without the tag a subset's name starts with."""
    names = set()
    for page in reader.pages:
        fonts = dictionary(dictionary(page["/Resources"])["/Font"])
        names |= {str(dictionary(font)["/BaseFont"]).split("+", 1)[-1] for font in fonts.values()}
    return names


def images_per_page(reader: PdfReader) -> list[int]:
    return [len(dictionary(page["/Resources"]).get("/XObject", {})) for page in reader.pages]


def test_a_quote_pdf_is_letter_sized_named_by_its_number_and_has_no_logo(billing, open_deal):
    ok(billing.api.patch("/api/settings", json={"logo": a_logo()}))
    quote = three_line_quote(billing, open_deal)
    reply = download(billing.api, f"/api/quotes/{quote['id']}")
    assert reply.headers["content-type"] == "application/pdf"
    assert reply.headers["content-disposition"] == 'attachment; filename="QT-0001.pdf"'
    reader = PdfReader(io.BytesIO(reply.content))
    assert [(page.mediabox.width, page.mediabox.height) for page in reader.pages] == [(612, 792)]
    assert font_names(reader) == {"InstrumentSans", "InstrumentSansSemiBold", "JetBrainsMono", "JetBrainsMonoMedium"}
    assert images_per_page(reader) == [0]
    assert reader.metadata is not None and reader.metadata.title is None


def test_an_invoice_pdf_is_letter_sized_named_and_titled_by_its_number_and_the_same_file_each_time(billing):
    invoice = three_line_invoice(billing)
    path = f"/api/invoices/{invoice['id']}"
    reply = download(billing.api, path)
    assert reply.headers["content-type"] == "application/pdf"
    assert reply.headers["content-disposition"] == 'attachment; filename="INV-0001.pdf"'
    assert download(billing.api, path).content == reply.content
    reader = PdfReader(io.BytesIO(reply.content))
    assert [(page.mediabox.width, page.mediabox.height) for page in reader.pages] == [(612, 792)]
    assert reader.metadata is not None
    assert (reader.metadata.title, reader.metadata.creator) == ("INV-0001", "Accountable")
    assert font_names(reader) == {
        "InstrumentSans-Regular",
        "InstrumentSans-SemiBold",
        "JetBrainsMono-Regular",
        "JetBrainsMono-Medium",
    }
    assert images_per_page(reader) == [0]


def test_an_invoice_pdf_draws_the_logo_once_on_its_first_page(billing, make):
    ok(billing.api.patch("/api/settings", json={"logo": a_logo()}))
    reader = PdfReader(io.BytesIO(hundred_line_invoice(billing, make)))
    assert images_per_page(reader) == [1] + [0] * (len(reader.pages) - 1)
