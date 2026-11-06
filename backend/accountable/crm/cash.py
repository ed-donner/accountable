"""The open deals as the cash flow's likely deals (Y13): each one's expected revenue, expected on
its close date plus the payment terms. They're shown apart from the forecast, never in it (Y14)."""

from datetime import date, timedelta

from sqlalchemy import Connection, Row, select

from accountable.cash import Cash, Item
from accountable.crm import rules
from accountable.crm.tables import deals, organizations


def _pays_on(close_date: date, terms: timedelta) -> date:
    """Its close date plus the payment terms. The CRM saves any date, and one near enough the end of
    the calendar would go past its last day, so that's kept as the last day, long after the
    forecast, which leaves it out (Y13)."""
    return close_date + terms if close_date <= date.max - terms else date.max


def _expected(conn: Connection, settings: Row) -> list[Item]:
    terms = timedelta(days=settings.payment_terms_days)
    rows = conn.execute(
        select(
            deals.c.id,
            deals.c.name,
            organizations.c.name.label("organization"),
            deals.c.close_date,
            deals.c.value,
            deals.c.probability,
        )
        .outerjoin(organizations, organizations.c.id == deals.c.organization_id)
        .where(deals.c.stage.in_(rules.OPEN_STAGES))
    ).all()
    return [
        Item(
            id=row.id,
            name=row.name,
            organization=row.organization,
            due_on=row.close_date,
            pays_on=_pays_on(row.close_date, terms),
            # Whole dollars, as Terms rounds each deal, in cents as the rest of the cash flow is.
            cents=rules.expected_revenue(row.value, row.probability) * 100,
        )
        for row in rows
    ]


CASH = Cash(flow="likely", moved=None, expected=_expected)
