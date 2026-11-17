"""Contact and deal timelines (C5, D9, A5, Concern 8)."""

from datetime import date

from fastapi import APIRouter
from sqlalchemy import Connection, or_, select

from app import rules
from app.db import activities, deals, stage_changes
from app.deps import Conn, Today
from app.routers.contacts import get_contact
from app.routers.deals import get_deal
from app.schemas import Ref, Timeline, TimelineEntry

router = APIRouter(tags=["timeline"])


def _entries(conn: Connection, today: date, *, contact_id: int | None = None, deal_id: int | None = None) -> Timeline:
    if contact_id is not None:
        # Deals where the contact is the main contact now, so entries follow the deal's contact.
        deal_ids = select(deals.c.id).where(deals.c.contact_id == contact_id)
        activity_where = or_(activities.c.contact_id == contact_id, activities.c.deal_id.in_(deal_ids))
        change_where = stage_changes.c.deal_id.in_(deal_ids)
    else:
        activity_where = activities.c.deal_id == deal_id
        change_where = stage_changes.c.deal_id == deal_id

    names = (
        dict(conn.execute(select(deals.c.id, deals.c.name).where(deals.c.contact_id == contact_id)).all())
        if contact_id is not None
        else {}
    )

    def deal_ref(id_: int | None) -> Ref | None:
        return Ref(id=id_, name=names[id_]) if id_ is not None and contact_id is not None else None

    items: list[TimelineEntry] = []
    for row in conn.execute(select(activities).where(activity_where)).mappings():
        items.append(
            TimelineEntry(
                kind="activity",
                id=row["id"],
                on=row["occurred_on"],
                at=row["created_at"],
                text=row["description"],
                type=row["type"],
                description=row["description"],
                occurred_on=row["occurred_on"],
                follow_up_on=row["follow_up_on"],
                done=row["done"],
                follow_up_status=rules.follow_up_status(row["follow_up_on"], row["done"], today),
                contact_id=row["contact_id"],
                deal=deal_ref(row["deal_id"]),
            )
        )
    for row in conn.execute(select(stage_changes).where(change_where)).mappings():
        items.append(
            TimelineEntry(
                kind="stage_change",
                id=row["id"],
                on=row["changed_at"].date(),
                at=row["changed_at"],
                text=rules.stage_change_text(row["from_stage"], row["to_stage"]),
                from_stage=row["from_stage"],
                to_stage=row["to_stage"],
                deal=deal_ref(row["deal_id"]),
            )
        )
    items.sort(key=lambda e: (e.on, e.at, e.kind == "activity", e.id), reverse=True)
    return Timeline(items=items)


@router.get("/contacts/{contact_id}/timeline")
def contact_timeline(contact_id: int, conn: Conn, today: Today) -> Timeline:
    get_contact(conn, contact_id)
    return _entries(conn, today, contact_id=contact_id)


@router.get("/deals/{deal_id}/timeline")
def deal_timeline(deal_id: int, conn: Conn, today: Today) -> Timeline:
    get_deal(conn, deal_id, today)
    return _entries(conn, today, deal_id=deal_id)
