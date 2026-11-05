from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    Column,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Table,
    Text,
    column,
)

from accountable import who
from accountable.db import TABLE_OPTIONS, metadata, utc_now
from accountable.users import users

organizations = Table(
    "organizations",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("name", Text, nullable=False),
    Column("website", Text),
    Column("industry", Text),
    Column("notes", Text),
    *who.columns(),
    **TABLE_OPTIONS,
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
    *who.columns(),
    **TABLE_OPTIONS,
)

deals = Table(
    "deals",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("name", Text, nullable=False),
    Column("organization_id", ForeignKey("organizations.id", ondelete="SET NULL"), index=True),
    Column("main_contact_id", ForeignKey("contacts.id", ondelete="SET NULL"), index=True),
    Column("stage", Text, nullable=False),
    Column("value", BigInteger, nullable=False),
    Column("probability", Integer, nullable=False),
    Column("close_date", Date, nullable=False),
    Column("position", Integer, nullable=False),
    *who.columns(),
    Index("ix_deals_stage_position", "stage", "position"),
    **TABLE_OPTIONS,
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
    *who.columns(),
    CheckConstraint(column("contact_id").is_(None) != column("deal_id").is_(None), name="one_parent"),
    **TABLE_OPTIONS,
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
    Column("created_by", ForeignKey(users.c.id), index=True),
    **TABLE_OPTIONS,
)

# The CRM's records, which npm run seed and npm run empty count before they delete them (C4).
# Stage changes go with their deals, so they aren't counted on their own.
RECORDS = (organizations, contacts, deals, activities)
