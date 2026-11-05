from sqlalchemy import CheckConstraint, Column, DateTime, ForeignKey, Integer, Table, Text, column

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
    Column("created_at", DateTime, nullable=False, default=utc_now),
    Column("updated_at", DateTime, nullable=False, default=utc_now),
    # Blank until someone saves them, and again after the clearing steps (B9).
    Column("updated_by", ForeignKey(users.c.id), index=True),
    CheckConstraint(column("id") == 1, name="one_row"),
    **TABLE_OPTIONS,
)
