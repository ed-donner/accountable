"""The four checks on the books (J11), read from the rows with SQLAlchemy Core and never through the
code that posts, so a mistake in the posting can't hide from them.

Written once: no later change may edit this file. A later change that needs another check adds it in a file of its own.
"""

from datetime import date, timedelta

import pytest
from accountable import cli, db
from conftest import NOW, TODAY
from sqlalchemy import BigInteger, Connection, Date, DateTime, Integer, Text, column, func, select, table

entries = table(
    "journal_entries",
    column("id", Integer),
    column("entry_date", Date),
    column("kind", Text),
    column("source_id", Integer),
    column("event", Text),
    column("link", Text),
    column("created_at", DateTime),
)
lines = table(
    "journal_lines",
    column("entry_id", Integer),
    column("account", Text),
    column("debit_cents", BigInteger),
    column("credit_cents", BigInteger),
    column("created_at", DateTime),
)
invoices = table("invoices", column("id", Integer), column("status", Text), column("total_cents", BigInteger))
payments = table("payments", column("invoice_id", Integer), column("amount_cents", BigInteger))
bills = table(
    "bills",
    column("amount_cents", BigInteger),
    column("tax_cents", BigInteger),
    column("paid_on"),
)


def _sum(query, conn: Connection) -> int:
    return int(conn.execute(query).scalar_one() or 0)


def every_entry_balances(conn: Connection) -> None:
    unbalanced = conn.execute(
        select(entries.c.id)
        .outerjoin(lines, lines.c.entry_id == entries.c.id)
        .group_by(entries.c.id)
        .having(func.coalesce(func.sum(lines.c.debit_cents), 0) != func.coalesce(func.sum(lines.c.credit_cents), 0))
        .having(func.count(lines.c.entry_id) > 0)
    ).all()
    assert unbalanced == []
    empty = conn.execute(
        select(entries.c.id)
        .outerjoin(lines, lines.c.entry_id == entries.c.id)
        .group_by(entries.c.id)
        .having(func.count(lines.c.entry_id) == 0)
    ).all()
    assert empty == []


def the_books_balance(conn: Connection) -> None:
    debits = _sum(select(func.sum(lines.c.debit_cents)), conn)
    credits = _sum(select(func.sum(lines.c.credit_cents)), conn)
    assert debits == credits


def _balance(conn: Connection, account: str, *, debit_side: bool) -> int:
    debits = _sum(select(func.sum(lines.c.debit_cents)).where(lines.c.account == account), conn)
    credits = _sum(select(func.sum(lines.c.credit_cents)).where(lines.c.account == account), conn)
    return debits - credits if debit_side else credits - debits


def receivable_is_what_issued_invoices_still_owe(conn: Connection) -> None:
    billed = _sum(select(func.sum(invoices.c.total_cents)).where(invoices.c.status == "issued"), conn)
    paid = _sum(
        select(func.sum(payments.c.amount_cents))
        .join(invoices, invoices.c.id == payments.c.invoice_id)
        .where(invoices.c.status == "issued"),
        conn,
    )
    assert _balance(conn, "receivable", debit_side=True) == billed - paid


def payable_is_what_unpaid_bills_total(conn: Connection) -> None:
    owed = _sum(select(func.sum(bills.c.amount_cents + bills.c.tax_cents)).where(bills.c.paid_on.is_(None)), conn)
    assert _balance(conn, "payable", debit_side=False) == owed


CHECKS = [
    every_entry_balances,
    the_books_balance,
    receivable_is_what_issued_invoices_still_owe,
    payable_is_what_unpaid_bills_total,
]


def hold() -> None:
    """Runs the four checks on the database as it is now."""
    with db.reading() as conn:
        for check in CHECKS:
            check(conn)


def test_the_checks_hold_on_the_sample_data(database):
    with db.writing() as conn:
        cli.fill_sample(conn)
    hold()
    with db.reading() as conn:
        assert _sum(select(func.count()).select_from(entries), conn) > 100


STRAY_ENTRY = {"entry_date": TODAY, "kind": "bill", "source_id": 1, "event": "x", "link": "/", "created_at": NOW}


