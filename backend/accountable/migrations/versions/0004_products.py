"""The price list: the products table, with a unique index on each name's key (G2).

It adds no rows. Sample products only go into a new database, or come from npm run
seed (M1), so an existing database starts with an empty Products section.

On Postgres, the table gets row-level security with no policies, like every other.

Revision ID: 0004
Revises: 0003
"""

import sqlalchemy as sa
from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "products",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("name_key", sa.Text(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("unit_price_cents", sa.BigInteger(), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("created_by", sa.Text(), nullable=True),
        sa.Column("updated_by", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], name=op.f("fk_products_created_by_users")),
        sa.ForeignKeyConstraint(["updated_by"], ["users.id"], name=op.f("fk_products_updated_by_users")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_products")),
        sqlite_autoincrement=True,
    )
    with op.batch_alter_table("products", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_products_created_by"), ["created_by"], unique=False)
        batch_op.create_index(batch_op.f("ix_products_updated_by"), ["updated_by"], unique=False)
        batch_op.create_index("ix_products_name_key", ["name_key"], unique=True)

    if op.get_context().dialect.name == "postgresql":
        op.execute("ALTER TABLE products ENABLE ROW LEVEL SECURITY")


def downgrade() -> None:
    op.drop_table("products")
