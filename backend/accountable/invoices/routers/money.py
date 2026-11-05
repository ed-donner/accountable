"""The dashboard's Money section, GET /invoices/money (V29 to V31): what customers owe, how
much of it is overdue and how late, and the payments received each month.

Added to the app before the invoices' own routes, so /invoices/money is never read as an
invoice's id. Each figure comes from one grouped query, never one per invoice (Q1).
"""

from datetime import date

from fastapi import APIRouter
from sqlalchemy import Connection, func, select

from accountable import api, db, months
from accountable.invoices import figures, schemas
from accountable.invoices.tables import ISSUED, invoices, payments

router = APIRouter(prefix="/invoices")


def _owed_by_group(conn: Connection, today: date) -> dict[figures.LateGroup, schemas.Sum]:
    """Issued invoices only, never drafts or void ones, each counted by what's still owed on it."""
    paid = (
        select(payments.c.invoice_id, func.sum(payments.c.amount_cents).label("paid"))
        .group_by(payments.c.invoice_id)
        .subquery()
    )
    rows = conn.execute(
        select(invoices.c.total_cents, invoices.c.due_date, func.coalesce(paid.c.paid, 0).label("paid"))
        .outerjoin(paid, paid.c.invoice_id == invoices.c.id)
        .where(invoices.c.status == ISSUED)
    ).all()
    groups = {group: schemas.Sum(cents=0, count=0) for group in figures.GROUPS}
    for row in rows:
        owed = figures.owed(ISSUED, row.total_cents, row.paid)
        if owed > 0:
            group = groups[figures.late_group(row.due_date, today)]
            group.cents += owed
            group.count += 1
    return groups


def _payments_by_month(conn: Connection, today: date) -> list[schemas.Month]:
    """The last 12 months, oldest first, with zeros where there were none, by the date each was paid."""
    shown = months.last_months(today)
    first = date.fromisoformat(f"{shown[0].key}-01")
    rows = conn.execute(
        select(payments.c.paid_on, func.sum(payments.c.amount_cents), func.count())
        .where(payments.c.paid_on >= first, payments.c.paid_on <= today)
        .group_by(payments.c.paid_on)
    ).all()
    by_month = {month.key: schemas.Month(month=month.key, label=month.label, cents=0, count=0) for month in shown}
    for paid_on, cents, count in rows:
        month = by_month[months.month_key(paid_on)]
        month.cents += cents
        month.count += count
    return list(by_month.values())


def _total(groups: list[schemas.Sum]) -> schemas.Sum:
    return schemas.Sum(cents=sum(group.cents for group in groups), count=sum(group.count for group in groups))


@router.get("/money")
def money(today: api.Today) -> schemas.Money:
    with db.reading() as conn:
        groups = _owed_by_group(conn, today)
        paid = _payments_by_month(conn, today)
    late = [sum_ for group, sum_ in groups.items() if group != "not_due"]
    return schemas.Money(
        owed=_total(list(groups.values())),
        overdue=_total(late),
        groups=[schemas.Group(key=group, cents=sum_.cents, count=sum_.count) for group, sum_ in groups.items()],
        payments=paid,
    )
