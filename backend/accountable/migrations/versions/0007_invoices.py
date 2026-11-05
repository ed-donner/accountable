"""Invoices and payments (V1 to V31), and how invoices look in the company settings (B18 to B22).

The design and accent color come with server defaults, so a database that already exists
gets the Classic design in Midnight, and no logo (B13). The new tables start empty, so an
existing database gets an empty Invoices section (M1).

On Postgres, the four new tables get row-level security with no policies, like every other.

Revision ID: 0007
Revises: 0006
"""

import sqlalchemy as sa
from alembic import op

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None

NEW_TABLES = ["company_logo", "invoices", "invoice_lines", "payments"]


def upgrade() -> None:
    # Adding a column with a constant default needs no rebuild, on SQLite either.
    with op.batch_alter_table("company_settings") as batch_op:
        batch_op.add_column(sa.Column("invoice_design", sa.Text(), server_default="classic", nullable=False))
        batch_op.add_column(sa.Column("accent_color", sa.Text(), server_default="#073B4C", nullable=False))

    op.create_table(
        "company_logo",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("image", sa.LargeBinary(), nullable=False),
        sa.Column("media_type", sa.Text(), nullable=False),
        sa.Column("width", sa.Integer(), nullable=False),
        sa.Column("height", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint(sa.column("id") == 1, name=op.f("ck_company_logo_one_row")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_company_logo")),
        sqlite_autoincrement=True,
    )

    _create_invoices()
    _create_invoice_lines()
    _create_payments()

    if op.get_context().dialect.name == "postgresql":
        for table in NEW_TABLES:
            op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")


def _create_invoices() -> None:
    op.create_table(
        "invoices",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("deal_id", sa.Integer(), nullable=False),
        sa.Column("organization_id", sa.Integer(), nullable=True),
        sa.Column("status", sa.Text(), nullable=False),
        sa.Column("number", sa.Text(), nullable=True),
        sa.Column("bill_to", sa.Text(), nullable=True),
        sa.Column("issue_date", sa.Date(), nullable=True),
        sa.Column("due_date", sa.Date(), nullable=True),
        sa.Column("company_name", sa.Text(), nullable=True),
        sa.Column("company_address", sa.Text(), nullable=True),
        sa.Column("company_email", sa.Text(), nullable=True),
        sa.Column("company_phone", sa.Text(), nullable=True),
        sa.Column("tax_label", sa.Text(), nullable=True),
        sa.Column("tax_rate", sa.Integer(), nullable=True),
        sa.Column("subtotal_cents", sa.BigInteger(), nullable=True),
        sa.Column("tax_cents", sa.BigInteger(), nullable=True),
        sa.Column("total_cents", sa.BigInteger(), nullable=True),
        sa.Column("issued_by", sa.Text(), nullable=True),
        sa.Column("voided_by", sa.Text(), nullable=True),
        sa.Column("voided_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("created_by", sa.Text(), nullable=True),
        sa.Column("updated_by", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["deal_id"], ["deals.id"], name=op.f("fk_invoices_deal_id_deals")),
        sa.ForeignKeyConstraint(
            ["organization_id"], ["organizations.id"], name=op.f("fk_invoices_organization_id_organizations")
        ),
        sa.ForeignKeyConstraint(["issued_by"], ["users.id"], name=op.f("fk_invoices_issued_by_users")),
        sa.ForeignKeyConstraint(["voided_by"], ["users.id"], name=op.f("fk_invoices_voided_by_users")),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], name=op.f("fk_invoices_created_by_users")),
        sa.ForeignKeyConstraint(["updated_by"], ["users.id"], name=op.f("fk_invoices_updated_by_users")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_invoices")),
        sqlite_autoincrement=True,
    )
    for column in ("deal_id", "organization_id", "due_date", "issued_by", "voided_by", "created_by", "updated_by"):
        op.create_index(op.f(f"ix_invoices_{column}"), "invoices", [column], unique=False)
    op.create_index("ix_invoices_number", "invoices", ["number"], unique=True)


def _create_invoice_lines() -> None:
    op.create_table(
        "invoice_lines",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("invoice_id", sa.Integer(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("product_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("unit_price_cents", sa.BigInteger(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["invoice_id"], ["invoices.id"], name=op.f("fk_invoice_lines_invoice_id_invoices"), ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["product_id"], ["products.id"], name=op.f("fk_invoice_lines_product_id_products")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_invoice_lines")),
        sqlite_autoincrement=True,
    )
    for column in ("invoice_id", "product_id"):
        op.create_index(op.f(f"ix_invoice_lines_{column}"), "invoice_lines", [column], unique=False)


def _create_payments() -> None:
    op.create_table(
        "payments",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("invoice_id", sa.Integer(), nullable=False),
        sa.Column("paid_on", sa.Date(), nullable=False),
        sa.Column("amount_cents", sa.BigInteger(), nullable=False),
        sa.Column("method", sa.Text(), nullable=False),
        sa.Column("reference", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("created_by", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["invoice_id"], ["invoices.id"], name=op.f("fk_payments_invoice_id_invoices")),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], name=op.f("fk_payments_created_by_users")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_payments")),
        sqlite_autoincrement=True,
    )
    for column in ("invoice_id", "paid_on", "created_by"):
        op.create_index(op.f(f"ix_payments_{column}"), "payments", [column], unique=False)


def downgrade() -> None:
    # Row-level security goes with the tables. The settings table keeps its own.
    op.drop_table("payments")
    op.drop_table("invoice_lines")
    op.drop_table("invoices")
    op.drop_table("company_logo")
    with op.batch_alter_table("company_settings") as batch_op:
        batch_op.drop_column("accent_color")
        batch_op.drop_column("invoice_design")
