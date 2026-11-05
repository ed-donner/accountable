"""The company settings: one row for the whole team (B1).

The row is added here with every setting at its default, which the table keeps as
server defaults, and nobody recorded as having changed them. So a database that
already exists, such as the team's, never gets the sample company (B13). A new
database gets that from the sample data instead.

Revision ID: 0005
Revises: 0004
"""

from datetime import UTC, datetime

import sqlalchemy as sa
from alembic import op

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "company_settings",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("company_name", sa.Text(), nullable=True),
        sa.Column("address", sa.Text(), nullable=True),
        sa.Column("email", sa.Text(), nullable=True),
        sa.Column("phone", sa.Text(), nullable=True),
        sa.Column("tax_label", sa.Text(), server_default="Sales tax", nullable=True),
        sa.Column("tax_rate", sa.Integer(), server_default="0", nullable=False),
        sa.Column("payment_terms_days", sa.Integer(), server_default="30", nullable=False),
        sa.Column("quote_prefix", sa.Text(), server_default="QT-", nullable=False),
        sa.Column("invoice_prefix", sa.Text(), server_default="INV-", nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("updated_by", sa.Text(), nullable=True),
        sa.CheckConstraint(sa.column("id") == 1, name=op.f("ck_company_settings_one_row")),
        sa.ForeignKeyConstraint(["updated_by"], ["users.id"], name=op.f("fk_company_settings_updated_by_users")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_company_settings")),
        sqlite_autoincrement=True,
    )
    op.create_index(op.f("ix_company_settings_updated_by"), "company_settings", ["updated_by"], unique=False)

    now = datetime.now(UTC).replace(tzinfo=None)
    the_row = sa.table(
        "company_settings",
        sa.column("id", sa.Integer()),
        sa.column("created_at", sa.DateTime()),
        sa.column("updated_at", sa.DateTime()),
    )
    op.bulk_insert(the_row, [{"id": 1, "created_at": now, "updated_at": now}])

    if op.get_context().dialect.name == "postgresql":
        op.execute("ALTER TABLE company_settings ENABLE ROW LEVEL SECURITY")


def downgrade() -> None:
    op.drop_index(op.f("ix_company_settings_updated_by"), table_name="company_settings")
    op.drop_table("company_settings")
