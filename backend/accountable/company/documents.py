"""What the company settings give the areas that make documents, quotes and invoices: the
settings as saved, and each document's number (B15). The layout rules let any area import
company/, so these are for them.
"""

from collections.abc import Sequence
from dataclasses import dataclass
from typing import Annotated, Literal

from fastapi import Depends, Request
from sqlalchemy import Column, Connection, Row, func, insert, select, update

from accountable.company.tables import company_logo, company_settings, number_counters

DocumentKind = Literal["quote", "invoice"]

_PREFIXES = {"quote": company_settings.c.quote_prefix, "invoice": company_settings.c.invoice_prefix}
DIGITS = 4
"""A number has at least four figures, such as QT-0001, and more once it passes 9999."""

_the_row = company_settings.c.id == 1


def current_settings(conn: Connection) -> Row:
    """The settings as saved: the company's details, the tax label, the tax rate in thousandths
    of a percent as the table keeps it (B7), the payment terms, the two prefixes, and how
    documents look: the design and the accent color (B18)."""
    return conn.execute(select(company_settings).where(_the_row)).one()


def current_logo(conn: Connection) -> Row | None:
    """The logo as saved, with its bytes, type, width and height, or None. Only a document's file needs the bytes."""
    return conn.execute(
        select(company_logo.c.image, company_logo.c.media_type, company_logo.c.width, company_logo.c.height)
    ).one_or_none()


@dataclass(frozen=True)
class Taken:
    """A document's number, such as INV-0042, and its place in its kind's count, 42.

    The count gives the order the documents took their numbers in, which the number alone
    can't: a prefix may end in a digit, so INV1 then 0042 and INV then 10042 read the same.
    """

    number: str
    count: int


def take(conn: Connection, kind: DocumentKind) -> Taken:
    """The next number for a quote or an invoice, such as QT-0001: the kind's prefix as the
    settings have it now, then one more than the kind's last number, starting at 1 (B15).

    Take it inside the db.writing() that saves the document. The write lock then hands out
    numbers one at a time, so two documents can't get the same one, and a save that fails
    gives its number back with the rest of its changes, so no number is skipped.
    """
    this_kind = number_counters.c.kind == kind
    last = conn.scalar(select(number_counters.c.last_number).where(this_kind))
    count = 1 if last is None else last + 1
    if last is None:
        conn.execute(insert(number_counters).values(kind=kind, last_number=count))
    else:
        conn.execute(update(number_counters).where(this_kind).values(last_number=count))
    prefix = conn.scalar(select(_PREFIXES[kind]).where(_the_row))
    return Taken(number=f"{prefix}{count:0{DIGITS}d}", count=count)


def take_number(conn: Connection, kind: DocumentKind) -> str:
    """The next number alone, as take() gives it."""
    return take(conn, kind).number


@dataclass(frozen=True)
class Numbered:
    """Where one kind of document keeps the numbers it has taken, such as the quotes' number column.

    Each area that numbers its documents says where, and main.py puts every area's on the app,
    so the settings can check a new prefix against them without naming the areas (B6).
    """

    kind: DocumentKind
    number: Column


def app_numbered(request: Request) -> Sequence[Numbered]:
    """Every area's numbered documents, which main.py puts on the app. Tests can stand in for them."""
    return request.app.state.numbered


AppNumbered = Annotated[Sequence[Numbered], Depends(app_numbered)]


def number_starting_with(conn: Connection, numbered: Sequence[Numbered], kind: DocumentKind, prefix: str) -> str | None:
    """The first number of this kind that starts with the prefix, ignoring capitals, or None (B6)."""
    for documents in (each for each in numbered if each.kind == kind):
        number = documents.number
        found = conn.scalar(
            select(number)
            .where(func.lower(number).startswith(prefix.lower(), autoescape=True))
            .order_by(number)
            .limit(1)
        )
        if found is not None:
            return found
    return None
