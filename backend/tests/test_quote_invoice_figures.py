"""Characterization tests for quotes' and invoices' figures, written before the two are refactored.

They pin what the code gives today: each line's amount, the subtotal, the tax and the total,
on a document's page, in the lists and on its PDF, through each change of status and of the
tax rate. A refactor that moves any figure by a cent, on any of those, fails here.
"""

import json
import re
from typing import Any

import pytest
from accountable import db
from pdf_text import pages_text

CASES = json.loads((db.ROOT / "shared" / "totals-cases.json").read_text())
CAN_BE_ISSUED = [case for case in CASES if case["total"] > 0]


def sums(reply: dict[str, Any]) -> tuple[int, int, int]:
    return reply["subtotal_cents"], reply["tax_cents"], reply["total_cents"]


def amounts(reply: dict[str, Any]) -> list[int]:
    return [line["amount_cents"] for line in reply["lines"]]


def dollars(cents: int) -> str:
    return f"${cents // 100:,}.{cents % 100:02d}"


def pdf_totals(api, path: str) -> list[str]:
    """The money on a PDF from its Subtotal on: the subtotal, the tax, the total, then Paid and Balance due if shown."""
    reply = api.get(f"{path}/pdf")
    assert reply.status_code == 200, reply.text
    text = "\n".join(pages_text(reply.content))
    return re.findall(r"\$[\d,]+\.\d\d", text[text.index("Subtotal") :])


def ok(reply) -> Any:
    """The reply's JSON, once it has said yes."""
    assert reply.status_code in (200, 201), reply.text
    return reply.json()


# Every shared case, through each route that shows it


@pytest.mark.parametrize("case", CASES, ids=lambda case: case["why"])
def test_a_quote_gives_each_shared_case_on_its_page_in_the_list_and_on_its_pdf(billing, open_deal, case):
    api = billing.api
    ok(api.patch("/api/settings", json={"tax_rate": case["rate"]}))
    product = billing.products["Pro license"]
    lines = [
        {"product_id": product, "quantity": quantity, "unit_price_cents": price} for quantity, price in case["lines"]
    ]
    expected = (case["subtotal"], case["tax"], case["total"])

    quote = ok(api.post("/api/quotes", json={"deal_id": open_deal, "lines": lines}))
    path = f"/api/quotes/{quote['id']}"
    assert amounts(quote) == [quantity * price for quantity, price in case["lines"]]
    assert sums(quote) == sums(ok(api.get(path))) == expected
    assert quote["tax_rate"] == case["rate"]
    [row] = ok(api.get("/api/quotes"))
    assert sums(row) == expected
    assert pdf_totals(api, path) == [dollars(cents) for cents in expected]

    if lines:
        sent = ok(api.post(f"{path}/send", json={}))
        assert sums(sent) == sums(ok(api.get(path))) == expected
        [row] = ok(api.get("/api/quotes"))
        assert sums(row) == expected
        assert pdf_totals(api, path) == [dollars(cents) for cents in expected]


@pytest.mark.parametrize("case", CASES, ids=lambda case: case["why"])
def test_an_invoice_draft_gives_each_shared_case_on_its_page_and_in_the_list(billing, case):
    api = billing.api
    ok(api.patch("/api/settings", json={"tax_rate": case["rate"]}))
    draft = billing.draft()
    path = f"/api/invoices/{draft['id']}"
    lines = [
        billing.line("Pro license", quantity=quantity, unit_price_cents=price) for quantity, price in case["lines"]
    ]

    saved = ok(api.patch(path, json={"lines": lines}))
    assert amounts(saved) == [quantity * price for quantity, price in case["lines"]]
    assert sums(saved) == sums(ok(api.get(path))) == (case["subtotal"], case["tax"], case["total"])
    assert saved["tax_rate"] == case["rate"]
    assert (saved["owed_cents"], saved["paid_cents"]) == (0, 0)
    [row] = ok(api.get("/api/invoices"))
    assert (row["total_cents"], row["owed_cents"]) == (case["total"], 0)


@pytest.mark.parametrize("case", CAN_BE_ISSUED, ids=lambda case: case["why"])
def test_an_issued_invoice_gives_each_shared_case_on_its_page_in_the_list_and_on_its_pdf(billing, case):
    api = billing.api
    ok(api.patch("/api/settings", json={"tax_rate": case["rate"]}))
    lines = [
        billing.line("Pro license", quantity=quantity, unit_price_cents=price) for quantity, price in case["lines"]
    ]
    expected = (case["subtotal"], case["tax"], case["total"])

    issued = billing.issued(*lines)
    path = f"/api/invoices/{issued['id']}"
    assert amounts(issued) == [quantity * price for quantity, price in case["lines"]]
    assert sums(issued) == sums(ok(api.get(path))) == expected
    assert (issued["owed_cents"], issued["paid_cents"]) == (case["total"], 0)
    [row] = ok(api.get("/api/invoices"))
    assert (row["total_cents"], row["owed_cents"]) == (case["total"], case["total"])
    assert pdf_totals(api, path) == [dollars(cents) for cents in expected]


