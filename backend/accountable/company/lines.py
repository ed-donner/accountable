"""A quote's or an invoice's lines: how both areas save them, and how their replies carry them (B16).

The layout rules let any area import company/, so the areas that make documents share these.
"""

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from pydantic import BaseModel
from sqlalchemy import Column, Connection, Row, bindparam, delete, insert, select, update

from accountable.company import tax


class Line(BaseModel):
    """A line as a document's reply carries it, with its amount worked out, never taken from a request."""

    id: int
    product_id: int
    name: str
    description: str | None
    quantity: int
    unit_price_cents: int
    amount_cents: int


def line_reply(row: Any) -> Line:
    """A line as saved, from either area's table of lines."""
    return Line(
        id=row.id,
        product_id=row.product_id,
        name=row.name,
        description=row.description,
        quantity=row.quantity,
        unit_price_cents=row.unit_price_cents,
        amount_cents=tax.line_amount(row.quantity, row.unit_price_cents),
    )


def document_figures(rows: Sequence[Any], rate: int) -> tuple[list[Line], tax.Totals]:
    """A document's lines as its reply carries them, and the subtotal, tax and total worked out from them (B16)."""
    replies = [line_reply(row) for row in rows]
    return replies, tax.totals(replies, rate)


@dataclass(frozen=True)
class LineToSave:
    """A line as it'll be saved: one already on the document, with its id, or a new one, with none yet.

    What a new line starts from is each area's own rule: a quote takes what the request sends, and
    an invoice its product's price and description unless they're sent (Q13, V6).
    """

    id: int | None
    product_id: int
    name: str
    description: str | None
    quantity: int
    unit_price_cents: int

    @classmethod
    def saved(cls, row: Any) -> "LineToSave":
        """A line as it's saved now, kept as it is."""
        return cls(row.id, row.product_id, row.name, row.description, row.quantity, row.unit_price_cents)

    def written(self) -> tuple:
        return (self.id, self.product_id, self.name, self.description, self.quantity, self.unit_price_cents)


def lines_of(conn: Connection, document: Column, document_id: int) -> list[Row]:
    """A document's lines, in their order. document is the lines table's column naming the quote or invoice."""
    table = document.table
    return list(conn.execute(select(table).where(document == document_id).order_by(table.c.position)))


def same_lines(saved: Sequence[Row], lines: Sequence[LineToSave]) -> bool:
    """Whether saving these lines would leave them as they are, so the save isn't a change (U10)."""
    return [LineToSave.saved(row).written() for row in saved] == [line.written() for line in lines]


def write_lines(
    conn: Connection, document: Column, document_id: int, lines: Sequence[LineToSave], now: datetime
) -> None:
    """Removes the lines left out, saves the kept ones in their new places, and adds the new ones.
    Kept lines keep their ids and names, so a form still holding them can save again.

    A table that keeps when each line last changed gets the save's own moment, for added and kept lines alike.
    """
    table = document.table
    kept = [line.id for line in lines if line.id is not None]
    conn.execute(delete(table).where(document == document_id, table.c.id.not_in(kept)))
    stamp = {"updated_at": now} if "updated_at" in table.c else {}
    placed = [
        (
            line,
            {
                "position": place,
                "description": line.description,
                "quantity": line.quantity,
                "unit_price_cents": line.unit_price_cents,
                **stamp,
            },
        )
        for place, line in enumerate(lines, start=1)
    ]
    changed = [{**values, "line_id": line.id} for line, values in placed if line.id is not None]
    if changed:
        conn.execute(update(table).where(table.c.id == bindparam("line_id")), changed)
    added = [
        {**values, document.key: document_id, "product_id": line.product_id, "name": line.name, "created_at": now}
        for line, values in placed
        if line.id is None
    ]
    if added:
        conn.execute(insert(table), added)
