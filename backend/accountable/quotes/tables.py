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
    column,
)

from accountable import who
from accountable.crm.tables import deals
from accountable.db import TABLE_OPTIONS, metadata, utc_now
from accountable.holds import Hold
from accountable.products.tables import products

# Expired isn't among them: it's how a sent quote past its valid-until date shows, never saved (Q7).
STATUSES = ("draft", "sent", "accepted", "declined")

_accepted = column("status") == "accepted"

quotes = Table(
    "quotes",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("number", Text, nullable=False),
    # No delete rule, so the quote holds its deal, and the database refuses the delete too (D4, Q27).
    Column("deal_id", ForeignKey(deals.c.id), nullable=False, index=True),
    Column("status", Text, nullable=False, default="draft"),
    Column("quote_date", Date, nullable=False),
    Column("valid_until", Date, nullable=False),
    Column("subtotal_cents", BigInteger, nullable=False),
    # The company's details, the tax and Prepared for, fixed when the quote is sent or declined
    # as a draft. Blank on a draft, which follows the settings and its deal (Q17, Q18, Q30).
    Column("company_name", Text),
    Column("company_address", Text),
    Column("company_email", Text),
    Column("company_phone", Text),
    Column("tax_label", Text),
    # Thousandths of a percent, as the settings keep it (B7).
    Column("tax_rate", Integer),
    Column("prepared_for_organization", Text),
    Column("prepared_for_contact", Text),
    Column("prepared_for_email", Text),
    Column("sent_on", Date),
    Column("decided_on", Date),
    *who.columns(),
    CheckConstraint(column("status").in_(STATUSES), name="status"),
    # A deal has at most one accepted quote, however two accepts meet (Q23).
    Index(
        "ix_quotes_one_accepted_per_deal", "deal_id", unique=True, sqlite_where=_accepted, postgresql_where=_accepted
    ),
    **TABLE_OPTIONS,
)

quote_lines = Table(
    "quote_lines",
    metadata,
    Column("id", Integer, primary_key=True),
    # Deleted with the quote, which only npm run seed and npm run empty do (Q26).
    Column("quote_id", ForeignKey(quotes.c.id, ondelete="CASCADE"), nullable=False, index=True),
    Column("position", Integer, nullable=False),
    # Products are archived, never deleted, so this needs no delete rule.
    Column("product_id", ForeignKey(products.c.id), nullable=False, index=True),
    # The product's name when the line was added, never the request's (Q13).
    Column("name", Text, nullable=False),
    Column("description", Text),
    Column("quantity", Integer, nullable=False),
    Column("unit_price_cents", BigInteger, nullable=False),
    Column("created_at", DateTime, nullable=False, default=utc_now),
    Column("updated_at", DateTime, nullable=False, default=utc_now, onupdate=utc_now),
    Index("ix_quote_lines_quote_id_position", "quote_id", "position"),
    **TABLE_OPTIONS,
)

# The quotes, which npm run seed and npm run empty count before they delete them (C4). Lines go
# with their quotes, so they aren't counted on their own.
RECORDS = (quotes,)

# A quote holds its deal, so a deal with quotes can't be deleted (D4).
HOLDS = (Hold(quotes.c.deal_id, "quote"),)
