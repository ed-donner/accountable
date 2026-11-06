"""An invoice made from an accepted quote through the API (V33 to V38): its lines and Bill to, its tax, the one
invoice a quote may have, the link both ways, and a copy that keeps what a typed draft couldn't."""

import threading
from typing import Any

import pytest
from accountable import db
from accountable.books.tables import journal_entries
from accountable.crm.tables import deals, organizations
from accountable.invoices.tables import invoices
from accountable.products.tables import products
from accountable.quotes.tables import quote_lines, quotes
from conftest import insert_row
from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError

NOT_ACCEPTED = "QT-0001 hasn't been accepted, so it can't be invoiced."
NOT_WON = "This deal is no longer won. Move it back to Won to invoice QT-0001."
LINES = [
    {"name": "Pro license", "quantity": 3, "unit_price_cents": 4500, "description": "Negotiated seats"},
    {"name": "Annual support plan", "quantity": 1, "unit_price_cents": 360000, "description": None},
    {"name": "Training day", "quantity": 2, "unit_price_cents": 99999, "description": "On site"},
]


def quote_with(billing, deal: int, lines: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    """A quote on the deal with these lines, by product name, sent but not yet accepted."""
    body = [
        {
            "product_id": billing.products[line["name"]],
            "quantity": line["quantity"],
            "unit_price_cents": line["unit_price_cents"],
            **({"description": line["description"]} if line["description"] else {}),
        }
        for line in lines or LINES
    ]
    made = billing.api.post("/api/quotes", json={"deal_id": deal, "lines": body})
    assert made.status_code == 201, made.text
    sent = billing.api.post(f"/api/quotes/{made.json()['id']}/send", json={})
    assert sent.status_code == 200, sent.text
    return sent.json()


@pytest.fixture
def quote(billing, open_deal) -> dict[str, Any]:
    """An accepted quote, whose deal is therefore won."""
    sent = quote_with(billing, open_deal)
    accepted = billing.api.post(f"/api/quotes/{sent['id']}/accept", json={})
    assert accepted.status_code == 200, accepted.text
    return accepted.json()["quote"]


def create(billing, quote: dict[str, Any]):
    return billing.api.post(f"/api/invoices/from-quote/{quote['id']}", json={})


def made(billing, quote: dict[str, Any]) -> dict[str, Any]:
    reply = create(billing, quote)
    assert reply.status_code == 201, reply.text
    return reply.json()


def as_written(lines: list[dict[str, Any]]) -> list[tuple]:
    keys = ("product_id", "name", "description", "quantity", "unit_price_cents", "amount_cents")
    return [tuple(line[key] for key in keys) for line in lines]


def refusal(reply) -> tuple[int, str]:
    return reply.status_code, reply.json()["detail"]


def change_quote_line(quote: dict[str, Any], **values: Any) -> None:
    with db.writing() as conn:
        conn.execute(update(quote_lines).where(quote_lines.c.quote_id == quote["id"]).values(**values))


def the_deals_stage(quote: dict[str, Any], stage: str) -> None:
    with db.writing() as conn:
        conn.execute(update(deals).where(deals.c.id == quote["deal"]["id"]).values(stage=stage))


# The lines (V34)


def test_the_draft_has_the_quotes_lines_one_for_one_and_the_same_subtotal(billing, quote):
    invoice = made(billing, quote)
    assert invoice["status"] == "draft" and invoice["number"] is None
    assert invoice["deal"] == {"id": quote["deal"]["id"], "name": "Renewal"}
    assert as_written(invoice["lines"]) == as_written(quote["lines"])
    assert [line["name"] for line in invoice["lines"]] == ["Pro license", "Annual support plan", "Training day"]
    assert invoice["subtotal_cents"] == quote["subtotal_cents"] == 13500 + 360000 + 199998
    assert invoice["tax_cents"] == quote["tax_cents"] and invoice["total_cents"] == quote["total_cents"]


def test_a_product_repriced_or_archived_since_changes_nothing(billing, quote):
    with db.writing() as conn:
        conn.execute(update(products).values(unit_price_cents=1, description="Changed", active=False))
    invoice = made(billing, quote)
    assert as_written(invoice["lines"]) == as_written(quote["lines"])
    assert invoice["subtotal_cents"] == quote["subtotal_cents"]


# Its Bill to (V34)


def test_the_bill_to_is_the_quotes_prepared_for(billing, quote):
    assert made(billing, quote)["bill_to"] == "Harbor & Pine\nAttn: Sam Carter\nsam@harbor.example"


def test_it_ignores_the_organization_and_contact_the_deal_has_now(billing, quote, make):
    elsewhere = make.organization("Elsewhere Ltd")
    other = make.contact("Robin Hale", email="robin@elsewhere.example", organization_id=elsewhere)
    with db.writing() as conn:
        conn.execute(update(deals).values(organization_id=elsewhere, main_contact_id=other))
    assert made(billing, quote)["bill_to"] == "Harbor & Pine\nAttn: Sam Carter\nsam@harbor.example"


def test_a_blank_contact_or_email_is_left_out(billing, make):
    contact = make.contact("Robin Hale")
    deal = make.deal("No email", stage="proposal", organization_id=billing.organization, main_contact_id=contact)
    sent = quote_with(billing, deal)
    accepted = billing.api.post(f"/api/quotes/{sent['id']}/accept", json={}).json()["quote"]
    assert made(billing, accepted)["bill_to"] == "Harbor & Pine\nAttn: Robin Hale"
    with db.writing() as conn:
        bare = insert_row(conn, organizations, name="Bare Ltd")
    bare_deal = make.deal("Bare", stage="proposal", organization_id=bare)
    sent = quote_with(billing, bare_deal)
    accepted = billing.api.post(f"/api/quotes/{sent['id']}/accept", json={}).json()["quote"]
    assert made(billing, accepted)["bill_to"] == "Bare Ltd"


# Its tax (V35)


def test_the_tax_is_the_settings_now_and_the_reply_carries_the_quotes(billing, quote):
    assert quote["tax_rate"] == "8.875"
    billing.api.patch("/api/settings", json={"tax_rate": "10"})
    invoice = made(billing, quote)
    assert invoice["quote"]["tax_rate"] == "8.875"
    assert invoice["tax_rate"] == "10"
    assert invoice["tax_cents"] != quote["tax_cents"]
    billing.api.patch("/api/settings", json={"tax_rate": "8.875"})
    again = billing.api.get(f"/api/invoices/{invoice['id']}").json()
    assert again["tax_rate"] == again["quote"]["tax_rate"] == "8.875"
    assert again["tax_cents"] == quote["tax_cents"]


# One invoice only (V37)


def test_a_second_request_is_refused_naming_a_draft(billing, quote):
    made(billing, quote)
    assert refusal(create(billing, quote)) == (409, "QT-0001 already has a draft invoice.")


def test_a_second_request_is_refused_naming_an_issued_or_void_invoice(billing, quote):
    invoice = made(billing, quote)
    assert billing.api.post(f"/api/invoices/{invoice['id']}/issue", json={}).status_code == 200
    assert refusal(create(billing, quote)) == (409, "QT-0001 already has an invoice, INV-0001.")
    assert billing.api.post(f"/api/invoices/{invoice['id']}/void", json={}).status_code == 200
    assert refusal(create(billing, quote)) == (409, "QT-0001 already has an invoice, INV-0001.")


def test_two_requests_at_once_make_one_invoice_and_one_refusal(billing, quote):
    codes: list[int] = []
    start = threading.Barrier(2)

    def press():
        start.wait()
        codes.append(create(billing, quote).status_code)

    threads = [threading.Thread(target=press) for _ in range(2)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    assert sorted(codes) == [201, 409]
    assert len(billing.api.get(f"/api/invoices?quote_id={quote['id']}").json()) == 1


def test_the_database_itself_refuses_a_second_invoice_from_a_quote(billing, quote):
    invoice = made(billing, quote)
    with pytest.raises(IntegrityError), db.writing() as conn:
        insert_row(conn, invoices, deal_id=quote["deal"]["id"], quote_id=quote["id"])
    assert invoice["quote"]["id"] == quote["id"]


# Only an accepted quote on a won deal


@pytest.mark.parametrize("ends", ["draft", "sent", "declined"])
def test_a_quote_that_isnt_accepted_is_refused(billing, open_deal, ends):
    drafted = billing.api.post(
        "/api/quotes",
        json={
            "deal_id": open_deal,
            "lines": [{"product_id": billing.products["Pro license"], "quantity": 1, "unit_price_cents": 4950}],
        },
    ).json()
    if ends == "sent":
        drafted = billing.api.post(f"/api/quotes/{drafted['id']}/send", json={}).json()
    if ends == "declined":
        drafted = billing.api.post(f"/api/quotes/{drafted['id']}/decline", json={}).json()
    assert refusal(create(billing, drafted)) == (409, NOT_ACCEPTED)


def test_a_deal_moved_out_of_won_is_refused(billing, quote):
    the_deals_stage(quote, "negotiation")
    assert refusal(create(billing, quote)) == (409, NOT_WON)
    the_deals_stage(quote, "won")
    assert create(billing, quote).status_code == 201


def test_a_quote_that_isnt_there_is_a_404(billing):
    assert billing.api.post("/api/invoices/from-quote/999", json={}).status_code == 404


def test_a_refusal_makes_nothing(billing, open_deal):
    drafted = billing.api.post("/api/quotes", json={"deal_id": open_deal, "lines": []}).json()
    create(billing, drafted)
    assert billing.api.get("/api/invoices").json() == []


# The quote is left alone


def test_the_quote_is_unchanged(billing, quote):
    before = billing.api.get(f"/api/quotes/{quote['id']}").json()
    made(billing, quote)
    assert billing.api.get(f"/api/quotes/{quote['id']}").json() == before
    with db.reading() as conn:
        assert conn.scalar(select(quotes.c.status).where(quotes.c.id == quote["id"])) == "accepted"


# The link (V36)


def test_the_link_is_on_both_replies_and_in_the_list(billing, quote):
    invoice = made(billing, quote)
    assert invoice["quote"] == {"id": quote["id"], "number": "QT-0001", "tax_label": "Sales tax", "tax_rate": "8.875"}
    assert billing.api.get(f"/api/invoices/{invoice['id']}").json()["quote"] == invoice["quote"]
    [row] = billing.api.get(f"/api/invoices?quote_id={quote['id']}").json()
    assert (row["id"], row["quote_id"], row["number"], row["shows_as"]) == (invoice["id"], quote["id"], None, "draft")


def test_an_invoice_not_made_from_a_quote_has_no_quote(billing, quote):
    typed = billing.draft()
    assert typed["quote"] is None
    assert billing.api.get(f"/api/invoices?quote_id={quote['id']}").json() == []
    [row] = billing.api.get("/api/invoices").json()
    assert row["quote_id"] is None


def test_deleting_the_draft_frees_the_quote_and_voiding_does_not(billing, quote):
    draft = made(billing, quote)
    assert billing.api.delete(f"/api/invoices/{draft['id']}").status_code == 204
    assert billing.api.get(f"/api/invoices?quote_id={quote['id']}").json() == []
    second = made(billing, quote)
    assert second["id"] != draft["id"]
    billing.api.post(f"/api/invoices/{second['id']}/issue", json={})
    billing.api.post(f"/api/invoices/{second['id']}/void", json={})
    assert create(billing, quote).status_code == 409


# What a typed draft couldn't have (V38)


def test_a_description_too_long_and_a_character_the_fonts_lack_are_copied_whole(billing, quote):
    long = "x" * 1500
    change_quote_line(quote, description=long)
    invoice = made(billing, quote)
    assert [line["description"] for line in invoice["lines"]] == [long] * 3
    for action, body in (("", {"bill_to": invoice["bill_to"]}), ("/issue", {})):
        reply = (
            billing.api.patch(f"/api/invoices/{invoice['id']}", json=body)
            if not action
            else billing.api.post(f"/api/invoices/{invoice['id']}{action}", json=body)
        )
        assert reply.status_code == 422, reply.text
        assert reply.json()["fields"]["lines.0.description"] == "Keep the description to 1,000 characters or fewer"


def test_a_character_the_fonts_lack_is_copied_and_then_refused_on_a_save(billing, quote):
    change_quote_line(quote, description="Launch \U0001f680")
    invoice = made(billing, quote)
    assert invoice["lines"][0]["description"] == "Launch \U0001f680"
    reply = billing.api.post(f"/api/invoices/{invoice['id']}/issue", json={})
    assert reply.status_code == 422
    assert "lines.0.description" in reply.json()["fields"]


def test_after_the_field_is_fixed_it_issues_and_posts_to_the_books(billing, quote):
    change_quote_line(quote, description="x" * 1500)
    invoice = made(billing, quote)
    fixed = [{"id": line["id"], "description": "Short"} for line in invoice["lines"]]
    issued = billing.api.post(f"/api/invoices/{invoice['id']}/issue", json={"lines": fixed})
    assert issued.status_code == 200, issued.text
    with db.reading() as conn:
        entries = conn.scalar(
            select(func.count()).select_from(journal_entries).where(journal_entries.c.kind == "invoice")
        )
    assert entries == 1


def test_issuing_gives_it_a_number_and_dates_and_keeps_the_link(billing, quote):
    invoice = made(billing, quote)
    issued = billing.api.post(f"/api/invoices/{invoice['id']}/issue", json={}).json()
    assert issued["number"] == "INV-0001" and issued["status"] == "issued"
    assert issued["issue_date"] == "2026-10-31" and issued["due_date"] is not None
    assert issued["company"]["name"] == "Plainsong Systems"
    assert issued["quote"]["number"] == "QT-0001"
    assert as_written(issued["lines"]) == as_written(quote["lines"])
    [row] = billing.api.get(f"/api/invoices?quote_id={quote['id']}").json()
    assert row["number"] == "INV-0001"
