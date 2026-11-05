"""The counters that number quotes and invoices (B15): one row for each kind of document,
added when it takes its first number.

It adds no rows, so on a database that already exists, as on a new one, each count starts
at 1. On Postgres, the table gets row-level security with no policies, like every other.

Revision ID: 0006
Revises: 0005
"""

import sqlalchemy as sa
from alembic import op

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "number_counters",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("kind", sa.Text(), nullable=False),
        sa.Column("last_number", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_number_counters")),
        sqlite_autoincrement=True,
    )
    op.create_index("ix_number_counters_kind", "number_counters", ["kind"], unique=True)

    if op.get_context().dialect.name == "postgresql":
        op.execute("ALTER TABLE number_counters ENABLE ROW LEVEL SECURITY")


def downgrade() -> None:
    op.drop_index("ix_number_counters_kind", table_name="number_counters")
    op.drop_table("number_counters")
