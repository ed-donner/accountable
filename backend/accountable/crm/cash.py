"""The open deals as the cash flow's likely deals (Y13): each one's expected revenue, expected on
its close date plus the payment terms. They're shown apart from the forecast, never in it (Y14)."""

from datetime import timedelta

from sqlalchemy import Connection, Row, select

from accountable.cash import Cash, Item
from accountable.crm import rules
from accountable.crm.tables import deals, organizations


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
            pays_on=row.close_date + terms,
            # Whole dollars, as Terms rounds each deal, in cents as the rest of the cash flow is.
            cents=rules.expected_revenue(row.value, row.probability) * 100,
        )
        for row in rows
    ]


CASH = Cash(flow="likely", moved=None, expected=_expected)
