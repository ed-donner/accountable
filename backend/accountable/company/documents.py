"""What the company settings give the areas that make documents, quotes and invoices: the
settings as saved, and each document's number (B15). The layout rules let any area import
company/, so these are for them.
"""

from typing import Literal

from sqlalchemy import Connection, Row, insert, select, update

from accountable.company.tables import company_settings, number_counters

DocumentKind = Literal["quote", "invoice"]

_PREFIXES = {"quote": company_settings.c.quote_prefix, "invoice": company_settings.c.invoice_prefix}
DIGITS = 4
"""A number has at least four figures, such as QT-0001, and more once it passes 9999."""

_the_row = company_settings.c.id == 1


def current_settings(conn: Connection) -> Row:
    """The settings as saved: the company's details, the tax label, the tax rate in thousandths
    of a percent as the table keeps it (B7), the payment terms and the two prefixes."""
    return conn.execute(select(company_settings).where(_the_row)).one()


def take_number(conn: Connection, kind: DocumentKind) -> str:
    """The next number for a quote or an invoice, such as QT-0001: the kind's prefix as the
    settings have it now, then one more than the kind's last number, starting at 1 (B15).

    Take it inside the db.writing() that saves the document. The write lock then hands out
    numbers one at a time, so two documents can't get the same one, and a save that fails
    gives its number back with the rest of its changes, so no number is skipped.
    """
    this_kind = number_counters.c.kind == kind
    last = conn.scalar(select(number_counters.c.last_number).where(this_kind))
    number = 1 if last is None else last + 1
    if last is None:
        conn.execute(insert(number_counters).values(kind=kind, last_number=number))
    else:
        conn.execute(update(number_counters).where(this_kind).values(last_number=number))
    prefix = conn.scalar(select(_PREFIXES[kind]).where(_the_row))
    return f"{prefix}{number:0{DIGITS}d}"
