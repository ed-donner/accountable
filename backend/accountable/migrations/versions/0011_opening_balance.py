"""The opening balance the dashboard's cash flow counts from (B23, Y9): an amount in whole
cents and the day it's as of, both blank in every database that already exists, so the
team's settings start with no opening balance (B13).

A check keeps the two both blank or both set. Adding a check makes SQLite rebuild the table,
with the one row, who last changed it and its ids kept as they were. No table is added, so
row-level security is as it was.

Revision ID: 0011
Revises: 0010
"""

import sqlalchemy as sa
from alembic import op

revision = "0011"
down_revision = "0010"
branch_labels = None
depends_on = None

TOGETHER = "ck_company_settings_opening_balance_together"


def upgrade() -> None:
    # The rebuild has to be told again to keep the table's ids, as 0003's are.
    with op.batch_alter_table("company_settings", table_kwargs={"sqlite_autoincrement": True}) as batch_op:
        batch_op.add_column(sa.Column("opening_balance_cents", sa.BigInteger(), nullable=True))
        batch_op.add_column(sa.Column("opening_balance_on", sa.Date(), nullable=True))
        batch_op.create_check_constraint(
            op.f(TOGETHER),
            sa.column("opening_balance_cents").is_(None) == sa.column("opening_balance_on").is_(None),
        )


def downgrade() -> None:
    with op.batch_alter_table("company_settings", table_kwargs={"sqlite_autoincrement": True}) as batch_op:
        batch_op.drop_constraint(op.f(TOGETHER), type_="check")
        batch_op.drop_column("opening_balance_on")
        batch_op.drop_column("opening_balance_cents")
