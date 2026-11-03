"""How the database is stored: SQLite in the local copy, Postgres in the shared app.

Code specific to either one stays in this file and the migrations.
"""

import os
import sqlite3
import threading
from collections.abc import Callable, Generator, Mapping
from contextlib import contextmanager
from datetime import UTC, date, datetime
from pathlib import Path
from typing import TypedDict
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from alembic import command
from alembic.config import Config
from sqlalchemy import URL, Connection, Engine, MetaData, column, create_engine, event, inspect, select, table

from accountable import settings

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


# Every table with numbered ids gets these. SQLite would otherwise give the newest
# record's id to the next one after a delete, so an old address could open a
# different record. Postgres never reuses an id.
TABLE_OPTIONS: TableOptions = {"sqlite_autoincrement": True}

# FastAPI runs requests on separate threads, and renumbering a column reads it
# before writing it, so all writes go one at a time. The shared app runs as one
# process, so this covers every teammate's writes too.
_write_lock = threading.Lock()
_engine: Engine | None = None


class RowLevelSecurityOff(RuntimeError):
    pass


def utc_now() -> datetime:
    """The time in UTC, with no zone attached, which is how both databases store it."""
    return datetime.now(UTC).replace(tzinfo=None)


def local_today() -> date:
    """Today in the team's zone, from TZ, or the computer's own zone without it."""
    zone = os.environ.get("TZ", "").removeprefix(":")
    if not zone:
        return date.today()
    try:
        return datetime.now(ZoneInfo(zone)).date()
    except (ZoneInfoNotFoundError, ValueError):
        # Not a zone name, such as a POSIX rule. The C library reads those, and date.today() follows it.
        return date.today()


def database_path() -> Path:
    """The local copy's SQLite file."""
    return Path(os.environ.get("ACCOUNTABLE_DB") or DEFAULT_PATH).resolve()


def _sqlite_url(path: Path) -> URL:
    return URL.create("sqlite", database=str(path))


def database_url() -> URL:
    """Postgres at DATABASE_URL in the shared app, or the local copy's SQLite file (C8)."""
    shared = settings.load()
    return shared.database_url if shared else _sqlite_url(database_path())


# What SQLite hands a Python function, and takes back. A float annotation accepts ints too.
SqliteValue = str | bytes | float | None


def _lower(value: SqliteValue) -> SqliteValue:
    """Lowercase for every language, where SQLite's own lower() knows only A to Z (K2). Blanks stay blank."""
    return value.lower() if isinstance(value, str) else value


def _sqlite_engine(url: URL, *, foreign_keys: bool = True, **connect_args: object) -> Engine:
    made = create_engine(url, connect_args={"timeout": 30, **connect_args})

    @event.listens_for(made, "connect")
    def set_up(connection: sqlite3.Connection, _record: object) -> None:
        connection.setconfig(sqlite3.SQLITE_DBCONFIG_ENABLE_FKEY, foreign_keys)
        # Takes the place of SQLite's own lower(), so search ignores case as Postgres does.
        connection.create_function("lower", 1, _lower, deterministic=True)

    return made


def _postgres_engine(url: URL) -> Engine:
    # Pre-ping replaces a connection the pooler dropped while the app sat idle,
    # rather than failing a request on it. Supabase's session pooler gives each
    # connection a server connection of its own, from a few, so the pool stays small.
    return create_engine(url, pool_pre_ping=True, pool_size=5, max_overflow=0, connect_args={"connect_timeout": 10})


def engine() -> Engine:
    global _engine
    if _engine is None:
        url = database_url()
        _engine = _sqlite_engine(url) if url.get_backend_name() == "sqlite" else _postgres_engine(url)
    return _engine


def dispose() -> None:
    """Close every connection, so the next use opens the current database."""
    global _engine
    if _engine is not None:
        _engine.dispose()
        _engine = None


@contextmanager
def reading() -> Generator[Connection]:
    """A connection for reads only.

    In the shared app it reads outside a transaction. Postgres reads committed data
    a statement at a time either way, so BEGIN and ROLLBACK would only add two round
    trips to Supabase for every read.
    """
    with engine().connect() as connection:
        if settings.load():
            connection.execution_options(isolation_level="AUTOCOMMIT")
        yield connection


