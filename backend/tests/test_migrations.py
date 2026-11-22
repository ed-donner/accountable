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


def test_table_rebuild_in_a_migration_keeps_linked_rows(engine):
    """RV6: a batch rebuild of a parent table must not fire ON DELETE on its children."""
    from alembic.operations import Operations
    from sqlalchemy import Column, Integer

    from app.db import foreign_keys_off

    seed(engine, TODAY)
    tables = [contacts, deals, activities, stage_changes]
    with engine.connect() as conn:
        before = {t.name: conn.scalar(select(func.count()).select_from(t)) for t in tables}
        linked = conn.scalar(select(func.count()).select_from(contacts).where(contacts.c.organization_id.is_not(None)))
    with foreign_keys_off(engine) as conn:
        with conn.begin():
            ops = Operations(MigrationContext.configure(conn))
            for parent in ("organizations", "contacts", "deals"):
                with ops.batch_alter_table(parent, recreate="always") as batch:
                    batch.add_column(Column("rv6_probe", Integer))
    with engine.connect() as conn:
        after = {t.name: conn.scalar(select(func.count()).select_from(t)) for t in tables}
        still_linked = conn.scalar(
            select(func.count()).select_from(contacts).where(contacts.c.organization_id.is_not(None))
        )
        assert conn.exec_driver_sql("PRAGMA foreign_keys").scalar() == 1
    assert after == before
    assert still_linked == linked > 0


# --- RV6 around every way migrations run ---------------------------------------


def _pooled_foreign_keys(engine) -> list[int]:
    """Foreign keys on each of several connections, so a reused pooled one is included."""
    connections = [engine.connect() for _ in range(3)]
    try:
        return [c.exec_driver_sql("PRAGMA foreign_keys").scalar() for c in connections]
    finally:
        for c in connections:
            c.close()


def test_foreign_keys_are_back_on_after_migrating(engine):
    """The connection migrations used goes back to the pool; it must enforce links again."""
    seed(engine, TODAY)
    migrate(engine)
    assert _pooled_foreign_keys(engine) == [1, 1, 1]
    with engine.begin() as conn:
        deal_id = conn.scalar(select(deals.c.id).limit(1))
        assert conn.scalar(select(func.count()).where(activities.c.deal_id == deal_id)) > 0
        conn.execute(deals.delete().where(deals.c.id == deal_id))
        # D10: the cascade still runs after a migration.
        assert conn.scalar(select(func.count()).where(activities.c.deal_id == deal_id)) == 0
        assert conn.scalar(select(func.count()).where(stage_changes.c.deal_id == deal_id)) == 0


def test_a_migration_that_breaks_links_is_stopped_and_foreign_keys_come_back(engine):
    import pytest

    from app.db import foreign_keys_off

    seed(engine, TODAY)
    with pytest.raises(RuntimeError, match="broken links"):
        with foreign_keys_off(engine) as conn:
            with conn.begin():
                conn.exec_driver_sql("UPDATE contacts SET organization_id = 999999 WHERE id = 1")
    assert _pooled_foreign_keys(engine) == [1, 1, 1]


def test_a_failed_migration_still_turns_foreign_keys_back_on(engine):
    import pytest

    from app.db import foreign_keys_off

    with pytest.raises(ZeroDivisionError):
        with foreign_keys_off(engine):
            1 / 0
    assert _pooled_foreign_keys(engine) == [1, 1, 1]


def test_command_line_upgrade_keeps_data_and_foreign_keys(engine, db_path):
    """`alembic upgrade head` from a terminal takes the other branch of env.py."""
    from alembic import command
    from alembic.config import Config

    from app.config import REPO_ROOT

    seed(engine, TODAY)
    tables = [organizations, contacts, deals, activities, stage_changes]
    with engine.connect() as conn:
        before = {t.name: conn.scalar(select(func.count()).select_from(t)) for t in tables}
    command.upgrade(Config(str(REPO_ROOT / "alembic.ini")), "head")
    with engine.connect() as conn:
        after = {t.name: conn.scalar(select(func.count()).select_from(t)) for t in tables}
    assert after == before
    assert _pooled_foreign_keys(engine) == [1, 1, 1]
