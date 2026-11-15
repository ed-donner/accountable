"""The database: engine, every table (spec 2.4) and a transaction helper.

All tables live here so a migration tool can be added in one place later (spec 2.2).
"""

from contextlib import contextmanager
from datetime import UTC, datetime
from pathlib import Path

from fastapi.exceptions import RequestValidationError
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
    select,
)

from . import settings

metadata = MetaData()


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
    CheckConstraint("status IN ('lead', 'qualified', 'customer')", name="contact_status"),
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
    CheckConstraint(
        "stage IN ('New', 'Qualified', 'Proposal', 'Negotiation', 'Won', 'Lost')", name="deal_stage"
    ),
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
    CheckConstraint("kind IN ('note', 'call', 'email', 'stage_change')", name="activity_kind"),
    CheckConstraint("contact_id IS NOT NULL OR deal_id IS NOT NULL", name="activity_link"),
    Index("ix_activities_follow_up", "follow_up_date", "done"),
)

_engines: dict[Path, Engine] = {}


def _turn_on_foreign_keys(dbapi_connection, _record) -> None:
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys = ON")
    cursor.close()


def engine() -> Engine:
    """One engine per database file, so tests that point `ACCOUNTABLE_DB` elsewhere get their own."""
    path = settings.db_path()
    if path not in _engines:
        path.parent.mkdir(parents=True, exist_ok=True)
        eng = create_engine(f"sqlite:///{path}", connect_args={"check_same_thread": False})
        event.listen(eng, "connect", _turn_on_foreign_keys)
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


def field_error(field: str, message: str) -> RequestValidationError:
    """A 422 for one field, in the same shape as a failed request validation."""
    return RequestValidationError([{"type": "value_error", "loc": ("body", field), "msg": message, "input": None}])


def require_row(conn: Connection, table: Table, row_id: int, field: str, message: str) -> None:
    """422 on `field` when a linked record doesn't exist, for example a deleted organization."""
    if conn.execute(select(table.c.id).where(table.c.id == row_id)).first() is None:
        raise field_error(field, message)
