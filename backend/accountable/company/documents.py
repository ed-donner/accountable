"""What the company settings give the areas that make documents, quotes and invoices: the
settings as saved, the company's details as a document shows them, and each document's number
(B15). The layout rules let any area import company/, so these are for them.
"""

from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any, Literal

from pydantic import BaseModel
from sqlalchemy import Connection, Row, insert, select, update

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


class Company(BaseModel):
    """The company's details on a quote or an invoice: fixed on it once it's sent, declined or
    issued, or the settings' as they are now on a draft (Q30, V11)."""

    name: str | None
    address: str | None
    email: str | None
    phone: str | None


def details_now(settings: Row) -> dict[str, Any]:
    """The company's details and the tax as the settings have them, named as the columns a quote
    or an invoice fixes them in when it's sent or issued."""
    return {
        "company_name": settings.company_name,
        "company_address": settings.address,
        "company_email": settings.email,
        "company_phone": settings.phone,
        "tax_label": settings.tax_label,
        "tax_rate": settings.tax_rate,
    }


def company_in(details: Mapping[str, Any]) -> Company:
    """The company as a document shows it, from the columns it fixed them in or from details_now()."""
    return Company(
        name=details["company_name"],
        address=details["company_address"],
        email=details["company_email"],
        phone=details["company_phone"],
    )


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
