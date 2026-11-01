"""Merged timelines and the last-activity queries."""

from datetime import datetime
from typing import Any

from sqlalchemy import ColumnElement, Connection, Select, func, literal, or_, select, union_all

from accountable.crm.rules import STAGE_NAMES
from accountable.crm.tables import activities, contacts, deals, stage_changes

DEFAULT_LIMIT = 50

# Both joins are spelled out. Left to guess, SQLAlchemy can reach deals through
# the contact's deals instead of the activity's own deal.
activities_with_names = activities.outerjoin(contacts, activities.c.contact_id == contacts.c.id).outerjoin(
    deals, activities.c.deal_id == deals.c.id
)


def _merged(activity_scope: ColumnElement[bool], change_scope: ColumnElement[bool]) -> Select:
    from_activities = (
        select(
            literal("activity").label("kind"),
            activities.c.id.label("id"),
            activities.c.occurred_at.label("at"),
            activities.c.type.label("type"),
            activities.c.description.label("description"),
            literal(None).label("from_stage"),
            literal(None).label("to_stage"),
            activities.c.follow_up_date.label("follow_up_date"),
            activities.c.follow_up_done.label("follow_up_done"),
            activities.c.contact_id.label("contact_id"),
            contacts.c.name.label("contact_name"),
            activities.c.deal_id.label("deal_id"),
            deals.c.name.label("deal_name"),
        )
        .select_from(activities_with_names)
        .where(activity_scope)
    )
    from_changes = (
        select(
            literal("stage_change").label("kind"),
            stage_changes.c.id.label("id"),
            stage_changes.c.changed_at.label("at"),
            literal(None).label("type"),
            literal(None).label("description"),
            stage_changes.c.from_stage.label("from_stage"),
            stage_changes.c.to_stage.label("to_stage"),
            literal(None).label("follow_up_date"),
            literal(False).label("follow_up_done"),
            literal(None).label("contact_id"),
            literal(None).label("contact_name"),
            stage_changes.c.deal_id.label("deal_id"),
            deals.c.name.label("deal_name"),
        )
        .select_from(stage_changes.join(deals))
        .where(change_scope)
    )
    return union_all(from_activities, from_changes)


def _entry(row: Any) -> dict[str, Any]:
    if row.kind == "stage_change":
        description = f"Moved from {STAGE_NAMES[row.from_stage]} to {STAGE_NAMES[row.to_stage]}"
    else:
        description = row.description
    if row.deal_id is not None:
        about = {"kind": "deal", "id": row.deal_id, "name": row.deal_name}
    else:
        about = {"kind": "contact", "id": row.contact_id, "name": row.contact_name}
    return {
        "kind": row.kind,
        "id": row.id,
        "at": _as_time(row.at),
        "type": row.type,
        "description": description,
        "follow_up_date": _as_date(row.follow_up_date),
        "follow_up_done": bool(row.follow_up_done),
        "about": about,
    }


# Columns that come through a union lose their types, so SQLite hands back text.
def _as_time(value: datetime | str) -> datetime:
    return datetime.fromisoformat(value) if isinstance(value, str) else value


def _as_date(value: Any) -> Any:
    return value[:10] if isinstance(value, str) else value


def _page(conn: Connection, merged: Select, limit: int, offset: int) -> dict[str, Any]:
    everything = merged.subquery()
    total = conn.scalar(select(func.count()).select_from(everything))
    # The kind and id keep the order stable when entries share a time, so a page
    # never repeats or skips one.
    rows = conn.execute(
        select(everything)
        .order_by(everything.c.at.desc(), everything.c.kind, everything.c.id.desc())
        .limit(limit)
        .offset(offset)
    ).all()
    return {"entries": [_entry(row) for row in rows], "total": total}


def for_deal(conn: Connection, deal_id: int, limit: int, offset: int) -> dict[str, Any]:
    merged = _merged(activities.c.deal_id == deal_id, stage_changes.c.deal_id == deal_id)
    return _page(conn, merged, limit, offset)


def for_contact(conn: Connection, contact_id: int, limit: int, offset: int) -> dict[str, Any]:
    their_deals = select(deals.c.id).where(deals.c.main_contact_id == contact_id)
    merged = _merged(
        or_(activities.c.contact_id == contact_id, activities.c.deal_id.in_(their_deals)),
        stage_changes.c.deal_id.in_(their_deals),
    )
    return _page(conn, merged, limit, offset)


def for_organization(conn: Connection, organization_id: int, limit: int, offset: int) -> dict[str, Any]:
    its_contacts = select(contacts.c.id).where(contacts.c.organization_id == organization_id)
    its_deals = select(deals.c.id).where(
        or_(deals.c.organization_id == organization_id, deals.c.main_contact_id.in_(its_contacts))
    )
    merged = _merged(
        or_(activities.c.contact_id.in_(its_contacts), activities.c.deal_id.in_(its_deals)),
        stage_changes.c.deal_id.in_(its_deals),
    )
    return _page(conn, merged, limit, offset)


def recent(conn: Connection, now: datetime, limit: int) -> list[dict[str, Any]]:
    merged = _merged(activities.c.occurred_at <= now, stage_changes.c.changed_at <= now)
    return _page(conn, merged, limit, 0)["entries"]


def _newest(*groups: dict[int, datetime]) -> dict[int, datetime]:
    newest: dict[int, datetime] = {}
    for group in groups:
        for key, when in group.items():
            if key not in newest or when > newest[key]:
                newest[key] = when
    return newest


def last_by_deal(conn: Connection) -> dict[int, datetime]:
    activity = conn.execute(
        select(activities.c.deal_id, func.max(activities.c.occurred_at))
        .where(activities.c.deal_id.is_not(None))
        .group_by(activities.c.deal_id)
    )
    change = conn.execute(
        select(stage_changes.c.deal_id, func.max(stage_changes.c.changed_at)).group_by(stage_changes.c.deal_id)
    )
    return _newest(dict(activity.all()), dict(change.all()))


def last_by_contact(conn: Connection, deal_last: dict[int, datetime] | None = None) -> dict[int, datetime]:
    deal_last = last_by_deal(conn) if deal_last is None else deal_last
    own = dict(
        conn.execute(
            select(activities.c.contact_id, func.max(activities.c.occurred_at))
            .where(activities.c.contact_id.is_not(None))
            .group_by(activities.c.contact_id)
        ).all()
    )
    newest = dict(own)
    links = conn.execute(select(deals.c.id, deals.c.main_contact_id).where(deals.c.main_contact_id.is_not(None)))
    for deal_id, contact_id in links:
        when = deal_last.get(deal_id)
        if when is not None and (contact_id not in newest or when > newest[contact_id]):
            newest[contact_id] = when
    return newest


def last_by_organization(conn: Connection) -> dict[int, datetime]:
    deal_last = last_by_deal(conn)
    contact_last = last_by_contact(conn, deal_last)

    newest: dict[int, datetime] = {}

    def note(organization_id: int | None, when: datetime | None) -> None:
        if organization_id is None or when is None:
            return
        if organization_id not in newest or when > newest[organization_id]:
            newest[organization_id] = when

    for contact_id, organization_id in conn.execute(select(contacts.c.id, contacts.c.organization_id)):
        note(organization_id, contact_last.get(contact_id))
    for deal_id, organization_id in conn.execute(select(deals.c.id, deals.c.organization_id)):
        note(organization_id, deal_last.get(deal_id))
    return newest


