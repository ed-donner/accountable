"""What holds a deal or an organization: records in another area that point at it, such as
the invoices on a deal. A held record can't be deleted (D4), so an invoice, or a bill from a
supplier, is never left pointing at nothing.

Each area says which of its records hold what, as a Hold, and main.py puts every area's on
the app. The routes that delete read them from there, so they never name the areas that hold.
"""

from collections.abc import Sequence
from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import Column, Connection, Table, func, select


@dataclass(frozen=True)
class Hold:
    """One kind of record that holds another, such as an invoice holding its deal."""

    link: Column
    """The holding table's column that points at the record it holds, such as an invoice's deal_id."""
    noun: str
    """One holding record, as the delete dialog names it, such as "invoice"."""

    @property
    def held(self) -> Table:
        """The table the link's foreign key points at."""
        [key] = self.link.foreign_keys
        return key.column.table


class Holding(BaseModel):
    """How many records of one kind hold a record, for its delete dialog."""

    noun: str
    count: int


def app_holds(request: Request) -> Sequence[Hold]:
    """Every area's holds, which main.py puts on the app. Tests can stand in for them."""
    return request.app.state.holds


Holds = Annotated[Sequence[Hold], Depends(app_holds)]


def holding(conn: Connection, holds: Sequence[Hold], table: Table, record_id: int) -> list[Holding]:
    """The kinds of record that hold this one, in the order the areas give them, leaving out any with none."""
    found = []
    for hold in (hold for hold in holds if hold.held is table):
        count = conn.execute(
            select(func.count()).select_from(hold.link.table).where(hold.link == record_id)
        ).scalar_one()
        if count:
            found.append(Holding(noun=hold.noun, count=count))
    return found


def plural(count: int, noun: str) -> str:
    """ "1 invoice", "3 invoices", "2 activities", as the frontend's plural() says them."""
    if count == 1:
        return f"1 {noun}"
    return f"{count} {noun[:-1]}ies" if noun.endswith("y") else f"{count} {noun}s"


def listed(items: Sequence[str]) -> str:
    """ "2 quotes", "2 quotes and 1 invoice", "2 quotes, 1 invoice and 3 bills"."""
    return items[0] if len(items) == 1 else f"{', '.join(items[:-1])} and {items[-1]}"


def refuse_if_held(conn: Connection, holds: Sequence[Hold], table: Table, record_id: int, kind: str) -> None:
    """Stops the delete of a held record with a 409, in the words its dialog uses.

    It runs inside the delete's own transaction, under the write lock, so nothing can
    come to hold the record between this check and the delete.
    """
    held_by = holding(conn, holds, table, record_id)
    if held_by:
        what = listed([plural(item.count, item.noun) for item in held_by])
        raise HTTPException(409, f"This {kind} has {what}, so it can't be deleted.")
