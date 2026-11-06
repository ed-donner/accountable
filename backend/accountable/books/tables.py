"""The books' two tables: dated entries and their lines (J3, J4). Never updated or deleted by the app (J6)."""

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    Column,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Table,
    Text,
    and_,
    column,
    or_,
)

from accountable.books.accounts import KEYS
from accountable.db import TABLE_OPTIONS, metadata, utc_now
from accountable.users import users

# What an entry is for. A bill payment is a bill's paid entry, whose source is the bill.
INVOICE, PAYMENT, BILL, BILL_PAYMENT, OPENING_BALANCE = "invoice", "payment", "bill", "bill_payment", "opening_balance"

journal_entries = Table(
    "journal_entries",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("entry_date", Date, nullable=False),
    Column("kind", Text, nullable=False),
    Column("source_id", Integer, nullable=False),
    Column("event", Text, nullable=False),
    # The page that opens the source. A deleted source keeps its address.
    Column("link", Text, nullable=False),
    # The entry this one reverses. At most one reversal per entry.
    Column("reverses_id", ForeignKey("journal_entries.id")),
    # Blank for the entries the migration posted for records that already existed (J8).
    Column("created_by", ForeignKey(users.c.id), index=True),
    Column("created_at", DateTime, nullable=False, default=utc_now),
    Index("ix_journal_entries_entry_date", "entry_date"),
    Index("ix_journal_entries_source", "kind", "source_id"),
    Index("ix_journal_entries_reverses_id", "reverses_id", unique=True),
    **TABLE_OPTIONS,
)

# No delete rule on the entry: nothing deletes an entry on its own.
journal_lines = Table(
    "journal_lines",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("entry_id", ForeignKey(journal_entries.c.id), nullable=False),
    Column("account", Text, nullable=False),
    Column("debit_cents", BigInteger, nullable=False),
    Column("credit_cents", BigInteger, nullable=False),
    Column("created_at", DateTime, nullable=False, default=utc_now),
    CheckConstraint(column("account").in_(KEYS), name="account"),
    # Exactly one of the two amounts is above 0.
    CheckConstraint(
        or_(
            and_(column("debit_cents") > 0, column("credit_cents") == 0),
            and_(column("credit_cents") > 0, column("debit_cents") == 0),
        ),
        name="one_side",
    ),
    Index("ix_journal_lines_entry_id", "entry_id"),
    Index("ix_journal_lines_account", "account"),
    **TABLE_OPTIONS,
)

# The books' records, which npm run seed and npm run empty count before they delete them (C4).
RECORDS = (journal_entries,)
