"""An invoice's name for the books' entries: its number (X13), for many invoices in one read."""

from collections.abc import Mapping, Sequence

from sqlalchemy import Connection, select

from accountable.invoices.tables import invoices


def labels(conn: Connection, ids: Sequence[int]) -> Mapping[int, str]:
    """The number of each issued invoice among the ids. A draft has none, and a deleted one is missing."""
    rows = conn.execute(select(invoices.c.id, invoices.c.number).where(invoices.c.id.in_(ids)))
    return {row.id: row.number for row in rows if row.number}
