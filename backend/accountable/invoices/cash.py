"""The invoices' money for the cash flow: the payments received, by the day they were paid (Y2),
and what's owed on each open invoice, expected on its due date plus its customer's average days
paid late (Y5, Y6). Each comes from one query, however many invoices there are (Q1)."""

from collections import defaultdict
from collections.abc import Iterable, Sequence
from datetime import date, timedelta

from sqlalchemy import Connection, Row, func, select

from accountable.cash import Cash, Day, Item
from accountable.crm.tables import organizations
from accountable.invoices.tables import ISSUED, invoices, payments


def _moved(conn: Connection, since: date) -> list[Day]:
    rows = conn.execute(
        select(payments.c.paid_on, func.sum(payments.c.amount_cents), func.count())
        .where(payments.c.paid_on >= since)
        .group_by(payments.c.paid_on)
    ).all()
    return [Day(on=paid_on, cents=int(cents), count=count) for paid_on, cents, count in rows]


def days_paid_late(due_date: date, cleared_on: date) -> int:
    """From the due date to the payment that cleared it. Paying on time or early is 0, never below (Y6)."""
    return max((cleared_on - due_date).days, 0)


def average_days(days: Iterable[int]) -> int:
    """To the nearest whole day, with a half rounding up, in whole numbers, never through a float.
    0 with nothing to average, so nothing divides by zero (Y6, Y18)."""
    days = list(days)
    if not days:
        return 0
    return (2 * sum(days) + len(days)) // (2 * len(days))


def _issued(conn: Connection) -> Sequence[Row]:
    """Every issued invoice that isn't void, with its customer, what's been paid and the day of its last payment."""
    paid = (
        select(
            payments.c.invoice_id,
            func.sum(payments.c.amount_cents).label("paid"),
            func.max(payments.c.paid_on).label("last_paid_on"),
        )
        .group_by(payments.c.invoice_id)
        .subquery()
    )
    return conn.execute(
        select(
            invoices.c.id,
            invoices.c.number,
            invoices.c.organization_id,
            organizations.c.name.label("organization"),
            invoices.c.due_date,
            invoices.c.total_cents,
            func.coalesce(paid.c.paid, 0).label("paid"),
            paid.c.last_paid_on,
        )
        .outerjoin(paid, paid.c.invoice_id == invoices.c.id)
        .outerjoin(organizations, organizations.c.id == invoices.c.organization_id)
        .where(invoices.c.status == ISSUED)
    ).all()


def _expected(conn: Connection, _settings: Row) -> list[Item]:
    rows = _issued(conn)
    fully_paid = [row for row in rows if row.paid >= row.total_cents]
    by_customer: dict[int | None, list[int]] = defaultdict(list)
    for row in fully_paid:
        by_customer[row.organization_id].append(days_paid_late(row.due_date, row.last_paid_on))
    everyone = average_days(days for late in by_customer.values() for days in late)
    averages = {customer: average_days(late) for customer, late in by_customer.items() if customer is not None}

    expected = []
    for row in rows:
        owed = int(row.total_cents - row.paid)
        if owed > 0:
            average = averages.get(row.organization_id, everyone)
            expected.append(
                Item(
                    id=row.id,
                    name=row.number,
                    organization=row.organization,
                    due_on=row.due_date,
                    pays_on=row.due_date + timedelta(days=average),
                    cents=owed,
                    days_paid_late=average,
                )
            )
    return expected


CASH = Cash(flow="in", moved=_moved, expected=_expected)