# A document's figures through its life


def quote_figures(api, quote: dict[str, Any]) -> dict[str, Any]:
    """What the quote's page and its row in the list show, which have to agree."""
    page = ok(api.get(f"/api/quotes/{quote['id']}"))
    [row] = [row for row in ok(api.get("/api/quotes")) if row["id"] == quote["id"]]
    assert sums(row) == sums(page)
    return {"status": page["status"], "rate": page["tax_rate"], "amounts": amounts(page), "sums": sums(page)}


def test_a_quotes_figures_through_its_life(billing, open_deal, deal_row):
    api = billing.api
    products = billing.products
    quote = ok(
        api.post(
            "/api/quotes",
            json={
                "deal_id": open_deal,
                "lines": [
                    {"product_id": products["Annual support plan"], "quantity": 12, "unit_price_cents": 48000},
                    {"product_id": products["Training day"], "quantity": 2, "unit_price_cents": 125000},
                    {"product_id": products["Pro license"], "quantity": 3, "unit_price_cents": 4950},
                ],
            },
        )
    )
    # 12 x $480.00 + 2 x $1,250.00 + 3 x $49.50 = $8,408.50, and 8.875% of that is $746.254375.
    assert quote_figures(api, quote) == {
        "status": "draft",
        "rate": "8.875",
        "amounts": [576000, 250000, 14850],
        "sums": (840850, 74625, 915475),
    }

    # One more on the third line: $8,458.00, and 8.875% of that is $750.6475.
    lines = [
        {key: line[key] for key in ("id", "description", "quantity", "unit_price_cents")} for line in quote["lines"]
    ]
    lines[2]["quantity"] = 4
    ok(api.patch(f"/api/quotes/{quote['id']}", json={"lines": lines}))
    assert quote_figures(api, quote)["sums"] == (845800, 75065, 920865)

    # A draft follows the settings' rate.
    ok(api.patch("/api/settings", json={"tax_rate": "5"}))
    assert quote_figures(api, quote) == {
        "status": "draft",
        "rate": "5",
        "amounts": [576000, 250000, 19800],
        "sums": (845800, 42290, 888090),
    }

    # Sending fixes the rate as it is then, and a later change leaves it.
    ok(api.post(f"/api/quotes/{quote['id']}/send", json={}))
    ok(api.patch("/api/settings", json={"tax_rate": "10"}))
    assert quote_figures(api, quote) == {
        "status": "sent",
        "rate": "5",
        "amounts": [576000, 250000, 19800],
        "sums": (845800, 42290, 888090),
    }

    # A copy is a draft, at the rate as it is now.
    copy = ok(api.post(f"/api/quotes/{quote['id']}/copy", json={}))
    assert quote_figures(api, copy) == {
        "status": "draft",
        "rate": "10",
        "amounts": [576000, 250000, 19800],
        "sums": (845800, 84580, 930380),
    }

    # Declining a draft fixes its rate too.
    ok(api.post(f"/api/quotes/{copy['id']}/decline", json={}))
    ok(api.patch("/api/settings", json={"tax_rate": "0"}))
    assert quote_figures(api, copy) == {
        "status": "declined",
        "rate": "10",
        "amounts": [576000, 250000, 19800],
        "sums": (845800, 84580, 930380),
    }

    # Accepting keeps the figures, and the deal's value is the subtotal in whole dollars.
    accepted = ok(api.post(f"/api/quotes/{quote['id']}/accept", json={}))
    assert sums(accepted["quote"]) == (845800, 42290, 888090)
    assert accepted["deal"]["value"] == deal_row(open_deal).value == 8458
    assert quote_figures(api, quote)["sums"] == (845800, 42290, 888090)


def invoice_figures(api, invoice: dict[str, Any]) -> dict[str, Any]:
    """What the invoice's page and its row in the list show, which have to agree."""
    page = ok(api.get(f"/api/invoices/{invoice['id']}"))
    [row] = [row for row in ok(api.get("/api/invoices")) if row["id"] == invoice["id"]]
    assert (row["total_cents"], row["owed_cents"], row["shows_as"]) == (
        page["total_cents"],
        page["owed_cents"],
        page["shows_as"],
    )
    return {
        "shows_as": page["shows_as"],
        "rate": page["tax_rate"],
        "amounts": amounts(page),
        "sums": sums(page),
        "paid": page["paid_cents"],
        "owed": page["owed_cents"],
    }


