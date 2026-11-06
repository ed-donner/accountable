"""Posting to the books (J3 to J8): the core, which every entry goes through, and one helper for each
thing an area does to money.

`books/` imports no other area. An area hands over plain values, never a table or a row, and
posts inside the transaction of the change that causes the entry (J7).
"""

from dataclasses import dataclass
from datetime import date, datetime
from typing import NamedTuple

from sqlalchemy import Connection, exists, insert, select

from accountable.books import accounts
from accountable.books.tables import (
    BILL,
    BILL_PAYMENT,
    INVOICE,
    OPENING_BALANCE,
    PAYMENT,
    journal_entries,
    journal_lines,
)

# The opening balance's source: the settings' one row.
SETTINGS_ROW = 1


class Unbalanced(ValueError):
    """Raised before anything is written, so no save can leave unbalanced books (J3)."""


class Line(NamedTuple):
    account: str
    debit_cents: int = 0
    credit_cents: int = 0


@dataclass(frozen=True)
class Source:
    """What an entry is for, and the page that opens it (J4)."""

    kind: str
    source_id: int
    link: str


def post(
    conn: Connection,
    *,
    on: date,
    source: Source,
    event: str,
    lines: list[Line],
    user: str | None,
    now: datetime,
) -> int | None:
    """Writes one balanced entry and gives its id, or writes nothing if every line is 0."""
    kept = [line for line in lines if line.debit_cents or line.credit_cents]
    if not kept:
        return None
    if sum(line.debit_cents for line in kept) != sum(line.credit_cents for line in kept):
        raise Unbalanced(f"The {event} entry's debits and credits differ")
    return _write(conn, on=on, source=source, event=event, lines=kept, user=user, now=now, reverses=None)


def _write(
    conn: Connection,
    *,
    on: date,
    source: Source,
    event: str,
    lines: list[Line],
    user: str | None,
    now: datetime,
    reverses: int | None,
) -> int:
    entry_id = conn.execute(
        insert(journal_entries)
        .values(
            entry_date=on,
            kind=source.kind,
            source_id=source.source_id,
            event=event,
            link=source.link,
            reverses_id=reverses,
            created_by=user,
            created_at=now,
        )
        .returning(journal_entries.c.id)
    ).scalar_one()
    conn.execute(
        insert(journal_lines),
        [
            {
                "entry_id": entry_id,
                "account": line.account,
                "debit_cents": line.debit_cents,
                "credit_cents": line.credit_cents,
                "created_at": now,
            }
            for line in lines
        ],
    )
    return entry_id


def reverse(conn: Connection, *, source: Source, event: str, user: str | None, now: datetime) -> int | None:
    """Undoes the source's entry that nothing has reversed yet: the same lines with the sides swapped, on
    the same date. Does nothing if there's none open. The stored lines are swapped, never worked out again (J6)."""
    reversal = journal_entries.alias("reversal")
    open_entry = conn.execute(
        select(journal_entries.c.id, journal_entries.c.entry_date)
        .where(
            journal_entries.c.kind == source.kind,
            journal_entries.c.source_id == source.source_id,
            journal_entries.c.reverses_id.is_(None),
            ~exists().where(reversal.c.reverses_id == journal_entries.c.id),
        )
        .order_by(journal_entries.c.id.desc())
        .limit(1)
    ).one_or_none()
    if open_entry is None:
        return None
    stored = conn.execute(
        select(journal_lines.c.account, journal_lines.c.debit_cents, journal_lines.c.credit_cents)
        .where(journal_lines.c.entry_id == open_entry.id)
        .order_by(journal_lines.c.id)
    ).all()
    swapped = [Line(line.account, line.credit_cents, line.debit_cents) for line in stored]
    return _write(
        conn,
        on=open_entry.entry_date,
        source=source,
        event=event,
        lines=swapped,
        user=user,
        now=now,
        reverses=open_entry.id,
    )


def invoice_source(invoice_id: int) -> Source:
    return Source(INVOICE, invoice_id, f"/invoices/{invoice_id}")


def payment_source(payment_id: int, invoice_id: int) -> Source:
    """Payments have no page of their own, so a payment opens its invoice's."""
    return Source(PAYMENT, payment_id, f"/invoices/{invoice_id}")


def bill_source(bill_id: int) -> Source:
    return Source(BILL, bill_id, f"/bills/{bill_id}")


def bill_payment_source(bill_id: int) -> Source:
    return Source(BILL_PAYMENT, bill_id, f"/bills/{bill_id}")


OPENING_BALANCE_SOURCE = Source(OPENING_BALANCE, SETTINGS_ROW, "/settings")


def invoice_issued(
    conn: Connection,
    *,
    invoice_id: int,
    on: date,
    subtotal_cents: int,
    tax_cents: int,
    total_cents: int,
    user: str | None,
    now: datetime,
) -> int | None:
    lines = [
        Line(accounts.RECEIVABLE, debit_cents=total_cents),
        Line(accounts.REVENUE_ACCOUNT, credit_cents=subtotal_cents),
        Line(accounts.TAX_PAYABLE, credit_cents=tax_cents),
    ]
    return post(conn, on=on, source=invoice_source(invoice_id), event="invoice_issued", lines=lines, user=user, now=now)


def payment_recorded(
    conn: Connection, *, payment_id: int, invoice_id: int, on: date, cents: int, user: str | None, now: datetime
) -> int | None:
    lines = [Line(accounts.CASH, debit_cents=cents), Line(accounts.RECEIVABLE, credit_cents=cents)]
    return post(
        conn,
        on=on,
        source=payment_source(payment_id, invoice_id),
        event="payment_recorded",
        lines=lines,
        user=user,
        now=now,
    )


def bill_added(
    conn: Connection,
    *,
    bill_id: int,
    on: date,
    total_cents: int,
    category: str,
    user: str | None,
    now: datetime,
    event: str = "bill_added",
) -> int | None:
    """The total counts tax as part of the expense, since Accountable doesn't claim it back."""
    lines = [
        Line(accounts.expense_for(category), debit_cents=total_cents),
        Line(accounts.PAYABLE, credit_cents=total_cents),
    ]
    return post(conn, on=on, source=bill_source(bill_id), event=event, lines=lines, user=user, now=now)


def bill_paid(
    conn: Connection,
    *,
    bill_id: int,
    on: date,
    total_cents: int,
    user: str | None,
    now: datetime,
    event: str = "bill_paid",
) -> int | None:
    lines = [Line(accounts.PAYABLE, debit_cents=total_cents), Line(accounts.CASH, credit_cents=total_cents)]
    return post(conn, on=on, source=bill_payment_source(bill_id), event=event, lines=lines, user=user, now=now)


def opening_balance(
    conn: Connection,
    *,
    on: date,
    cents: int,
    user: str | None,
    now: datetime,
    event: str = "opening_balance_set",
) -> int | None:
    """Below zero the sides swap: an overdrawn account debits Owner's equity and credits Cash."""
    amount = abs(cents)
    cash_side, equity_side = (
        (Line(accounts.CASH, debit_cents=amount), Line(accounts.OWNERS_EQUITY, credit_cents=amount))
        if cents >= 0
        else (Line(accounts.CASH, credit_cents=amount), Line(accounts.OWNERS_EQUITY, debit_cents=amount))
    )
    return post(
        conn, on=on, source=OPENING_BALANCE_SOURCE, event=event, lines=[cash_side, equity_side], user=user, now=now
    )
