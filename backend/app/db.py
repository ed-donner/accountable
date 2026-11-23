"""Engine, tables, constraint and indexes.

Every schema change also needs an Alembic migration in backend/migrations/versions.
"""

from collections.abc import Generator
from contextlib import contextmanager
from datetime import datetime
from functools import cache
from pathlib import Path

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    ColumnElement,
    Connection,
    Date,
    DateTime,
    Engine,
    Float,
    ForeignKey,
    Index,
    Integer,
    MetaData,
    String,
    Table,
    Text,
    create_engine,
    event,
    func,
    insert,
    select,
)

metadata = MetaData()


def _timestamps() -> list[Column]:
    return [
        Column("created_at", DateTime, nullable=False, default=datetime.now),
        Column(
            "updated_at",
            DateTime,
            nullable=False,
            default=datetime.now,
            onupdate=datetime.now,
        ),
    ]


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
    Column(
        "organization_id",
        Integer,
        ForeignKey("organizations.id", ondelete="SET NULL"),
        index=True,
    ),
    Column("status", String, nullable=False, default="lead"),
    *_timestamps(),
)

deals = Table(
    "deals",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("name", String, nullable=False),
    Column(
        "organization_id",
        Integer,
        ForeignKey("organizations.id", ondelete="SET NULL"),
        index=True,
    ),
    Column(
        "contact_id",
        Integer,
        ForeignKey("contacts.id", ondelete="SET NULL"),
        index=True,
    ),
    Column("stage", String, nullable=False, default="new"),
    Column("value", Integer, nullable=False, default=0),
    Column("probability", Integer, nullable=False),
    Column("close_date", Date),
    Column("position", Float, nullable=False, default=1.0),
    *_timestamps(),
    Index("ix_deals_stage_position", "stage", "position"),
)

activities = Table(
    "activities",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("type", String, nullable=False),
    Column("description", Text, nullable=False),
    Column("occurred_on", Date, nullable=False),
    Column("contact_id", Integer, ForeignKey("contacts.id", ondelete="CASCADE"), index=True),
    Column("deal_id", Integer, ForeignKey("deals.id", ondelete="CASCADE"), index=True),
    Column("follow_up_on", Date),
    Column("done", Boolean, nullable=False, default=False),
    *_timestamps(),
    CheckConstraint("(contact_id IS NULL) <> (deal_id IS NULL)", name="ck_activities_one_parent"),
    Index("ix_activities_follow_up", "follow_up_on", "done"),
    Index("ix_activities_occurred_on", "occurred_on"),
)

stage_changes = Table(
    "stage_changes",
    metadata,
    Column("id", Integer, primary_key=True),
    Column(
        "deal_id",
        Integer,
        ForeignKey("deals.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    ),
    Column("from_stage", String),
    Column("to_stage", String, nullable=False),
    Column("changed_at", DateTime, nullable=False),
    *_timestamps(),
)


def insert_row(conn: Connection, table: Table, **values) -> int:
    """Adds a row and returns its new id."""
    return conn.execute(insert(table).values(**values).returning(table.c.id)).scalar_one()


def count_rows(conn: Connection, table: Table, *where: ColumnElement[bool]) -> int:
    return conn.execute(select(func.count()).select_from(table).where(*where)).scalar_one()


def _on_connect(dbapi_conn, _record) -> None:
    # SQLite ignores foreign keys unless they're turned on for each connection (R2).
    cursor = dbapi_conn.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.close()


def make_engine(path: Path) -> Engine:
    path.parent.mkdir(parents=True, exist_ok=True)
    engine = create_engine(
        f"sqlite:///{path}",
        connect_args={"check_same_thread": False, "timeout": 15},
    )
    event.listen(engine, "connect", _on_connect)
    return engine


@cache
def engine_for(path: Path) -> Engine:
    return make_engine(path)


@contextmanager
def foreign_keys_off(engine: Engine) -> Generator[Connection]:
    """A connection with foreign keys off, for migrations (RV6).

    Alembic's batch mode rebuilds a SQLite table by dropping the old one. With
    foreign keys on, that drop would first fire ON DELETE and remove or blank
    the rows that point at it. The pragma only takes effect outside a
    transaction, so it's set before any migration starts. Afterwards every
    link is checked, and foreign keys are turned back on before the
    connection goes back to the pool.
    """
    with engine.connect() as conn:
        conn.exec_driver_sql("PRAGMA foreign_keys=OFF")
        conn.commit()
        try:
            yield conn
            broken = conn.exec_driver_sql("PRAGMA foreign_key_check").fetchall()
            if broken:
                raise RuntimeError(
                    f"A migration left {len(broken)} broken links, for example {broken[0]}."
                )
        finally:
            conn.rollback()
            conn.exec_driver_sql("PRAGMA foreign_keys=ON")
            conn.commit()


def migrate(engine: Engine) -> None:
    """Apply any new Alembic migrations, keeping existing data (G12)."""
    from alembic import command
    from alembic.config import Config

    from app.config import REPO_ROOT

    cfg = Config(str(REPO_ROOT / "alembic.ini"))
    with foreign_keys_off(engine) as conn:
        cfg.attributes["connection"] = conn
        command.upgrade(cfg, "head")
