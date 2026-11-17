"""Engine, tables, constraint and indexes.

Every schema change also needs an Alembic migration in backend/migrations/versions.
"""

from datetime import datetime
from functools import lru_cache
from pathlib import Path

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
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
)

metadata = MetaData()


def _timestamps() -> list[Column]:
    return [
        Column("created_at", DateTime, nullable=False, default=datetime.now),
        Column("updated_at", DateTime, nullable=False, default=datetime.now, onupdate=datetime.now),
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
    Column("contact_id", Integer, ForeignKey("contacts.id", ondelete="SET NULL"), index=True),
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
    CheckConstraint(
        "(contact_id IS NULL) <> (deal_id IS NULL)", name="ck_activities_one_parent"
    ),
    Index("ix_activities_follow_up", "follow_up_on", "done"),
    Index("ix_activities_occurred_on", "occurred_on"),
)

stage_changes = Table(
    "stage_changes",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("deal_id", Integer, ForeignKey("deals.id", ondelete="CASCADE"), nullable=False, index=True),
    Column("from_stage", String),
    Column("to_stage", String, nullable=False),
    Column("changed_at", DateTime, nullable=False),
    *_timestamps(),
)


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


@lru_cache(maxsize=None)
def engine_for(path: Path) -> Engine:
    return make_engine(path)


def migrate(engine: Engine) -> None:
    """Apply any new Alembic migrations, keeping existing data (G12)."""
    from alembic import command
    from alembic.config import Config

    from app.config import REPO_ROOT

    cfg = Config(str(REPO_ROOT / "alembic.ini"))
    with engine.begin() as conn:
        cfg.attributes["connection"] = conn
        command.upgrade(cfg, "head")