@contextmanager
def writing() -> Generator[Connection]:
    """One transaction, with every other write waiting for it."""
    with _write_lock, engine().begin() as connection:
        yield connection


def _migrate(connection: Connection, revision: str = "head") -> None:
    config = Config()
    config.set_main_option("script_location", str(MIGRATIONS).replace("%", "%%"))
    config.attributes["connection"] = connection
    command.upgrade(config, revision)


def _upgrade(path: Path, revision: str = "head") -> None:
    """Runs the migrations on a SQLite file in one transaction, so one that stops partway changes nothing.

    SQLite makes most table changes by rebuilding the table. Foreign keys stay off
    meanwhile, because dropping the old table with them on would run its delete
    rules, blanking links and deleting activities. Autocommit off is what puts
    those table changes inside the transaction.
    """
    migrating = _sqlite_engine(_sqlite_url(path), foreign_keys=False, autocommit=False)
    try:
        with migrating.begin() as connection:
            _migrate(connection, revision)
    finally:
        migrating.dispose()


def prepare_database(fill_new: Callable[[Connection], None]) -> bool:
    """Bring the database up to date, building it first if it's new. Returns True if it was just built.

    "New" means there was no database yet, not that its tables are empty, so an
    emptied database stays empty.
    """
    if settings.load():
        return _prepare_postgres(fill_new)
    return _prepare_sqlite(fill_new)


def _prepare_sqlite(fill_new: Callable[[Connection], None]) -> bool:
    """A new database is built under a temporary name and renamed once it's finished,
    so a first start that's interrupted leaves nothing that looks like a database."""
    path = database_path()
    path.parent.mkdir(parents=True, exist_ok=True)

    if path.exists():
        _upgrade(path)
        return False

    building = path.with_name(f"{path.stem}.building{path.suffix}")
    building.unlink(missing_ok=True)
    building.with_name(f"{building.name}-journal").unlink(missing_ok=True)

    target = _sqlite_engine(_sqlite_url(building))
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


def _prepare_postgres(fill_new: Callable[[Connection], None]) -> bool:
    """Everything in one transaction, which Postgres rolls back whole, table changes included.

    A database with none of the app's tables is new, so an interrupted first start
    leaves it new for the next one. The row-level security check comes last, so a
    migration that leaves a table open changes nothing.
    """
    with engine().begin() as connection:
        new = not _has_app_tables(connection)
        _migrate(connection)
        if new:
            fill_new(connection)
        refuse_tables_without_row_level_security(row_level_security(connection))
    return new


def _has_app_tables(connection: Connection) -> bool:
    return bool(set(inspect(connection).get_table_names()) & {"alembic_version", *metadata.tables})


_pg_class = table("pg_class", column("relname"), column("relkind"), column("relnamespace"), column("relrowsecurity"))
_pg_namespace = table("pg_namespace", column("oid"), column("nspname"))
_TABLE_KINDS = ["r", "p"]  # Ordinary and partitioned tables. Indexes and sequences are in pg_class too.


def row_level_security(connection: Connection) -> dict[str, bool]:
    """Each table in the public schema, which Supabase's Data API serves, and whether row-level security is on."""
    query = (
        select(_pg_class.c.relname, _pg_class.c.relrowsecurity)
        .join(_pg_namespace, _pg_namespace.c.oid == _pg_class.c.relnamespace)
        .where(_pg_namespace.c.nspname == "public", _pg_class.c.relkind.in_(_TABLE_KINDS))
    )
    return {row.relname: row.relrowsecurity for row in connection.execute(query)}


def refuse_tables_without_row_level_security(tables: Mapping[str, bool]) -> None:
    """Stops the start if any table is open to the Data API, naming each one."""
    off = sorted(name for name, on in tables.items() if not on)
    if off:
        raise RowLevelSecurityOff(
            f"Row-level security is off for these tables: {', '.join(off)}. Turn it on in a migration."
        )
