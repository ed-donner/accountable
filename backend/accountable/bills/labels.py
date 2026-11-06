"""A bill's name for the books' entries: its number and supplier (X13), for many bills in one read."""

from collections.abc import Mapping, Sequence

from sqlalchemy import Connection, select

from accountable.bills.tables import bills
from accountable.crm.tables import organizations


def labels(conn: Connection, ids: Sequence[int]) -> Mapping[int, str]:
    """Such as "8841 from Northwind Software", for each bill among the ids that still exists."""
    rows = conn.execute(
        select(bills.c.id, bills.c.bill_number, organizations.c.name)
        .join(organizations, organizations.c.id == bills.c.organization_id)
        .where(bills.c.id.in_(ids))
    )
    return {row.id: f"{row.bill_number} from {row.name}" for row in rows}
