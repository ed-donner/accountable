"""The dashboard's Money section, GET /api/invoices/money, against a small dataset with known answers (V29 to V31)."""

from datetime import date, timedelta

import pytest
from accountable import db
from conftest import TODAY

MONEY = "/api/invoices/money"
MONTHS = ["Nov", "Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct"]
number = iter(range(1, 1000))


def issued(make, deal: int, total: int, due: date, **values) -> int:
    row = {
        "status": "issued",
        "number": f"INV-{next(number):04d}",
        "issue_date": due - timedelta(days=30),
        "due_date": due,
        "subtotal_cents": total,
        "tax_cents": 0,
        "total_cents": total,
    }
    return make.invoice(deal, **{**row, **values})


def late(days: int) -> date:
    return TODAY - timedelta(days=days)


@pytest.fixture
def deal(make) -> int:
    return make.deal(stage="won", close_date=TODAY)


def groups(reply: dict) -> dict[str, tuple[int, int]]:
    return {group["key"]: (group["cents"], group["count"]) for group in reply["groups"]}


def test_an_empty_database_has_zeros_everywhere(api):
    reply = api.get(MONEY)
    assert reply.status_code == 200
    money = reply.json()
    assert money["owed"] == money["overdue"] == {"cents": 0, "count": 0}
    assert groups(money) == {key: (0, 0) for key in ("not_due", "1_30", "31_60", "61_90", "over_90")}
    assert [month["label"] for month in money["payments"]] == MONTHS
    assert {(month["cents"], month["count"]) for month in money["payments"]} == {(0, 0)}


def test_drafts_and_void_invoices_are_left_out(api, make, deal):
    make.invoice(deal)
    issued(make, deal, 50000, late(40), status="void")
    issued(make, deal, 10000, late(-5))
    money = api.get(MONEY).json()
    assert money["owed"] == {"cents": 10000, "count": 1}
    assert money["overdue"] == {"cents": 0, "count": 0}


def test_part_paid_counts_by_what_is_owed_and_paid_ones_not_at_all(api, make, deal):
    part = issued(make, deal, 100000, late(10))
    make.payment(part, 30000, paid_on=late(20))
    paid = issued(make, deal, 40000, late(10))
    make.payment(paid, 40000, paid_on=late(15))
    money = api.get(MONEY).json()
    assert money["owed"] == money["overdue"] == {"cents": 70000, "count": 1}
    assert groups(money)["1_30"] == (70000, 1)


def test_each_groups_edges(api, make, deal):
    for days, cents in [(-30, 1), (0, 2), (1, 4), (30, 8), (31, 16), (60, 32), (61, 64), (90, 128), (91, 256)]:
        issued(make, deal, cents, late(days))
    money = api.get(MONEY).json()
    assert groups(money) == {
        "not_due": (3, 2),
        "1_30": (12, 2),
        "31_60": (48, 2),
        "61_90": (192, 2),
        "over_90": (256, 1),
    }
    assert money["owed"] == {"cents": 511, "count": 9}
    assert money["overdue"] == {"cents": 508, "count": 7}
    assert [group["key"] for group in money["groups"]] == ["not_due", "1_30", "31_60", "61_90", "over_90"]


def test_payments_by_month_across_the_turn_of_a_year_with_zeros_for_empty_months(api, make, deal):
    invoice = issued(make, deal, 10**9, late(0))
    for paid_on, cents in [
        (date(2025, 10, 31), 1),  # A month too old to show.
        (date(2025, 11, 1), 10),
        (date(2025, 12, 31), 20),
        (date(2026, 1, 1), 40),
        (date(2026, 1, 15), 80),
        (TODAY, 160),
    ]:
        make.payment(invoice, cents, paid_on=paid_on)
    money = api.get(MONEY).json()["payments"]
    assert [month["month"] for month in money][:3] == ["2025-11", "2025-12", "2026-01"]
    by_label = {month["label"]: (month["cents"], month["count"]) for month in money}
    assert by_label == {
        **{label: (0, 0) for label in MONTHS},
        "Nov": (10, 1),
        "Dec": (20, 1),
        "Jan": (120, 2),
        "Oct": (160, 1),
    }


def test_the_figures_follow_today(api, make, deal, local_app):
    issued(make, deal, 500, TODAY)
    assert groups(api.get(MONEY).json())["not_due"] == (500, 1)
    local_app.dependency_overrides[db.local_today] = lambda: TODAY + timedelta(days=1)
    assert groups(api.get(MONEY).json())["1_30"] == (500, 1)


def test_money_is_reached_as_itself_and_not_as_an_invoices_id(api, local_app):
    """Added before the invoice's own routes, which would read money as an id and refuse it (Risks 10)."""
    paths = list(local_app.openapi()["paths"])
    assert paths.index("/api/invoices/money") < paths.index("/api/invoices/{invoice_id}")
    assert api.get(MONEY).status_code == 200
