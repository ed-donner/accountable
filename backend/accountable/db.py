"""How the database is stored. SQLite-specific code stays in this file."""

import os
import sqlite3
import threading
from collections.abc import Callable, Generator
from contextlib import contextmanager
from datetime import UTC, date, datetime
from pathlib import Path
from typing import TypedDict

from alembic import command
from alembic.config import Config
from sqlalchemy import URL, Connection, Engine, MetaData, create_engine, event

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_PATH = ROOT / "data" / "accountable.db"
MIGRATIONS = Path(__file__).parent / "migrations"

metadata = MetaData(
    naming_convention={
        "ix": "ix_%(table_name)s_%(column_0_N_name)s",
        "ck": "ck_%(table_name)s_%(constraint_name)s",
        "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
        "pk": "pk_%(table_name)s",
    }
)


class TableOptions(TypedDict):
    sqlite_autoincrement: bool


# Every table gets these. SQLite would otherwise give the newest record's id to
# the next one after a delete, so an old address could open a different record.
TABLE_OPTIONS: TableOptions = {"sqlite_autoincrement": True}

# FastAPI runs requests on separate threads, and renumbering a column reads it
# before writing it, so all writes go one at a time.
_write_lock = threading.Lock()
_engine: Engine | None = None


def utc_now() -> datetime:
    """The time in UTC, with no zone attached, which is how SQLite stores it."""
    return datetime.now(UTC).replace(tzinfo=None)


def local_today() -> date:
    return date.today()


def database_path() -> Path:
    return Path(os.environ.get("ACCOUNTABLE_DB") or DEFAULT_PATH).resolve()


def _make_engine(path: Path, *, foreign_keys: bool = True, **connect_args: object) -> Engine:
    made = create_engine(URL.create("sqlite", database=str(path)), connect_args={"timeout": 30, **connect_args})

    @event.listens_for(made, "connect")
    def set_foreign_keys(connection: sqlite3.Connection, _record: object) -> None:
        connection.setconfig(sqlite3.SQLITE_DBCONFIG_ENABLE_FKEY, foreign_keys)

    return made


def engine() -> Engine:
    global _engine
    if _engine is None:
        _engine = _make_engine(database_path())
    return _engine


def dispose() -> None:
    """Close every connection, so the next use opens the current database path."""
    global _engine
    if _engine is not None:
        _engine.dispose()
        _engine = None


@contextmanager
def reading() -> Generator[Connection]:
    with engine().connect() as connection:
        yield connection


@contextmanager
def writing() -> Generator[Connection]:
    """One transaction, with every other write waiting for it."""
    with _write_lock, engine().begin() as connection:
        yield connection


def _upgrade(path: Path, revision: str = "head") -> None:
    """Runs the migrations in one transaction, so one that stops partway changes nothing.

    SQLite makes most table changes by rebuilding the table. Foreign keys stay off
    meanwhile, because dropping the old table with them on would run its delete
    rules, blanking links and deleting activities. Autocommit off is what puts
    those table changes inside the transaction.
    """
    config = Config()
    config.set_main_option("script_location", str(MIGRATIONS).replace("%", "%%"))
    migrating = _make_engine(path, foreign_keys=False, autocommit=False)
    try:
        with migrating.begin() as connection:
            config.attributes["connection"] = connection
            command.upgrade(config, revision)
    finally:
        migrating.dispose()


def prepare_database(fill_new: Callable[[Connection], None]) -> bool:
    """Bring the database up to date, building it first if it's new.

    "New" means the file isn't there, so an emptied database stays empty. A new
    one is built under a temporary name and renamed once it's finished, so a
    first start that's interrupted leaves nothing that looks like a database.

    Returns True if the database was just built.
    """
    path = database_path()
    path.parent.mkdir(parents=True, exist_ok=True)

    if path.exists():
        _upgrade(path)
        return False

    building = path.with_name(f"{path.stem}.building{path.suffix}")
    building.unlink(missing_ok=True)
    building.with_name(f"{building.name}-journal").unlink(missing_ok=True)

    target = _make_engine(building)
    try:
        _upgrade(building)
        with target.begin() as connection:
            fill_new(connection)
    except BaseException:
        target.dispose()
        building.unlink(missing_ok=True)
        raise
    target.dispose()
    os.replace(building, path)
    return True
