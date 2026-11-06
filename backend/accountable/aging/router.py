"""The aged balances, GET /aged-balances/customers and /suppliers (X1 to X10).

Worked out from the invoices, payments and bills, never the journal, so the books stay a separate
check (X4). Each view takes one read of the database whatever the number of records (X20).
"""

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Query
from sqlalchemy import Connection, func, or_, select

from accountable import api, db
from accountable.aging import ages, schemas
from accountable.bills.tables import bills
from accountable.crm.tables import organizations
from accountable.invoices.tables import ISSUED, invoices, payments

router = APIRouter(prefix="/aged-balances")

On = Annotated[date | None, Query()]


def _owed_by_customers(conn: Connection, on: date) -> list[ages.Owed]:
    """Issued invoices from their issue date, for their total less the payments dated up to the day (X2)."""
    paid = (
        select(payments.c.invoice_id, func.sum(payments.c.amount_cents).label("paid"))
        .where(payments.c.paid_on <= on)
        .group_by(payments.c.invoice_id)
        .subquery()
    )
    rows = conn.execute(
        select(
            invoices.c.id,
            invoices.c.organization_id,
            organizations.c.name,
            invoices.c.number,
            invoices.c.due_date,
            invoices.c.total_cents,
            func.coalesce(paid.c.paid, 0).label("paid"),
        )
        .join(organizations, organizations.c.id == invoices.c.organization_id)
        .outerjoin(paid, paid.c.invoice_id == invoices.c.id)
        .where(invoices.c.status == ISSUED, invoices.c.issue_date <= on)
    ).all()
    return [
        ages.Owed(row.id, row.organization_id, row.name, row.number, row.due_date, row.total_cents - row.paid)
        for row in rows
        if row.total_cents - row.paid != 0
    ]


def _owed_to_suppliers(conn: Connection, on: date) -> list[ages.Owed]:
    """Bills from their bill date, for their total with tax, unless paid on or before the day (X3)."""
    rows = conn.execute(
        select(
            bills.c.id,
            bills.c.organization_id,
            organizations.c.name,
            bills.c.bill_number,
            bills.c.due_date,
            (bills.c.amount_cents + bills.c.tax_cents).label("cents"),
        )
        .join(organizations, organizations.c.id == bills.c.organization_id)
        .where(bills.c.bill_date <= on, or_(bills.c.paid_on.is_(None), bills.c.paid_on > on))
    ).all()
    return [ages.Owed(row.id, row.organization_id, row.name, row.bill_number, row.due_date, row.cents) for row in rows]


def _part_sums(totals: ages.Totals) -> list[schemas.PartSum]:
    return [schemas.PartSum(key=part, cents=sum_.cents, count=sum_.count) for part, sum_ in totals.parts.items()]


def _row(row: ages.Row) -> schemas.Row:
    return schemas.Row(
        id=row.id,
        name=row.name,
        parts=_part_sums(row),
        total_cents=row.total,
        oldest_days_past_due=row.oldest,
        items=[schemas.Item(**vars(item)) for item in row.items],
    )


def _reply(owing: list[ages.Owed], today: date, on: date) -> schemas.AgedBalances:
    rows, totals = ages.aged(owing, on)
    return schemas.AgedBalances(
        today=today,
        on=on,
        rows=[_row(row) for row in rows],
        totals=schemas.Totals(parts=_part_sums(totals), total_cents=totals.total),
    )


def _day(on: date | None, today: date) -> date:
    if on is None:
        return today
    if on > today:
        raise api.FieldError({"on": schemas.ON_MESSAGE})
    return on


@router.get("/customers")
def customers(today: api.Today, on: On = None) -> schemas.AgedBalances:
    day = _day(on, today)
    with db.reading() as conn:
        return _reply(_owed_by_customers(conn, day), today, day)


@router.get("/suppliers")
def suppliers(today: api.Today, on: On = None) -> schemas.AgedBalances:
    day = _day(on, today)
    with db.reading() as conn:
        return _reply(_owed_to_suppliers(conn, day), today, day)
