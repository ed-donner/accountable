import unicodedata

from sqlalchemy import BigInteger, CheckConstraint, Column, Date, ForeignKey, Index, Integer, Table, Text, column

from accountable import who
from accountable.crm.tables import organizations
from accountable.db import TABLE_OPTIONS, metadata
from accountable.holds import Hold

# In the order every list, chart and legend shows them (E6).
CATEGORIES = ("software", "contractors", "travel", "office", "marketing", "other")

bills = Table(
    "bills",
    metadata,
    Column("id", Integer, primary_key=True),
    # The supplier. No delete rule, so the database refuses to delete an organization with bills (D4).
    Column("organization_id", ForeignKey(organizations.c.id), nullable=False, index=True),
    Column("bill_number", Text, nullable=False),
    # Set from the bill number on every save. Its unique index keeps each supplier's numbers apart (E3).
    Column("bill_number_key", Text, nullable=False),
    Column("bill_date", Date, nullable=False, index=True),
    Column("due_date", Date, nullable=False, index=True),
    Column("amount_cents", BigInteger, nullable=False),
    Column("tax_cents", BigInteger, nullable=False, default=0),
    Column("category", Text, nullable=False),
    Column("notes", Text),
    # Blank while the bill is unpaid. Overdue isn't kept, because it changes with the day (E8).
    Column("paid_on", Date),
    *who.columns(),
    CheckConstraint(column("category").in_(CATEGORIES), name="category"),
    Index("ix_bills_supplier_number", "organization_id", "bill_number_key", unique=True),
    **TABLE_OPTIONS,
)

# A bill holds its supplier, so an organization with bills can't be deleted (D4).
HOLDS = (Hold(bills.c.organization_id, "bill"),)

# The bills, which npm run seed and npm run empty count before they delete them (C4).
RECORDS = (bills,)


def bill_number_key(number: str) -> str:
    """The number with its case taken out in any language, so "INV-0042" clashes with
    "inv-0042" from the same supplier (E3), as a product's name_key does. Normalized as
    well, so an accented letter typed as one character clashes with the same letter
    typed as a letter and an accent."""
    return unicodedata.normalize("NFC", number.casefold())
