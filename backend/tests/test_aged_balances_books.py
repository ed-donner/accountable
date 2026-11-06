"""The aged balances' totals against the books (X4, X18): on each day, Customers' total equals the Receivable
balance and Suppliers' the Payable balance from GET /api/books/balances, to the cent.

The page reads the invoices and bills and the books read the journal, so an agreement isn't one reading itself.
Its own file, because test_books_checks.py may not be edited (J11).
"""

from datetime import date, datetime, timedelta

import pytest
from accountable import cli, db
from conftest import NOW, TODAY
from fastapi.testclient import TestClient

CUSTOMERS = "/api/aged-balances/customers"
SUPPLIERS = "/api/aged-balances/suppliers"


def books_balance(api: TestClient, account: str, day: date) -> int:
    reply = api.get("/api/books/balances", params={"on": day.isoformat()})
    assert reply.status_code == 200, reply.text
    [found] = [row for row in reply.json()["accounts"] if row["key"] == account]
    return int(found["balance_cents"])


def aged_total(api: TestClient, path: str, day: date) -> int:
    reply = api.get(path, params={"on": day.isoformat()})
    assert reply.status_code == 200, reply.text
    return int(reply.json()["totals"]["total_cents"])


def agree_on(api: TestClient, days: list[date]) -> None:
    for day in days:
        assert aged_total(api, CUSTOMERS, day) == books_balance(api, "receivable", day), ("receivable", day)
        assert aged_total(api, SUPPLIERS, day) == books_balance(api, "payable", day), ("payable", day)


def add_bill(api: TestClient, supplier: int, number: str, bill_date: date, cents: int, **values) -> dict:
    body = {
        "organization_id": supplier,
        "bill_number": number,
        "bill_date": bill_date.isoformat(),
        "amount_cents": cents,
        "tax_cents": cents // 10,
        "category": "software",
        **values,
    }
    reply = api.post("/api/bills", json=body)
    assert reply.status_code == 201, reply.text
    return reply.json()


def test_the_totals_equal_the_books_on_a_small_set_on_every_day_that_matters(billing, make):
    api = billing.api
    supplier = make.organization("Northwind Software")
    first = billing.issued(on=date(2026, 8, 1))
    voided = billing.issued(billing.line("Training day", quantity=2), on=date(2026, 9, 10))
    billing.issued(billing.line("Annual support plan"), on=date(2026, 10, 20))
    billing.pay(first, 1000, date(2026, 9, 15))
    billing.pay(first, int(first["total_cents"]) - 1000, date(2026, 10, 5))
    # Voided today, so its issue entry's own date is the one reversed, and the books never show it.
    assert api.post(f"/api/invoices/{voided['id']}/void", json={}).status_code == 200
    add_bill(api, supplier, "S-1", date(2026, 8, 20), 50_000)
    paid = add_bill(api, supplier, "S-2", date(2026, 9, 1), 70_000, paid_on="2026-10-10")
    add_bill(api, supplier, "S-3", date(2026, 10, 25), 9_999)
    days = [
        date(2026, 7, 31),
        date(2026, 8, 1),
        date(2026, 9, 1),
        date(2026, 9, 9),
        date(2026, 9, 10),
        date(2026, 9, 15),
        date(2026, 10, 5),
        date(2026, 10, 9),
        date(2026, 10, 10),
        date(2026, 10, 20),
        date(2026, 10, 25),
        TODAY,
        date(2000, 1, 1),
    ]
    agree_on(api, days)
    # The totals aren't all zero, so the agreement says something.
    assert aged_total(api, CUSTOMERS, TODAY) > 0 and aged_total(api, SUPPLIERS, TODAY) > 0
    assert aged_total(api, SUPPLIERS, date(2026, 10, 9)) - aged_total(api, SUPPLIERS, date(2026, 10, 10)) == 77_000
    assert paid["paid_on"] == "2026-10-10"


@pytest.fixture
def sample_api(api, monkeypatch) -> TestClient:
    """The sample data on a new database, dated from today in the tests."""
    monkeypatch.setattr(db, "local_today", lambda: TODAY)
    monkeypatch.setattr(db, "utc_now", lambda: NOW)
    with db.writing() as conn:
        cli.fill_sample(conn)
    return api


def test_the_totals_equal_the_books_on_the_sample_data_on_a_series_of_days(sample_api):
    days = [
        TODAY - timedelta(days=back) for back in (0, 1, 2, 5, 9, 10, 15, 30, 31, 45, 60, 90, 91, 120, 200, 300, 364)
    ]
    days += [date(2000, 1, 1), datetime(2026, 1, 1).date()]
    agree_on(sample_api, days)
    assert aged_total(sample_api, CUSTOMERS, TODAY) > 0 and aged_total(sample_api, SUPPLIERS, TODAY) > 0
