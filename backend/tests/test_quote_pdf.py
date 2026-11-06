"""The quote's PDF through the API (Q30 to Q32): laid out as an invoice is, in the design, accent
color and logo Company settings have when it's downloaded, with the quote's own words.
test_quote_invoice_pdfs.py records what each page says."""

import base64
import io
import re
from typing import Any

from accountable.company.layout import money
from pdf_text import pages_text
from PIL import Image
from pypdf import PdfReader
from pypdf.generic import DictionaryObject


def a_logo() -> str:
    made = io.BytesIO()
    Image.new("RGB", (600, 200), "#0E6B6B").save(made, "PNG")
    return base64.b64encode(made.getvalue()).decode()


def add_quote(billing, deal: int, *lines: dict[str, Any]) -> dict[str, Any]:
    reply = billing.api.post("/api/quotes", json={"deal_id": deal, "lines": list(lines)})
    assert reply.status_code == 201, reply.text
    return reply.json()


def a_line(billing, product: str, quantity: int, unit_price_cents: int, **more: Any) -> dict[str, Any]:
    return {"product_id": billing.products[product], "quantity": quantity, "unit_price_cents": unit_price_cents, **more}


def three_lines(billing) -> list[dict[str, Any]]:
    return [
        a_line(billing, "Annual support plan", 12, 48000),
        a_line(billing, "Training day", 2, 125000),
        a_line(billing, "Pro license", 3, 4950),
    ]


def downloaded(api, quote: dict[str, Any]) -> bytes:
    reply = api.get(f"/api/quotes/{quote['id']}/pdf")
    assert reply.status_code == 200, reply.text
    return reply.content


def text_of(api, quote: dict[str, Any]) -> str:
    return "\n".join(pages_text(downloaded(api, quote)))


def images_on_first_page(pdf: bytes) -> int:
    resources = PdfReader(io.BytesIO(pdf)).pages[0]["/Resources"].get_object()
    assert isinstance(resources, DictionaryObject)
    return len(resources.get("/XObject", {}))


def test_the_pdf_shows_each_line_and_the_figures_the_reply_gives(billing, open_deal):
    quote = add_quote(billing, open_deal, *three_lines(billing))
    text = text_of(billing.api, quote)
    for line in quote["lines"]:
        figures = f"{line['quantity']:,}\n{money(line['unit_price_cents'])}\n{money(line['amount_cents'])}"
        assert f"{line['name']}\n{figures}" in text
    sums = [money(quote[key]) for key in ("subtotal_cents", "tax_cents", "total_cents")]
    assert f"Subtotal\n{sums[0]}\nSales tax (8.875%)\n{sums[1]}\nTotal\n{sums[2]}" in text


def test_a_sent_quote_keeps_its_details_and_a_draft_follows_the_settings(billing, open_deal):
    api = billing.api
    sent = api.post(f"/api/quotes/{add_quote(billing, open_deal, *three_lines(billing))['id']}/send", json={}).json()
    draft = api.post(f"/api/quotes/{sent['id']}/copy", json={}).json()
    before = text_of(api, sent)
    api.patch("/api/settings", json={"company_name": "Plainsong Ltd", "address": "", "tax_rate": "5"})

    assert text_of(api, sent) == before
    assert before.startswith("Plainsong Systems\n48 Orchard Row") and "DRAFT" not in before
    after = text_of(api, draft)
    assert after.startswith("Plainsong Ltd\naccounts@plainsong.example")
    assert "Quote\nDRAFT\n" in after
    assert "Sales tax (5%)\n$420.43" in after


def test_the_look_is_the_settings_at_the_download_whatever_the_quotes_status(billing, open_deal):
    api = billing.api
    quote = api.post(f"/api/quotes/{add_quote(billing, open_deal, *three_lines(billing))['id']}/send", json={}).json()
    assert images_on_first_page(downloaded(api, quote)) == 0

    api.patch("/api/settings", json={"invoice_design": "banner", "logo": a_logo()})
    pdf = downloaded(api, quote)
    # The banner leads with the title and number, and shows the quote's total where an invoice shows its balance.
    assert "\n".join(pages_text(pdf)).startswith(f"Quote\n{quote['number']}\nDate\nOct 31, 2026\nValid until\n")
    assert f"Total\n{money(quote['total_cents'])}\nPlainsong Systems" in "\n".join(pages_text(pdf))
    assert images_on_first_page(pdf) == 1


# Short enough not to wrap anywhere it goes, so the text reads back on one row.
TYPED = "<b>Rush</b> **bold** {nb}"
MORE_MARKUP = "__under__ -- &amp; [link](https://x.example)"


def test_typed_text_shows_exactly_as_typed_never_as_markup(billing, make):
    api = billing.api
    api.patch("/api/settings", json={"company_name": f"Co {TYPED}", "address": f"Street {TYPED}\nTown"})
    organization = make.organization(f"Org {TYPED}")
    deal = make.deal("Rush job", stage="proposal", organization_id=organization)
    product = make.product(f"Name {TYPED}")
    description = f"First {TYPED}\n{MORE_MARKUP}\n\nAfter a gap"
    quote = add_quote(
        billing, deal, {"product_id": product, "quantity": 1, "unit_price_cents": 100, "description": description}
    )
    text = text_of(api, quote)
    for typed in (f"Co {TYPED}", f"Street {TYPED}\nTown", f"Org {TYPED}", f"Name {TYPED}"):
        assert typed in text
    assert f"First {TYPED}\n{MORE_MARKUP}\nAfter a gap" in text


def test_a_character_the_fonts_lack_is_left_blank_with_the_rest_as_typed(billing, open_deal):
    line = a_line(billing, "Pro license", 1, 4950, description="Acme 漢 Ltd \U0001f600 end")
    text = text_of(billing.api, add_quote(billing, open_deal, line))
    assert "Acme  Ltd  end" in text
    assert "\x00" not in text and "漢" not in text


def test_a_description_taller_than_a_page_carries_on_over_the_next(billing, open_deal):
    rows = "\n".join(f"Row {number}" for number in range(90))
    lines = [a_line(billing, "Pro license", 1, 100, description=rows), a_line(billing, "Training day", 1, 100)]
    pages = pages_text(downloaded(billing.api, add_quote(billing, open_deal, *lines)))
    assert len(pages) > 1
    assert [row for row in "\n".join(pages).splitlines() if re.fullmatch(r"Row \d+", row)] == rows.splitlines()
    assert "Training day\n1\n$1.00\n$1.00" in pages[-1]


def test_a_drafts_pdf_waits_for_a_company_name(api, make):
    deal = make.deal("Renewal", stage="proposal")
    quote = api.post("/api/quotes", json={"deal_id": deal}).json()
    reply = api.get(f"/api/quotes/{quote['id']}/pdf")
    assert (reply.status_code, reply.json()) == (409, {"detail": "Add the company's name in Company settings first."})
