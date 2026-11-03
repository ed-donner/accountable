"""The people who sign in, who added and last changed each record, and row-level security.

Records from before sign-in keep a blank created_by and updated_by (U12). Deal
values become 64-bit, since Postgres's integer stops at about $2.1 billion.

On Postgres, every table gets row-level security with no policies, which shuts
Supabase's Data API out of every row. SQLAlchemy has no way to say this, so it's
the one raw SQL in the app.

Revision ID: 0003
Revises: 0002
"""

from contextlib import AbstractContextManager

import sqlalchemy as sa
from alembic import op
from alembic.operations import BatchOperations

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None

RECORDS = ["organizations", "contacts", "deals", "activities"]
EVERY_TABLE = ["alembic_version", "users", *RECORDS, "stage_changes"]


def altering(table: str) -> AbstractContextManager[BatchOperations]:
    # SQLite rebuilds the table to add a foreign key, and has to be told again to keep its ids.
    return op.batch_alter_table(table, table_kwargs={"sqlite_autoincrement": True})


def add_who(batch_op: BatchOperations, table: str, name: str) -> None:
    batch_op.add_column(sa.Column(name, sa.Text(), nullable=True))
    batch_op.create_foreign_key(batch_op.f(f"fk_{table}_{name}_users"), "users", [name], ["id"])
    batch_op.create_index(batch_op.f(f"ix_{table}_{name}"), [name], unique=False)


def drop_who(batch_op: BatchOperations, table: str, name: str) -> None:
    batch_op.drop_index(batch_op.f(f"ix_{table}_{name}"))
    batch_op.drop_constraint(batch_op.f(f"fk_{table}_{name}_users"), type_="foreignkey")
    batch_op.drop_column(name)


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Text(), nullable=False),
        sa.Column("name", sa.Text(), nullable=True),
        sa.Column("email", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_users")),
    )
    for table in RECORDS:
        with altering(table) as batch_op:
            add_who(batch_op, table, "created_by")
            add_who(batch_op, table, "updated_by")
            if table == "deals":
                batch_op.alter_column(
                    "value", existing_type=sa.Integer(), type_=sa.BigInteger(), existing_nullable=False
                )
    with altering("stage_changes") as batch_op:
        add_who(batch_op, "stage_changes", "created_by")

    if op.get_context().dialect.name == "postgresql":
        for table in EVERY_TABLE:
            op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")


def downgrade() -> None:
    # Row-level security stays on, because turning it off would open the tables to the Data API.
    with altering("stage_changes") as batch_op:
        drop_who(batch_op, "stage_changes", "created_by")
    for table in reversed(RECORDS):
        with altering(table) as batch_op:
            if table == "deals":
                batch_op.alter_column(
                    "value", existing_type=sa.BigInteger(), type_=sa.Integer(), existing_nullable=False
                )
            drop_who(batch_op, table, "updated_by")
            drop_who(batch_op, table, "created_by")
    op.drop_table("users")