def test_an_invoices_figures_through_its_life(billing):
    api = billing.api
    draft = billing.draft()
    path = f"/api/invoices/{draft['id']}"
    ok(
        api.patch(
            path,
            json={
                "lines": [
                    billing.line("Pro license", quantity=2),
                    billing.line("Annual support plan"),
                    billing.line("Training day", unit_price_cents=125700),
                ]
            },
        )
    )
    # 2 x $49.50 + $3,600.00 + $1,257.00 = $4,956.00, and 8.875% of it is $439.845.
    assert invoice_figures(api, draft) == {
        "shows_as": "draft",
        "rate": "8.875",
        "amounts": [9900, 360000, 125700],
        "sums": (495600, 43985, 539585),
        "paid": 0,
        "owed": 0,
    }

    # A draft follows the settings' rate.
    ok(api.patch("/api/settings", json={"tax_rate": "5"}))
    assert invoice_figures(api, draft)["sums"] == (495600, 24780, 520380)

    # Issuing fixes the figures as they are then, and a later change leaves them.
    ok(api.post(f"{path}/issue", json={}))
    ok(api.patch("/api/settings", json={"tax_rate": "10"}))
    assert invoice_figures(api, draft) == {
        "shows_as": "issued",
        "rate": "5",
        "amounts": [9900, 360000, 125700],
        "sums": (495600, 24780, 520380),
        "paid": 0,
        "owed": 520380,
    }
    assert pdf_totals(api, path) == ["$4,956.00", "$247.80", "$5,203.80"]

    # A payment takes what's owed down and leaves the total, and the PDF adds Paid and Balance due.
    billing.pay(draft, 100000)
    assert invoice_figures(api, draft) == {
        "shows_as": "part_paid",
        "rate": "5",
        "amounts": [9900, 360000, 125700],
        "sums": (495600, 24780, 520380),
        "paid": 100000,
        "owed": 420380,
    }
    assert pdf_totals(api, path) == ["$4,956.00", "$247.80", "$5,203.80", "$1,000.00", "$4,203.80"]

    billing.pay(draft, 420380)
    assert invoice_figures(api, draft) == {
        "shows_as": "paid",
        "rate": "5",
        "amounts": [9900, 360000, 125700],
        "sums": (495600, 24780, 520380),
        "paid": 520380,
        "owed": 0,
    }
    assert pdf_totals(api, path) == ["$4,956.00", "$247.80", "$5,203.80", "$5,203.80", "$0.00"]


def test_a_void_invoice_keeps_its_figures_and_owes_nothing(billing):
    issued = billing.issued(billing.line("Training day"))
    path = f"/api/invoices/{issued['id']}"
    ok(billing.api.post(f"{path}/void", json={}))
    assert invoice_figures(billing.api, issued) == {
        "shows_as": "void",
        "rate": "8.875",
        "amounts": [125000],
        "sums": (125000, 11094, 136094),
        "paid": 0,
        "owed": 0,
    }
    assert pdf_totals(billing.api, path) == ["$1,250.00", "$110.94", "$1,360.94"]


# Where a new line's figures come from


def test_an_invoice_line_sent_with_only_its_product_takes_one_at_the_products_price(billing):
    draft = billing.draft()
    saved = ok(billing.api.patch(f"/api/invoices/{draft['id']}", json={"lines": [billing.line("Training day")]}))
    [line] = saved["lines"]
    assert {key: line[key] for key in ("name", "description", "quantity", "unit_price_cents", "amount_cents")} == {
        "name": "Training day",
        "description": "Up to 12 people",
        "quantity": 1,
        "unit_price_cents": 125000,
        "amount_cents": 125000,
    }
    assert sums(saved) == (125000, 11094, 136094)


def test_a_quote_line_needs_its_quantity_and_price_sent_and_takes_no_description_from_the_product(billing, open_deal):
    api = billing.api
    training = billing.products["Training day"]
    refused = api.post("/api/quotes", json={"deal_id": open_deal, "lines": [{"product_id": training}]})
    assert refused.status_code == 422
    assert refused.json()["fields"] == {
        "lines.0.quantity": "Enter a whole number from 1 to 1,000,000",
        "lines.0.unit_price_cents": "Enter a price in dollars and cents, such as 49.50",
    }

    quote = ok(
        api.post(
            "/api/quotes",
            json={"deal_id": open_deal, "lines": [{"product_id": training, "quantity": 2, "unit_price_cents": 99}]},
        )
    )
    [line] = quote["lines"]
    assert {key: line[key] for key in ("name", "description", "quantity", "unit_price_cents", "amount_cents")} == {
        "name": "Training day",
        "description": None,
        "quantity": 2,
        "unit_price_cents": 99,
        "amount_cents": 198,
    }
    # 8.875% of $1.98 is 17.5725 cents.
    assert sums(quote) == (198, 18, 216)
