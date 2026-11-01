"""Ids are never used twice, so an old address can't open a different record.

SQLite can only turn this on by rebuilding each table. db.py runs migrations with
foreign keys off, so that dropping the old tables leaves the links to them alone.

Revision ID: 0002
Revises: 0001
"""

from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None

TABLES = ["organizations", "contacts", "deals", "activities", "stage_changes"]


def rebuild(autoincrement: bool) -> None:
    for table in TABLES:
        with op.batch_alter_table(table, recreate="always", table_kwargs={"sqlite_autoincrement": autoincrement}):
            pass


def upgrade() -> None:
    rebuild(True)


def downgrade() -> None:
    rebuild(False)
