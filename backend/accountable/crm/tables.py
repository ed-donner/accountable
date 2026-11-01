from sqlalchemy import Boolean, CheckConstraint, Column, Date, DateTime, ForeignKey, Index, Integer, Table, Text

from accountable.db import metadata, utc_now


def _times() -> list[Column]:
    return [
        Column("created_at", DateTime, nullable=False, default=utc_now),
        Column("updated_at", DateTime, nullable=False, default=utc_now, onupdate=utc_now),
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

# Required links are enforced by the API, not here, because deletes have to be
# able to blank them.
contacts = Table(
    "contacts",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("name", Text, nullable=False),
    Column("email", Text),
    Column("phone", Text),
    Column("job_title", Text),
    Column("organization_id", ForeignKey("organizations.id", ondelete="SET NULL"), index=True),
    Column("status", Text, nullable=False, default="lead"),
    *_times(),
)

deals = Table(
    "deals",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("name", Text, nullable=False),
    Column("organization_id", ForeignKey("organizations.id", ondelete="SET NULL"), index=True),
    Column("main_contact_id", ForeignKey("contacts.id", ondelete="SET NULL"), index=True),
    Column("stage", Text, nullable=False),
    Column("value", Integer, nullable=False),
    Column("probability", Integer, nullable=False),
    Column("close_date", Date, nullable=False),
    Column("position", Integer, nullable=False),
    *_times(),
    Index("ix_deals_stage_position", "stage", "position"),
)

activities = Table(
    "activities",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("type", Text, nullable=False),
    Column("contact_id", ForeignKey("contacts.id", ondelete="CASCADE"), index=True),
    Column("deal_id", ForeignKey("deals.id", ondelete="CASCADE"), index=True),
    Column("description", Text, nullable=False),
    Column("occurred_at", DateTime, nullable=False, index=True),
    Column("follow_up_date", Date, index=True),
    Column("follow_up_done", Boolean, nullable=False, default=False),
    *_times(),
    CheckConstraint("(contact_id IS NULL) != (deal_id IS NULL)", name="one_parent"),
)

stage_changes = Table(
    "stage_changes",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("deal_id", ForeignKey("deals.id", ondelete="CASCADE"), nullable=False, index=True),
    Column("from_stage", Text, nullable=False),
    Column("to_stage", Text, nullable=False),
    Column("changed_at", DateTime, nullable=False, index=True),
    Column("created_at", DateTime, nullable=False, default=utc_now),
)
