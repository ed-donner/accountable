import os
import sqlite3
from collections.abc import Iterator
from datetime import date, datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import pytest
from accountable import db, settings
from accountable.crm.tables import contacts, organizations
from sqlalchemy import func, insert, inspect, literal, null, select


def count(table) -> int:
    with db.reading() as conn:
        return conn.execute(select(func.count()).select_from(table)).scalar_one()


def add_one(conn) -> None:
    conn.execute(insert(organizations).values(name="Filled"))


@pytest.fixture
def no_database(tmp_path, monkeypatch) -> Iterator[Path]:
    path = tmp_path / "nested" / "folder" / "accountable.db"
    monkeypatch.setenv("ACCOUNTABLE_DB", str(path))
    db.dispose()
    yield path
    db.dispose()


def restart() -> None:
    db.dispose()


def test_foreign_keys_are_on_for_every_connection(database):
    connections = [db.engine().connect() for _ in range(3)]
    try:
        for connection in connections:
            raw = connection.connection.driver_connection
            assert isinstance(raw, sqlite3.Connection)
            assert raw.getconfig(sqlite3.SQLITE_DBCONFIG_ENABLE_FKEY) is True
    finally:
        for connection in connections:
            connection.close()


def test_a_new_database_fills_itself(no_database):
    assert db.prepare_database(add_one) is True
    assert no_database.exists()
    assert count(organizations) == 1


def test_an_existing_database_is_not_filled(no_database):
    db.prepare_database(add_one)
    assert db.prepare_database(add_one) is False
    assert count(organizations) == 1


def test_an_emptied_database_stays_empty_after_a_restart(no_database):
    db.prepare_database(add_one)
    with db.writing() as conn:
        conn.execute(organizations.delete())

    restart()
    db.prepare_database(add_one)

    assert count(organizations) == 0


def test_an_interrupted_first_start_leaves_no_half_built_file(no_database):
    def fail(conn):
        add_one(conn)
        raise RuntimeError("stopped partway")

    with pytest.raises(RuntimeError):
        db.prepare_database(fail)

    assert not no_database.exists()
    assert list(no_database.parent.iterdir()) == []

    assert db.prepare_database(add_one) is True
    assert count(organizations) == 1


def test_a_leftover_building_file_is_replaced(no_database):
    no_database.parent.mkdir(parents=True)
    leftover = no_database.with_name("accountable.building.db")
    leftover.write_bytes(b"half a database")

    assert db.prepare_database(add_one) is True
    assert not leftover.exists()
    assert count(organizations) == 1


def test_the_default_path_does_not_depend_on_the_current_folder(tmp_path, monkeypatch):
    monkeypatch.delenv("ACCOUNTABLE_DB")
    first = db.database_path()
    monkeypatch.chdir(tmp_path)
    assert db.database_path() == first
    assert first == db.ROOT / "data" / "accountable.db"


def test_the_setting_overrides_the_default_path(tmp_path, monkeypatch):
    monkeypatch.setenv("ACCOUNTABLE_DB", str(tmp_path / "other.db"))
    assert db.database_path() == (tmp_path / "other.db").resolve()


def test_data_survives_a_restart(no_database):
    db.prepare_database(lambda conn: None)
    with db.writing() as conn:
        conn.execute(insert(contacts).values(name="Sam Carter", status="lead"))

    restart()
    db.prepare_database(lambda conn: None)

    assert count(contacts) == 1


def test_writes_go_one_at_a_time(database):
    assert not db._write_lock.locked()
    with db.writing():
        assert db._write_lock.locked()
    assert not db._write_lock.locked()


def test_the_test_run_never_points_at_real_data():
    assert not Path(os.environ["ACCOUNTABLE_DB"]).resolve().is_relative_to((db.ROOT / "data").resolve())


def test_today_follows_the_time_zone_setting(monkeypatch):
    # 25 hours apart, so at any moment the first is a day or two ahead of the second.
    monkeypatch.setenv("TZ", "Pacific/Kiritimati")
    ahead = db.local_today()
    monkeypatch.setenv("TZ", "Pacific/Pago_Pago")
    behind = db.local_today()
    assert 1 <= (ahead - behind).days <= 2


def test_today_reads_a_zone_written_with_a_leading_colon(monkeypatch):
    monkeypatch.setenv("TZ", ":Pacific/Kiritimati")
    assert db.local_today() == datetime.now(ZoneInfo("Pacific/Kiritimati")).date()


@pytest.mark.parametrize("zone", [None, "", "Not/A_Zone", "EST+5"])
def test_without_a_zone_name_today_is_the_computers_date(monkeypatch, zone):
    if zone is None:
        monkeypatch.delenv("TZ", raising=False)
    else:
        monkeypatch.setenv("TZ", zone)
    assert db.local_today() == date.today()


def test_row_level_security_on_for_every_table_lets_the_start_go_ahead():
    db.refuse_tables_without_row_level_security({"organizations": True, "alembic_version": True})
    db.refuse_tables_without_row_level_security({})


def test_row_level_security_off_stops_the_start_naming_each_table():
    tables = {"organizations": True, "tasks": False, "notes": False, "users": True}
    with pytest.raises(db.RowLevelSecurityOff) as stopped:
        db.refuse_tables_without_row_level_security(tables)
    assert str(stopped.value) == "Row-level security is off for these tables: notes, tasks. Turn it on in a migration."


