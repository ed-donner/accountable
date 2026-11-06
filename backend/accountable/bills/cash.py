"""The bills' money for the cash flow: the bills marked paid, at their totals with tax, by the day
they were paid (Y2), and each unpaid bill's total, expected on its due date (Y7). Each comes from
one query, however many bills there are (Q1)."""

from datetime import date

from sqlalchemy import Connection, Row, func, select

from accountable.bills.tables import bills
from accountable.cash import Cash, Day, Item
from accountable.crm.tables import organizations

_total = bills.c.amount_cents + bills.c.tax_cents


def _moved(conn: Connection, since: date) -> list[Day]:
    rows = conn.execute(
        select(bills.c.paid_on, func.sum(_total), func.count())
        .where(bills.c.paid_on >= since)
        .group_by(bills.c.paid_on)
    ).all()
    return [Day(on=paid_on, cents=int(cents), count=count) for paid_on, cents, count in rows]


def _expected(conn: Connection, _settings: Row) -> list[Item]:
    rows = conn.execute(
        select(bills.c.id, bills.c.bill_number, organizations.c.name, bills.c.due_date, _total.label("total_cents"))
        .join(organizations, organizations.c.id == bills.c.organization_id)
        .where(bills.c.paid_on.is_(None))
    ).all()
    return [
        Item(
            id=row.id,
            name=row.bill_number,
            organization=row.name,
            due_on=row.due_date,
            pays_on=row.due_date,
            cents=int(row.total_cents),
        )
        for row in rows
    ]


CASH = Cash(flow="out", moved=_moved, expected=_expected)
