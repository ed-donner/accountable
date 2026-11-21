"""The tables (spec 2.2), the engine, and one transaction per request."""

from collections.abc import Iterator
from datetime import UTC, datetime
from pathlib import Path
from typing import Annotated

from fastapi import Depends, Request
from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    Connection,
    Date,
    DateTime,
    Engine,
    ForeignKey,
    Index,
    Integer,
    MetaData,
    Table,
    Text,
    and_,
    column,
    create_engine,
    event,
    false,
    func,
    or_,
)
from sqlalchemy.types import TypeDecorator

from backend.app.rules import ACTIVITY_TYPES, CONTACT_STATUSES, STAGES

# Names for constraints and indexes, so migrations can refer to them.
metadata = MetaData(
    naming_convention={
        "ix": "ix_%(table_name)s_%(column_0_N_name)s",
        "uq": "uq_%(table_name)s_%(column_0_name)s",
        "ck": "ck_%(table_name)s_%(constraint_name)s",
        "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
        "pk": "pk_%(table_name)s",
    }
)


class UTCDateTime(TypeDecorator):
    """A date-time stored in UTC without its zone, and read back as UTC."""

    impl = DateTime
    cache_ok = True

    def process_bind_param(self, value: datetime | None, dialect):
        if value is None:
            return None
        if value.tzinfo is None:
            raise ValueError("Date-times must carry a time zone")
        return value.astimezone(UTC).replace(tzinfo=None)

    def process_result_value(self, value: datetime | None, dialect):
        if value is None:
            return None
        return value.replace(tzinfo=UTC)


def _times() -> list[Column]:
    return [
        Column("created_at", UTCDateTime(), nullable=False),
        Column("updated_at", UTCDateTime(), nullable=False),
    ]


organizations = Table(
    "organizations",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("name", Text, nullable=False),
    Column("website", Text),
    Column("industry", Text),
    Column("notes", Text),
    *_times(),
)
Index("ux_organizations_name_lower", func.lower(organizations.c.name), unique=True)

contacts = Table(
    "contacts",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("name", Text, nullable=False),
    Column("email", Text),
    Column("phone", Text),
    Column("job_title", Text),
    Column("organization_id", Integer, ForeignKey("organizations.id", ondelete="SET NULL"), index=True),
    Column("status", Text, nullable=False),
    *_times(),
    CheckConstraint(column("status").in_(CONTACT_STATUSES), name="status"),
)

deals = Table(
    "deals",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("name", Text, nullable=False),
    Column(
        "organization_id",
        Integer,
        ForeignKey("organizations.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    ),
    Column("main_contact_id", Integer, ForeignKey("contacts.id", ondelete="SET NULL"), index=True),
    Column("stage", Text, nullable=False),
    Column("value", Integer, nullable=False),
    Column("probability", Integer, nullable=False),
    Column("close_date", Date, nullable=False),
    Column("position", Integer, nullable=False),
    *_times(),
    CheckConstraint(column("stage").in_(STAGES), name="stage"),
    CheckConstraint(column("value") >= 0, name="value"),
    CheckConstraint(column("probability").between(0, 100), name="probability"),
)
# Not unique, because positions are renumbered.
Index("ix_deals_stage_position", deals.c.stage, deals.c.position)

activities = Table(
    "activities",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("type", Text, nullable=False),
    Column("contact_id", Integer, ForeignKey("contacts.id", ondelete="CASCADE"), index=True),
    Column("deal_id", Integer, ForeignKey("deals.id", ondelete="CASCADE"), index=True),
    Column("description", Text, nullable=False),
    Column("occurred_at", UTCDateTime(), nullable=False, index=True),
    Column("follow_up_date", Date),
    Column("done", Boolean, nullable=False, server_default=false()),
    Column("from_stage", Text),
    Column("to_stage", Text),
    *_times(),
    CheckConstraint(column("type").in_(ACTIVITY_TYPES), name="type"),
    CheckConstraint(
        or_(
            and_(column("contact_id").is_not(None), column("deal_id").is_(None)),
            and_(column("contact_id").is_(None), column("deal_id").is_not(None)),
        ),
        name="one_link",
    ),
)
Index("ix_activities_follow_up_date_done", activities.c.follow_up_date, activities.c.done)


def make_engine(path: Path | str) -> Engine:
    """An engine for the SQLite file, with the settings every connection needs."""
    engine = create_engine(f"sqlite:///{Path(path).as_posix()}")

    @event.listens_for(engine, "connect")
    def _on_connect(dbapi_connection, _record):
        # Let SQLAlchemy say when transactions begin, rather than the sqlite3
        # module, so reads and writes share one transaction (the documented
        # SQLAlchemy recipe for pysqlite).
        dbapi_connection.isolation_level = None
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA busy_timeout=5000")
        cursor.close()

    @event.listens_for(engine, "begin")
    def _on_begin(conn: Connection):
        # A change takes the write lock at the start, so it waits its turn
        # (up to busy_timeout) instead of failing halfway (plan, risk 8).
        conn.exec_driver_sql("BEGIN IMMEDIATE" if conn.info.get("write") else "BEGIN")

    return engine


def get_conn(request: Request) -> Iterator[Connection]:
    """A FastAPI dependency: one connection and one transaction per request.

    Use it through Conn, whose scope="function" commits before the answer is
    sent. FastAPI's default scope commits after, so the browser's next request
    could miss the change.
    """
    engine: Engine = request.app.state.engine
    with engine.connect() as conn:
        conn.info["write"] = request.method not in ("GET", "HEAD", "OPTIONS")
        with conn.begin():
            yield conn


Conn = Annotated[Connection, Depends(get_conn, scope="function")]
