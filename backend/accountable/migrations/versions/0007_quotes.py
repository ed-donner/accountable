"""Quotes and their lines (Q5 to Q37).

It adds no rows. Sample quotes only go into a new database, or come from npm run seed (M1),
so an existing database starts with an empty Quotes section and the quotes' count at 1.

A quote's deal_id has no delete rule, so a deal with quotes can't be deleted (D4), and a
partial unique index keeps a deal to one accepted quote (Q23). On Postgres, both tables get
row-level security with no policies, like every other.

Revision ID: 0007
Revises: 0006
"""

import sqlalchemy as sa
from alembic import op

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None

_accepted = sa.column("status") == "accepted"


def upgrade() -> None:
    op.create_table(
        "quotes",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("number", sa.Text(), nullable=False),
        sa.Column("deal_id", sa.Integer(), nullable=False),
        sa.Column("status", sa.Text(), nullable=False),
        sa.Column("quote_date", sa.Date(), nullable=False),
        sa.Column("valid_until", sa.Date(), nullable=False),
        sa.Column("subtotal_cents", sa.BigInteger(), nullable=False),
        sa.Column("company_name", sa.Text(), nullable=True),
        sa.Column("company_address", sa.Text(), nullable=True),
        sa.Column("company_email", sa.Text(), nullable=True),
        sa.Column("company_phone", sa.Text(), nullable=True),
        sa.Column("tax_label", sa.Text(), nullable=True),
        sa.Column("tax_rate", sa.Integer(), nullable=True),
        sa.Column("prepared_for_organization", sa.Text(), nullable=True),
        sa.Column("prepared_for_contact", sa.Text(), nullable=True),
        sa.Column("prepared_for_email", sa.Text(), nullable=True),
        sa.Column("sent_on", sa.Date(), nullable=True),
        sa.Column("decided_on", sa.Date(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("created_by", sa.Text(), nullable=True),
        sa.Column("updated_by", sa.Text(), nullable=True),
        sa.CheckConstraint(
            sa.column("status").in_(["draft", "sent", "accepted", "declined"]), name=op.f("ck_quotes_status")
        ),
        sa.ForeignKeyConstraint(["deal_id"], ["deals.id"], name=op.f("fk_quotes_deal_id_deals")),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], name=op.f("fk_quotes_created_by_users")),
        sa.ForeignKeyConstraint(["updated_by"], ["users.id"], name=op.f("fk_quotes_updated_by_users")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_quotes")),
        sqlite_autoincrement=True,
    )
    op.create_index(op.f("ix_quotes_deal_id"), "quotes", ["deal_id"], unique=False)
    op.create_index(op.f("ix_quotes_created_by"), "quotes", ["created_by"], unique=False)
    op.create_index(op.f("ix_quotes_updated_by"), "quotes", ["updated_by"], unique=False)
    op.create_index(
        "ix_quotes_one_accepted_per_deal",
        "quotes",
        ["deal_id"],
        unique=True,
        sqlite_where=_accepted,
        postgresql_where=_accepted,
    )

    op.create_table(
        "quote_lines",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("quote_id", sa.Integer(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("product_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("unit_price_cents", sa.BigInteger(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["quote_id"], ["quotes.id"], name=op.f("fk_quote_lines_quote_id_quotes"), ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["product_id"], ["products.id"], name=op.f("fk_quote_lines_product_id_products")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_quote_lines")),
        sqlite_autoincrement=True,
    )
    op.create_index(op.f("ix_quote_lines_quote_id"), "quote_lines", ["quote_id"], unique=False)
    op.create_index(op.f("ix_quote_lines_product_id"), "quote_lines", ["product_id"], unique=False)
    op.create_index("ix_quote_lines_quote_id_position", "quote_lines", ["quote_id", "position"], unique=False)

    if op.get_context().dialect.name == "postgresql":
        op.execute("ALTER TABLE quotes ENABLE ROW LEVEL SECURITY")
        op.execute("ALTER TABLE quote_lines ENABLE ROW LEVEL SECURITY")


def downgrade() -> None:
    op.drop_table("quote_lines")
    op.drop_table("quotes")
