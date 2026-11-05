"""Characterization tests for quotes' and invoices' numbers, written before the two are refactored.

They pin when each kind takes its number today, what takes none, how the two counts run side by
side, and which prefix a number gets. The number on each PDF is pinned in test_quote_invoice_pdfs.py.
"""

from typing import Any


def ok(reply) -> Any:
    """The reply's JSON, once it has said yes."""
    assert reply.status_code in (200, 201), reply.text
    return reply.json()


def a_line(billing, product: str = "Pro license") -> dict[str, Any]:
    return {"product_id": billing.products[product], "quantity": 1, "unit_price_cents": 4950}


def add_quote(billing, deal: int) -> dict[str, Any]:
    return ok(billing.api.post("/api/quotes", json={"deal_id": deal, "lines": [a_line(billing)]}))


def quote_numbers(api) -> list[str]:
    """Newest first, as the list gives them."""
    return [row["number"] for row in ok(api.get("/api/quotes"))]


def invoice_numbers(api) -> list[tuple[str | None, int | None]]:
    """Each invoice's number and its place in the order issued, newest first, as the list gives them."""
    return [(row["number"], row["issue_order"]) for row in ok(api.get("/api/invoices"))]


def test_a_quote_takes_its_number_on_its_first_save_and_keeps_it(billing, open_deal):
    api = billing.api
    ok(api.get(f"/api/quotes/new/{open_deal}"))
    first = add_quote(billing, open_deal)
    assert first["number"] == "QT-0001"

    archived = billing.products["Training day"]
    ok(api.patch(f"/api/products/{archived}", json={"active": False}))
    refused = api.post("/api/quotes", json={"deal_id": open_deal, "lines": [a_line(billing, "Training day")]})
    assert refused.status_code == 422

    second = add_quote(billing, open_deal)
    copy = ok(api.post(f"/api/quotes/{first['id']}/copy", json={}))
    assert (second["number"], copy["number"]) == ("QT-0002", "QT-0003")

    ok(api.patch(f"/api/quotes/{second['id']}", json={"valid_until": "2026-12-31"}))
    ok(api.post(f"/api/quotes/{first['id']}/send", json={}))
    ok(api.post(f"/api/quotes/{second['id']}/decline", json={}))
    accepted = ok(api.post(f"/api/quotes/{first['id']}/accept", json={}))
    assert accepted["quote"]["number"] == "QT-0001"
    assert quote_numbers(api) == ["QT-0003", "QT-0002", "QT-0001"]


def test_an_invoice_takes_its_number_only_when_its_issued_in_the_order_issued(billing):
    api = billing.api
    first_started, second_started, deleted = billing.draft(), billing.draft(), billing.draft()
    assert [draft["number"] for draft in (first_started, second_started, deleted)] == [None, None, None]

    refused = api.post(f"/api/invoices/{first_started['id']}/issue", json={})
    assert refused.status_code == 422
    assert api.delete(f"/api/invoices/{deleted['id']}").status_code == 204

    issued = ok(api.post(f"/api/invoices/{second_started['id']}/issue", json={"lines": [a_line(billing)]}))
    assert (issued["number"], issued["issue_order"]) == ("INV-0001", 1)
    ok(api.post(f"/api/invoices/{first_started['id']}/issue", json={"lines": [a_line(billing)]}))
    later = billing.draft()
    # The list goes by when each draft was started, newest first, so the first started is last.
    assert invoice_numbers(api) == [(None, None), ("INV-0001", 1), ("INV-0002", 2)]

    ok(api.post(f"/api/invoices/{issued['id']}/void", json={}))
    billing.pay(ok(api.get(f"/api/invoices/{first_started['id']}")), 5389)
    assert invoice_numbers(api) == [(None, None), ("INV-0001", 1), ("INV-0002", 2)]
    assert ok(api.get(f"/api/invoices/{later['id']}"))["number"] is None


def test_the_two_kinds_count_on_their_own_each_with_its_prefix_as_it_is_when_the_number_is_taken(billing, open_deal):
    api = billing.api
    assert add_quote(billing, open_deal)["number"] == "QT-0001"
    assert billing.issued()["number"] == "INV-0001"
    assert add_quote(billing, open_deal)["number"] == "QT-0002"

    draft = billing.draft()
    ok(api.patch("/api/settings", json={"quote_prefix": "Q-", "invoice_prefix": "2026-"}))
    assert add_quote(billing, open_deal)["number"] == "Q-0003"
    issued = ok(api.post(f"/api/invoices/{draft['id']}/issue", json={"lines": [a_line(billing)]}))
    assert (issued["number"], issued["issue_order"]) == ("2026-0002", 2)

    assert quote_numbers(api) == ["Q-0003", "QT-0002", "QT-0001"]
    assert invoice_numbers(api) == [("2026-0002", 2), ("INV-0001", 1)]
