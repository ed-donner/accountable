import os
import sqlite3
from pathlib import Path

import pytest
from sqlalchemy import func, insert, select

from accountable import db
from accountable.crm.tables import contacts, organizations


def count(table) -> int:
    with db.reading() as conn:
        return conn.scalar(select(func.count()).select_from(table))


def add_one(conn) -> None:
    conn.execute(insert(organizations).values(name="Filled"))


@pytest.fixture
def no_database(tmp_path, monkeypatch) -> Path:
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
