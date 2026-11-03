"""Merged timelines and the last-activity queries."""

from datetime import date, datetime
from typing import Any

from sqlalchemy import (
    ColumnElement,
    CompoundSelect,
    Connection,
    Date,
    Integer,
    Select,
    Subquery,
    Table,
    Text,
    cast,
    func,
    literal,
    null,
    or_,
    select,
    true,
    union_all,
)
from sqlalchemy.types import TypeEngine

from accountable.crm import schemas
from accountable.crm.rules import STAGE_NAMES
from accountable.crm.tables import activities, contacts, deals, organizations, stage_changes
from accountable.users import person, users

DEFAULT_LIMIT = 50

# Both joins are spelled out. Left to guess, SQLAlchemy can reach deals through
# the contact's deals instead of the activity's own deal.
activities_with_names = activities.outerjoin(contacts, activities.c.contact_id == contacts.c.id).outerjoin(
    deals, activities.c.deal_id == deals.c.id
)


def _blank(kind: type[TypeEngine[Any]]) -> ColumnElement[Any]:
    """A column one side of the union doesn't have. Postgres won't guess its type the way SQLite does."""
    return cast(null(), kind)


def _merged(activity_scope: ColumnElement[bool], change_scope: ColumnElement[bool]) -> CompoundSelect:
    from_activities = (
        select(
            literal("activity").label("kind"),
            activities.c.id.label("id"),
            activities.c.occurred_at.label("at"),
            activities.c.type.label("type"),
            activities.c.description.label("description"),
            _blank(Text).label("from_stage"),
            _blank(Text).label("to_stage"),
            activities.c.follow_up_date.label("follow_up_date"),
            activities.c.follow_up_done.label("follow_up_done"),
            activities.c.contact_id.label("contact_id"),
            contacts.c.name.label("contact_name"),
            activities.c.deal_id.label("deal_id"),
            deals.c.name.label("deal_name"),
            activities.c.created_by.label("created_by"),
        )
        .select_from(activities_with_names)
        .where(activity_scope)
    )
    from_changes = (
        select(
            literal("stage_change").label("kind"),
            stage_changes.c.id.label("id"),
            stage_changes.c.changed_at.label("at"),
            _blank(Text).label("type"),
            _blank(Text).label("description"),
            stage_changes.c.from_stage.label("from_stage"),
            stage_changes.c.to_stage.label("to_stage"),
            _blank(Date).label("follow_up_date"),
            literal(False).label("follow_up_done"),
            _blank(Integer).label("contact_id"),
            _blank(Text).label("contact_name"),
            stage_changes.c.deal_id.label("deal_id"),
            deals.c.name.label("deal_name"),
            stage_changes.c.created_by.label("created_by"),
        )
        .select_from(stage_changes.join(deals))
        .where(change_scope)
    )
    return union_all(from_activities, from_changes)


def _entry(row: Any) -> schemas.TimelineEntry:
    if row.kind == "stage_change":
        description = f"Moved from {STAGE_NAMES[row.from_stage]} to {STAGE_NAMES[row.to_stage]}"
    else:
        description = row.description
    if row.deal_id is not None:
        about = schemas.About(kind="deal", id=row.deal_id, name=row.deal_name)
    else:
        about = schemas.About(kind="contact", id=row.contact_id, name=row.contact_name)
    return schemas.TimelineEntry(
        kind=row.kind,
        id=row.id,
        at=_as_time(row.at),
        type=row.type,
        description=description,
        follow_up_date=_as_date(row.follow_up_date),
        follow_up_done=bool(row.follow_up_done),
        about=about,
        created_by=person(row.created_by, row.created_by_name, row.created_by_email),
    )


# Columns that come through a union lose their types, so SQLite hands back text.
def _as_time(value: datetime | str) -> datetime:
    return datetime.fromisoformat(value) if isinstance(value, str) else value


def _as_date(value: date | str | None) -> date | None:
    return date.fromisoformat(value[:10]) if isinstance(value, str) else value


def _newest_first(everything: Subquery, limit: int, offset: int) -> Select:
    """One page of entries, with who added each. The kind and id keep the order
    stable when entries share a time, so a page never repeats or skips one."""
    return (
        select(everything, users.c.name.label("created_by_name"), users.c.email.label("created_by_email"))
        .outerjoin(users, everything.c.created_by == users.c.id)
        .order_by(everything.c.at.desc(), everything.c.kind, everything.c.id.desc())
        .limit(limit)
        .offset(offset)
    )


