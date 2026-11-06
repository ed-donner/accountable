from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    Column,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    LargeBinary,
    Table,
    Text,
    column,
)

from accountable.db import TABLE_OPTIONS, metadata, utc_now
from accountable.users import users

# One row, with id 1, added by the migration. Each setting's default lives in the
# table itself, so that row, and the clearing steps' DEFAULT, take them from here (B13).
company_settings = Table(
    "company_settings",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("company_name", Text),
    Column("address", Text),
    Column("email", Text),
    Column("phone", Text),
    Column("tax_label", Text, server_default="Sales tax"),
    # Thousandths of a percent, so 8.875% is 8875 and never a binary fraction (B7).
    Column("tax_rate", Integer, nullable=False, server_default="0"),
    Column("payment_terms_days", Integer, nullable=False, server_default="30"),
    Column("quote_prefix", Text, nullable=False, server_default="QT-"),
    Column("invoice_prefix", Text, nullable=False, server_default="INV-"),
    # How invoices look (B18): Classic in Midnight until someone chooses.
    Column("invoice_design", Text, nullable=False, server_default="classic"),
    Column("accent_color", Text, nullable=False, server_default="#073B4C"),
    # The cash at the start of a day, which the cash flow counts from, in whole cents and
    # below zero for an overdrawn account (B23, B24). Blank until someone enters one.
    Column("opening_balance_cents", BigInteger),
    Column("opening_balance_on", Date),
    Column("created_at", DateTime, nullable=False, default=utc_now),
    Column("updated_at", DateTime, nullable=False, default=utc_now),
    # Blank until someone saves them, and again after the clearing steps (B9).
    Column("updated_by", ForeignKey(users.c.id), index=True),
    CheckConstraint(column("id") == 1, name="one_row"),
    # An amount needs its day and a day its amount, so the cash flow never has one alone.
    CheckConstraint(
        column("opening_balance_cents").is_(None) == column("opening_balance_on").is_(None),
        name="opening_balance_together",
    ),
    **TABLE_OPTIONS,
)

# How many numbers each kind of document has taken, so the next is one more (B15). A kind's
# row is added when it takes its first number. npm run seed and npm run empty delete the
# rows, as they delete the documents, so each count starts again at 1 (C4).
number_counters = Table(
    "number_counters",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("kind", Text, nullable=False),
    Column("last_number", Integer, nullable=False),
    Column("created_at", DateTime, nullable=False, default=utc_now),
    Column("updated_at", DateTime, nullable=False, default=utc_now, onupdate=utc_now),
    Index("ix_number_counters_kind", "kind", unique=True),
    **TABLE_OPTIONS,
)

# The logo, kept apart from the settings so that reading them, which every invoice does,
# never reads the image (B22). At most one row, with id 1, and no row means no logo.
company_logo = Table(
    "company_logo",
    metadata,
    Column("id", Integer, primary_key=True),
    # The bytes as the check found them, up to 1 MB (B21).
    Column("image", LargeBinary, nullable=False),
    # From what the check found, never from the file's name or what the browser said.
    Column("media_type", Text, nullable=False),
    Column("width", Integer, nullable=False),
    Column("height", Integer, nullable=False),
    Column("created_at", DateTime, nullable=False, default=utc_now),
    Column("updated_at", DateTime, nullable=False, default=utc_now, onupdate=utc_now),
    CheckConstraint(column("id") == 1, name="one_row"),
    **TABLE_OPTIONS,
)
