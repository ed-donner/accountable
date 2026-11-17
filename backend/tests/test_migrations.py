"""TB42: migrations match db.py and keep data."""

from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from sqlalchemy import func, select

from app.db import activities, contacts, deals, metadata, migrate, organizations, stage_changes
from app.seed import seed
from datetime import date

TODAY = date(2026, 11, 16)


def test_migrated_schema_matches_db_py(engine):
    with engine.connect() as conn:
        diff = compare_metadata(MigrationContext.configure(conn), metadata)
    assert diff == []


def test_upgrade_keeps_every_row(engine):
    seed(engine, TODAY)
    tables = [organizations, contacts, deals, activities, stage_changes]
    with engine.connect() as conn:
        before = {t.name: conn.scalar(select(func.count()).select_from(t)) for t in tables}
    migrate(engine)
    migrate(engine)
    with engine.connect() as conn:
        after = {t.name: conn.scalar(select(func.count()).select_from(t)) for t in tables}
    assert after == before
    assert before["deals"] == 30