def _page(
    conn: Connection, record: Table, record_id: int, merged: CompoundSelect, limit: int, offset: int
) -> schemas.Timeline | None:
    """One page of a record's timeline and its total, or None if there's no such record.

    It's one query, because each is a round trip to the shared app's database: the
    record's row, if it's there, joined to the page of entries, with the total on
    every row. A record whose page is empty still gives one row, with no entry in it.
    """
    everything = merged.subquery()
    total = select(func.count()).select_from(everything).scalar_subquery()
    found = select(record.c.id.label("record_id")).where(record.c.id == record_id).subquery()
    page = _newest_first(everything, limit, offset).subquery()
    rows = conn.execute(
        select(total.label("total"), page)
        .select_from(found.outerjoin(page, true()))
        .order_by(page.c.at.desc(), page.c.kind, page.c.id.desc())
    ).all()
    if not rows:
        return None
    entries = [_entry(row) for row in rows if row.kind is not None]
    return schemas.Timeline(entries=entries, total=rows[0].total)


def for_deal(conn: Connection, deal_id: int, limit: int, offset: int) -> schemas.Timeline | None:
    merged = _merged(activities.c.deal_id == deal_id, stage_changes.c.deal_id == deal_id)
    return _page(conn, deals, deal_id, merged, limit, offset)


def for_contact(conn: Connection, contact_id: int, limit: int, offset: int) -> schemas.Timeline | None:
    their_deals = select(deals.c.id).where(deals.c.main_contact_id == contact_id)
    merged = _merged(
        or_(activities.c.contact_id == contact_id, activities.c.deal_id.in_(their_deals)),
        stage_changes.c.deal_id.in_(their_deals),
    )
    return _page(conn, contacts, contact_id, merged, limit, offset)


def for_organization(conn: Connection, organization_id: int, limit: int, offset: int) -> schemas.Timeline | None:
    its_contacts = select(contacts.c.id).where(contacts.c.organization_id == organization_id)
    its_deals = select(deals.c.id).where(
        or_(deals.c.organization_id == organization_id, deals.c.main_contact_id.in_(its_contacts))
    )
    merged = _merged(
        or_(activities.c.contact_id.in_(its_contacts), activities.c.deal_id.in_(its_deals)),
        stage_changes.c.deal_id.in_(its_deals),
    )
    return _page(conn, organizations, organization_id, merged, limit, offset)


def recent(conn: Connection, now: datetime, limit: int) -> list[schemas.TimelineEntry]:
    merged = _merged(activities.c.occurred_at <= now, stage_changes.c.changed_at <= now)
    return [_entry(row) for row in conn.execute(_newest_first(merged.subquery(), limit, 0))]


# Last activity: the time of the newest entry on each record's timeline, for the
# tables. Each is a subquery of (id, at), so a table's rows come in one query.


def _newest(key: str, *sources: Select) -> Subquery:
    """The newest time for each key across the sources, each selecting (key, at)."""
    entries = union_all(*sources).subquery()
    return (
        select(entries.c[key], func.max(entries.c.at).label("at"))
        .where(entries.c[key].is_not(None))
        .group_by(entries.c[key])
        .subquery()
    )


def _deal_last() -> Subquery:
    """Each deal's newest activity or stage change."""
    return _newest(
        "deal_id",
        select(activities.c.deal_id.label("deal_id"), activities.c.occurred_at.label("at")),
        select(stage_changes.c.deal_id, stage_changes.c.changed_at),
    )


def contact_last() -> Subquery:
    """Each contact's newest activity, or newest entry on a deal where they're the main contact."""
    deal_last = _deal_last()
    return _newest(
        "contact_id",
        select(activities.c.contact_id.label("contact_id"), activities.c.occurred_at.label("at")),
        select(deals.c.main_contact_id, deal_last.c.at).join(deal_last, deal_last.c.deal_id == deals.c.id),
    )


def organization_last() -> Subquery:
    """Each organization's newest entry, from its contacts' timelines and its own deals'."""
    contact_newest = contact_last()
    deal_last = _deal_last()
    return _newest(
        "organization_id",
        select(contacts.c.organization_id.label("organization_id"), contact_newest.c.at).join(
            contact_newest, contact_newest.c.contact_id == contacts.c.id
        ),
        select(deals.c.organization_id, deal_last.c.at).join(deal_last, deal_last.c.deal_id == deals.c.id),
    )
