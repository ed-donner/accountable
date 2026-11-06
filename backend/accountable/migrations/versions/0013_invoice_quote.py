"""The quote an invoice was made from (V33 to V38): invoices.quote_id, with a foreign key to quotes and a
unique index, so a quote has at most one invoice, however two requests meet (V37).

Invoices already there keep it blank. Nothing records which quote an old invoice came from, since its
lines were typed or chosen, so the migration links none. Both databases let a unique column hold many
blanks, so invoices that weren't made from a quote don't clash.

Revision ID: 0013
Revises: 0012
"""

import sqlalchemy as sa
from alembic import op

revision = "0013"
down_revision = "0012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Batch mode, which SQLite needs to add a foreign key. Postgres gets plain ALTER statements.
    with op.batch_alter_table("invoices", table_kwargs={"sqlite_autoincrement": True}) as batch_op:
        batch_op.add_column(sa.Column("quote_id", sa.Integer(), nullable=True))
        batch_op.create_foreign_key(op.f("fk_invoices_quote_id_quotes"), "quotes", ["quote_id"], ["id"])
        batch_op.create_index(op.f("ix_invoices_quote_id"), ["quote_id"], unique=True)


def downgrade() -> None:
    with op.batch_alter_table("invoices", table_kwargs={"sqlite_autoincrement": True}) as batch_op:
        batch_op.drop_index(op.f("ix_invoices_quote_id"))
        batch_op.drop_constraint(op.f("fk_invoices_quote_id_quotes"), type_="foreignkey")
        batch_op.drop_column("quote_id")
