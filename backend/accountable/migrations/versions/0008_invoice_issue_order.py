"""The order invoices were issued in, so the Invoices table's Number sorts that way, whatever
the prefix (V22): each issued invoice keeps the count its number took (B15).

Invoices issued before this get their places by issue date and then id, the order the
table sorted them in until now, since their numbers can't say: a prefix may end in a digit.
Drafts have none.

Revision ID: 0008
Revises: 0007
"""

import sqlalchemy as sa
from alembic import op

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Adding a column with no default needs no rebuild, on SQLite either.
    with op.batch_alter_table("invoices") as batch_op:
        batch_op.add_column(sa.Column("issue_order", sa.Integer(), nullable=True))

    invoices = sa.table(
        "invoices", sa.column("id", sa.Integer), sa.column("issue_date", sa.Date), sa.column("issue_order", sa.Integer)
    )
    earlier = invoices.alias("earlier")
    place = (
        sa.select(sa.func.count())
        .select_from(earlier)
        .where(
            sa.or_(
                earlier.c.issue_date < invoices.c.issue_date,
                sa.and_(earlier.c.issue_date == invoices.c.issue_date, earlier.c.id <= invoices.c.id),
            )
        )
        .scalar_subquery()
    )
    op.execute(invoices.update().where(invoices.c.issue_date.is_not(None)).values(issue_order=place))


def downgrade() -> None:
    with op.batch_alter_table("invoices") as batch_op:
        batch_op.drop_column("issue_order")
