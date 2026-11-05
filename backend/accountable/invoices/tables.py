"""The invoices area's tables: invoices, their lines and the payments against them."""

from sqlalchemy import BigInteger, Column, Date, DateTime, ForeignKey, Index, Integer, Table, Text

from accountable import who
from accountable.company.documents import Numbered
from accountable.crm.tables import deals, organizations
from accountable.db import TABLE_OPTIONS, metadata, utc_now
from accountable.holds import Hold
from accountable.products.tables import products
from accountable.users import users

# Paid, overdue and part paid are worked out, never kept (V3).
DRAFT, ISSUED, VOID = "draft", "issued", "void"

# The deal and the organization have no delete rule: an invoice holds them (D4, V21), so
# the database refuses their delete too, should one ever get past the route's check.
invoices = Table(
    "invoices",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("deal_id", ForeignKey(deals.c.id), nullable=False, index=True),
    # The organization it was issued to, set on issuing. Blank on a draft.
    Column("organization_id", ForeignKey(organizations.c.id), index=True),
    Column("status", Text, nullable=False, default=DRAFT),
    # Set on issuing (B15). Both databases let a unique column hold many blanks, so drafts don't clash.
    Column("number", Text),
    # The count the number took on issuing, so Number sorts in the order issued, whatever the prefix (V22).
    Column("issue_order", Integer),
    Column("bill_to", Text),
    Column("issue_date", Date),
    Column("due_date", Date, index=True),
    # Copies of the company settings and the figures, made on issuing (V11). Blank on a draft.
    Column("company_name", Text),
    Column("company_address", Text),
    Column("company_email", Text),
    Column("company_phone", Text),
    Column("tax_label", Text),
    # Thousandths of a percent, as company_settings keeps it.
    Column("tax_rate", Integer),
    Column("subtotal_cents", BigInteger),
    Column("tax_cents", BigInteger),
    Column("total_cents", BigInteger),
    Column("issued_by", ForeignKey(users.c.id), index=True),
    Column("voided_by", ForeignKey(users.c.id), index=True),
    Column("voided_at", DateTime),
    *who.columns(),
    Index("ix_invoices_number", "number", unique=True),
    **TABLE_OPTIONS,
)

# A line changes only with its invoice, which only a draft can be, so it has no updated_at.
invoice_lines = Table(
    "invoice_lines",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("invoice_id", ForeignKey(invoices.c.id, ondelete="CASCADE"), nullable=False, index=True),
    Column("position", Integer, nullable=False),
    # Products are never deleted, so this never needs blanking.
    Column("product_id", ForeignKey(products.c.id), nullable=False, index=True),
    # The product's name when the line was added (V6).
    Column("name", Text, nullable=False),
    Column("description", Text),
    Column("quantity", Integer, nullable=False),
    Column("unit_price_cents", BigInteger, nullable=False),
    Column("created_at", DateTime, nullable=False, default=utc_now),
    **TABLE_OPTIONS,
)

# Never edited (V17). No delete rule on the invoice: only a draft can be deleted, and a draft has none.
payments = Table(
    "payments",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("invoice_id", ForeignKey(invoices.c.id), nullable=False, index=True),
    Column("paid_on", Date, nullable=False, index=True),
    Column("amount_cents", BigInteger, nullable=False),
    Column("method", Text, nullable=False),
    Column("reference", Text),
    Column("created_at", DateTime, nullable=False, default=utc_now),
    Column("created_by", ForeignKey(users.c.id), index=True),
    **TABLE_OPTIONS,
)

# The invoices area's records, which npm run seed and npm run empty count before they delete them (C4).
# Lines go with their invoices, so they aren't counted on their own.
RECORDS = (invoices, payments)

# Every invoice holds its deal, drafts included, and an issued one the organization it was issued to (V21).
HOLDS = (Hold(invoices.c.deal_id, "invoice"), Hold(invoices.c.organization_id, "invoice"))
NUMBERED = (Numbered("invoice", invoices.c.number),)
