from fastapi import APIRouter, HTTPException, Response
from sqlalchemy import Connection, delete, insert, select, update

from backend.app import clock
from backend.app.db import Conn, activities, contacts, deals
from backend.app.queries import get_entry
from backend.app.schemas import ActivityCreate, ActivityUpdate, TimelineEntry, bad_field

router = APIRouter(prefix="/api/activities", tags=["activities"])

READ_ONLY = "Stage changes can't be changed or deleted."


def _row(conn: Connection, activity_id: int):
    row = conn.execute(select(activities).where(activities.c.id == activity_id)).first()
    if row is None:
        raise HTTPException(404, "Activity not found")
    return row


@router.post("", response_model=TimelineEntry, status_code=201)
def log_activity(body: ActivityCreate, conn: Conn):
    if body.contact_id is not None:
        if conn.execute(select(contacts.c.id).where(contacts.c.id == body.contact_id)).first() is None:
            raise bad_field("contact_id", "That contact no longer exists.", body.contact_id)
    if body.deal_id is not None:
        if conn.execute(select(deals.c.id).where(deals.c.id == body.deal_id)).first() is None:
            raise bad_field("deal_id", "That deal no longer exists.", body.deal_id)
    now = clock.now()
    new_id = conn.execute(
        insert(activities).values(
            **body.model_dump(),
            done=False,
            created_at=now,
            updated_at=now,
        )
    ).inserted_primary_key[0]
    return get_entry(conn, new_id)


@router.patch("/{activity_id}", response_model=TimelineEntry)
def change_activity(activity_id: int, body: ActivityUpdate, conn: Conn):
    row = _row(conn, activity_id)
    if row.type == "stage_change":
        raise HTTPException(409, READ_ONLY)
    changes = body.model_dump(exclude_unset=True)
    for field in ("type", "description", "occurred_at", "done"):
        if field in changes and changes[field] is None:
            raise bad_field(field, "This can't be empty.", None)
    # Done only means something for a follow-up, so an activity without a
    # follow-up date is never done.
    follow_up_date = changes.get("follow_up_date", row.follow_up_date)
    if follow_up_date is None:
        changes["done"] = False
    if changes:
        conn.execute(update(activities).where(activities.c.id == activity_id).values(**changes, updated_at=clock.now()))
    return get_entry(conn, activity_id)


@router.delete("/{activity_id}", status_code=204)
def delete_activity(activity_id: int, conn: Conn):
    row = _row(conn, activity_id)
    if row.type == "stage_change":
        raise HTTPException(409, READ_ONLY)
    conn.execute(delete(activities).where(activities.c.id == activity_id))
    return Response(status_code=204)
