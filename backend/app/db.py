"""The database: engine, every table (spec 2.4), the values its columns allow, and a transaction helper.

All tables live here so a migration tool can be added in one place later (spec 2.2).
"""

from contextlib import contextmanager
from datetime import UTC, datetime
from pathlib import Path
from typing import Literal, get_args

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    Connection,
    Engine,
    ForeignKey,
    Index,
    Integer,
    MetaData,
    String,
    Table,
    Text,
    create_engine,
    event,
)

from . import settings, stages

# The values a column allows. The API's request and response types use these too.
ContactStatus = Literal["lead", "qualified", "customer"]
EnteredKind = Literal["note", "call", "email"]  # the activities a person adds
ActivityKind = Literal[EnteredKind, "stage_change"]  # plus the one the system writes (R12)

metadata = MetaData()


def _one_of(column: str, values: tuple | list, name: str) -> CheckConstraint:
    allowed = ", ".join(f"'{v}'" for v in values)
    return CheckConstraint(f"{column} IN ({allowed})", name=name)



def _timestamps() -> list[Column]:
    return [Column("created_at", String, nullable=False), Column("updated_at", String, nullable=False)]


organizations = Table(
    "organizations",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("name", String, nullable=False),
    Column("website", String),
    Column("industry", String),
    Column("notes", Text),
    *_timestamps(),
)

contacts = Table(
    "contacts",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("name", String, nullable=False),
    Column("email", String),
    Column("phone", String),
    Column("job_title", String),
    Column("organization_id", Integer, ForeignKey("organizations.id", ondelete="SET NULL"), index=True),
    Column("status", String, nullable=False, server_default="lead"),
    *_timestamps(),
    _one_of("status", get_args(ContactStatus), "contact_status"),
)

deals = Table(
    "deals",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("name", String, nullable=False),
    Column("organization_id", Integer, ForeignKey("organizations.id", ondelete="RESTRICT"), nullable=False, index=True),
    Column("main_contact_id", Integer, ForeignKey("contacts.id", ondelete="SET NULL"), index=True),
    Column("stage", String, nullable=False),
    Column("value_cents", Integer, nullable=False),
    Column("probability", Integer, nullable=False),
    Column("close_date", String, nullable=False),
    Column("position", Integer, nullable=False, server_default="0"),
    *_timestamps(),
    CheckConstraint("value_cents >= 0", name="deal_value"),
    CheckConstraint("probability BETWEEN 0 AND 100", name="deal_probability"),
    _one_of("stage", stages.STAGE_NAMES, "deal_stage"),
    Index("ix_deals_stage_position", "stage", "position"),
)

activities = Table(
    "activities",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("kind", String, nullable=False),
    # SET NULL only touches activities that are also linked to the other record:
    # the ones linked to nothing else are deleted first, in the record's delete function (D6).
    Column("contact_id", Integer, ForeignKey("contacts.id", ondelete="SET NULL"), index=True),
    Column("deal_id", Integer, ForeignKey("deals.id", ondelete="SET NULL"), index=True),
    Column("description", Text, nullable=False),
    Column("occurred_at", String, nullable=False),
    Column("follow_up_date", String),
    Column("done", Boolean, nullable=False, server_default="0"),
    Column("from_stage", String),
    Column("to_stage", String),
    *_timestamps(),
    _one_of("kind", get_args(ActivityKind), "activity_kind"),
    CheckConstraint("contact_id IS NOT NULL OR deal_id IS NOT NULL", name="activity_link"),
    Index("ix_activities_follow_up", "follow_up_date", "done"),
)

_engines: dict[Path, Engine] = {}


def _on_connect(dbapi_connection, _record) -> None:
    # Let SQLAlchemy say when a transaction starts, instead of the sqlite3 driver putting it off
    # until the first write (see `_begin_now`).
    dbapi_connection.isolation_level = None
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys = ON")
    cursor.close()


def _begin_now(conn) -> None:
    """Take SQLite's write lock as each transaction starts, so the reads a change is based on
    (for example a column's order before a move) can't go stale under another request."""
    conn.exec_driver_sql("BEGIN IMMEDIATE")


def engine() -> Engine:
    """One engine per database file, so tests that point `ACCOUNTABLE_DB` elsewhere get their own."""
    path = settings.db_path()
    if path not in _engines:
        path.parent.mkdir(parents=True, exist_ok=True)
        eng = create_engine(f"sqlite:///{path}", connect_args={"check_same_thread": False})
        event.listen(eng, "connect", _on_connect)
        event.listen(eng, "begin", _begin_now)
        _engines[path] = eng
    return _engines[path]


@contextmanager
def transaction():
    """Commits when the block ends, rolls back if it raises."""
    with engine().begin() as conn:
        yield conn


def create_schema(conn: Connection | None = None) -> None:
    if conn is None:
        metadata.create_all(engine())
    else:
        metadata.create_all(conn)


def dispose_all() -> None:
    for eng in _engines.values():
        eng.dispose()
    _engines.clear()


def now_iso() -> str:
    """A UTC timestamp, stored as ISO 8601 text (spec 2.4)."""
    return to_iso(datetime.now(UTC))


def to_iso(moment: datetime) -> str:
    """Stores a moment as UTC ISO text. A moment with no time zone is taken as UTC."""
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=UTC)
    return moment.astimezone(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")