SHARED = {
    "DATABASE_URL": "postgresql://postgres.abc:password@pooler.example:5432/postgres",
    "SUPABASE_URL": "https://abc.supabase.example",
    "SUPABASE_PUBLISHABLE_KEY": "sb_publishable_abc",
}


def test_the_shared_app_uses_postgres_through_psycopg(monkeypatch):
    for name, value in SHARED.items():
        monkeypatch.setenv(name, value)
    # The dialect SQLAlchemy picks for the address, without loading psycopg itself, which takes a second.
    dialect = db.database_url().get_dialect()
    assert dialect.name == "postgresql"
    assert dialect.driver == "psycopg"


def test_the_local_copy_uses_its_sqlite_file(no_database):
    url = db.database_url()
    assert url.get_backend_name() == "sqlite"
    assert Path(str(url.database)) == no_database.resolve()


@pytest.fixture
def shared_reads(database, monkeypatch) -> Iterator[None]:
    """The shared app's reads and writes on the test database, sharing one pool as on
    Postgres. SQLite in its usual mode commits each statement at once when asked for
    autocommit, so a read's autocommit leaking into a later write would show."""
    for name, value in SHARED.items():
        monkeypatch.setenv(name, value)
    stand_in = db._sqlite_engine(db._sqlite_url(database))
    monkeypatch.setattr(db, "engine", lambda: stand_in)
    yield
    stand_in.dispose()


def test_the_shared_app_reads_outside_a_transaction(shared_reads):
    with db.reading() as conn:
        assert conn.get_execution_options().get("isolation_level") == "AUTOCOMMIT"
        assert conn.execute(select(func.count()).select_from(organizations)).scalar_one() == 0


def test_the_local_copy_reads_as_before(database):
    with db.reading() as conn:
        assert "isolation_level" not in conn.get_execution_options()


def test_a_shared_write_after_a_read_is_still_one_transaction(shared_reads):
    assert count(organizations) == 0

    with pytest.raises(RuntimeError), db.writing() as conn:
        assert "isolation_level" not in conn.get_execution_options()
        add_one(conn)
        raise RuntimeError("stopped partway")

    assert count(organizations) == 0


class PostgresStandIn:
    """The shared app's start, run on SQLite with its table changes inside the
    transaction, as Postgres has them. Only reading Postgres's catalog is stood in."""

    def __init__(self, path: Path) -> None:
        self.engine = db._sqlite_engine(db._sqlite_url(path), autocommit=False)
        self.security_off: set[str] = set()

    def row_level_security(self, conn) -> dict[str, bool]:
        return {name: name not in self.security_off for name in inspect(conn).get_table_names()}

    def tables(self) -> list[str]:
        return inspect(self.engine).get_table_names()


@pytest.fixture
def shared_app(tmp_path, monkeypatch) -> Iterator[PostgresStandIn]:
    for name, value in SHARED.items():
        monkeypatch.setenv(name, value)
    stand_in = PostgresStandIn(tmp_path / "shared.db")
    monkeypatch.setattr(db, "engine", lambda: stand_in.engine)
    monkeypatch.setattr(db, "row_level_security", stand_in.row_level_security)
    yield stand_in
    stand_in.engine.dispose()


def test_the_shared_app_fills_a_database_with_none_of_its_tables(shared_app):
    assert db.prepare_database(add_one) is True
    assert count(organizations) == 1
    assert {"alembic_version", "users", "organizations"} <= set(shared_app.tables())


def test_an_emptied_shared_database_stays_empty(shared_app):
    db.prepare_database(add_one)
    with db.writing() as conn:
        conn.execute(organizations.delete())

    assert db.prepare_database(add_one) is False
    assert count(organizations) == 0


def test_an_interrupted_first_start_of_the_shared_app_leaves_no_tables(shared_app):
    def fail(conn):
        add_one(conn)
        raise RuntimeError("stopped partway")

    with pytest.raises(RuntimeError):
        db.prepare_database(fail)
    assert shared_app.tables() == []

    assert db.prepare_database(add_one) is True
    assert count(organizations) == 1


def test_a_table_without_row_level_security_stops_the_shared_app_and_changes_nothing(shared_app):
    shared_app.security_off = {"users"}

    with pytest.raises(db.RowLevelSecurityOff, match="these tables: users\\."):
        db.prepare_database(add_one)
    assert shared_app.tables() == []


def test_the_shared_app_never_builds_the_local_file(shared_app, no_database):
    assert settings.load() is not None
    db.prepare_database(add_one)
    assert not no_database.exists()


@pytest.mark.parametrize(
    ("text", "lowered"),
    [("ÉMILE", "émile"), ("ÇA VA", "ça va"), ("ΕΛΈΝΗ", "ελένη"), ("ŁÓDŹ", "łódź"), ("Harbor & Pine", "harbor & pine")],
)
def test_lower_knows_every_language(database, text, lowered):
    with db.reading() as conn:
        assert conn.execute(select(func.lower(literal(text)))).scalar_one() == lowered


def test_lower_leaves_blanks_blank(database):
    with db.reading() as conn:
        assert conn.execute(select(func.lower(null()))).scalar_one() is None


def test_lower_finds_a_record_in_any_case(make):
    make.organization("Émile Zola Imports")
    make.organization("Harbor & Pine")
    with db.reading() as conn:
        found = conn.execute(
            select(organizations.c.name, func.lower(organizations.c.website)).where(
                func.lower(organizations.c.name).contains("émile")
            )
        ).all()
    assert found == [("Émile Zola Imports", None)]