def test_the_first_three_checks_fail_when_their_rule_is_broken(database):
    """So a pass means something: one stray debit to Receivable breaks all three."""
    with db.writing() as conn:
        conn.execute(entries.insert().values(id=1, **STRAY_ENTRY))
        conn.execute(
            lines.insert().values(entry_id=1, account="receivable", debit_cents=5, credit_cents=0, created_at=NOW)
        )
    with db.reading() as conn:
        for check in (every_entry_balances, the_books_balance, receivable_is_what_issued_invoices_still_owe):
            with pytest.raises(AssertionError):
                check(conn)


def test_the_payable_check_fails_for_an_unpaid_bill_with_no_entry(make):
    make.bill()
    with db.reading() as conn, pytest.raises(AssertionError):
        payable_is_what_unpaid_bills_total(conn)


# One scenario: every kind of change in J5 and J6, one after another, with the four checks after each.


def an_invoice_on(billing, tax_rate: str, *, on: date = TODAY) -> dict:
    assert billing.api.patch("/api/settings", json={"tax_rate": tax_rate}).status_code == 200
    hold()
    invoice = billing.issued(billing.line("Annual support plan"), on=on)
    hold()
    return invoice


def test_the_checks_hold_after_every_kind_of_invoice_and_payment_change(billing):
    taxed = an_invoice_on(billing, "8.875", on=TODAY - timedelta(days=5))
    untaxed = an_invoice_on(billing, "0", on=TODAY - timedelta(days=3))
    payment = billing.pay(taxed, 100000, on=TODAY - timedelta(days=4))["payments"][0]
    hold()
    billing.pay(taxed, taxed["total_cents"] - 100000, on=TODAY - timedelta(days=2))
    hold()
    reply = billing.api.delete(f"/api/invoices/{taxed['id']}/payments/{payment['id']}")
    assert reply.status_code == 200
    hold()
    assert billing.api.post(f"/api/invoices/{untaxed['id']}/void", json={}).status_code == 200
    hold()
    draft = billing.draft()
    assert billing.api.delete(f"/api/invoices/{draft['id']}").status_code == 204
    hold()


def bill(supplier: int, **values) -> dict:
    return {
        "organization_id": supplier,
        "bill_number": "B-1",
        "bill_date": "2026-10-01",
        "amount_cents": 124000,
        "tax_cents": 11005,
        "category": "software",
        **values,
    }


def test_the_checks_hold_after_every_kind_of_bill_change(billing):
    api, supplier = billing.api, billing.organization
    unpaid = api.post("/api/bills", json=bill(supplier)).json()["id"]
    hold()
    paid = api.post("/api/bills", json=bill(supplier, bill_number="B-2", paid_on="2026-10-05")).json()["id"]
    hold()
    changes = [
        (unpaid, {"amount_cents": 150000}),
        (unpaid, {"tax_cents": 0}),
        (unpaid, {"category": "travel"}),
        (unpaid, {"bill_date": "2026-09-20", "due_date": "2026-10-20"}),
        (unpaid, {"paid_on": "2026-10-10"}),
        (unpaid, {"paid_on": None}),
        (unpaid, {"paid_on": "2026-10-10"}),
        (unpaid, {"amount_cents": 99900}),
        (paid, {"paid_on": "2026-10-08"}),
        (paid, {"tax_cents": 5}),
        (paid, {"category": "office", "bill_date": "2026-10-02"}),
        (paid, {"paid_on": None}),
        (paid, {"paid_on": "2026-10-09"}),
        (paid, {"notes": "Only a note", "bill_number": "B-2b", "due_date": "2026-11-15"}),
    ]
    for bill_id, change in changes:
        assert api.patch(f"/api/bills/{bill_id}", json=change).status_code == 200, change
        hold()
    assert api.delete(f"/api/bills/{unpaid}").status_code == 204
    hold()
    assert api.delete(f"/api/bills/{paid}").status_code == 204
    hold()


def test_the_checks_hold_after_every_kind_of_opening_balance_change(billing):
    api = billing.api
    saves = [
        {"opening_balance_cents": 500000, "opening_balance_on": "2026-01-01"},
        {"opening_balance_cents": 750000},
        {"opening_balance_on": "2026-02-01"},
        {"opening_balance_cents": -120000},
        {"opening_balance_cents": 0},
        {"opening_balance_cents": None, "opening_balance_on": None},
        {"company_name": "Plainsong Systems Ltd"},
    ]
    for save in saves:
        assert api.patch("/api/settings", json=save).status_code == 200, save
        hold()
