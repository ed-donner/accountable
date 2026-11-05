"""Bills from suppliers (E1): the bills table, with a unique index on each supplier's
bill numbers (E3), and a supplier that holds its organization (D4).

It adds no rows. Sample bills and their suppliers only go into a new database, or come
from npm run seed (M1), so an existing database starts with an empty Bills section.

On Postgres, the table gets row-level security with no policies, like every other.

Revision ID: 0007
Revises: 0006
"""

import sqlalchemy as sa
from alembic import op

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None

# Written out rather than imported, so this migration builds the same table whatever the app later says.
CATEGORIES = ("software", "contractors", "travel", "office", "marketing", "other")


def upgrade() -> None:
    op.create_table(
        "bills",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("organization_id", sa.Integer(), nullable=False),
        sa.Column("bill_number", sa.Text(), nullable=False),
        sa.Column("bill_number_key", sa.Text(), nullable=False),
        sa.Column("bill_date", sa.Date(), nullable=False),
        sa.Column("due_date", sa.Date(), nullable=False),
        sa.Column("amount_cents", sa.BigInteger(), nullable=False),
        sa.Column("tax_cents", sa.BigInteger(), nullable=False),
        sa.Column("category", sa.Text(), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("paid_on", sa.Date(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("created_by", sa.Text(), nullable=True),
        sa.Column("updated_by", sa.Text(), nullable=True),
        sa.CheckConstraint(sa.column("category").in_(CATEGORIES), name=op.f("ck_bills_category")),
        sa.ForeignKeyConstraint(
            ["organization_id"], ["organizations.id"], name=op.f("fk_bills_organization_id_organizations")
        ),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], name=op.f("fk_bills_created_by_users")),
        sa.ForeignKeyConstraint(["updated_by"], ["users.id"], name=op.f("fk_bills_updated_by_users")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_bills")),
        sqlite_autoincrement=True,
    )
    for name in ("organization_id", "bill_date", "due_date", "created_by", "updated_by"):
        op.create_index(op.f(f"ix_bills_{name}"), "bills", [name], unique=False)
    op.create_index("ix_bills_supplier_number", "bills", ["organization_id", "bill_number_key"], unique=True)

    if op.get_context().dialect.name == "postgresql":
        op.execute("ALTER TABLE bills ENABLE ROW LEVEL SECURITY")


def downgrade() -> None:
    op.drop_table("bills")
