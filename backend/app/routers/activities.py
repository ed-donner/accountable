"""Activities: create, edit, delete and mark done (A1, A2, A4, A6)."""

from datetime import date

from fastapi import APIRouter
from sqlalchemy import Connection, delete, insert, select, update

from app import rules
from app.db import activities, contacts, deals
from app.deps import Conn, Today
from app.schemas import MESSAGES, Activity, ActivityCreate, ActivityUpdate, FieldErrors, NotFound

router = APIRouter(prefix="/activities", tags=["activities"])


def activity_out(row: dict, today: date) -> Activity:
    return Activity(**row, follow_up_status=rules.follow_up_status(row["follow_up_on"], row["done"], today))


def get_activity(conn: Connection, activity_id: int) -> dict:
    row = conn.execute(select(activities).where(activities.c.id == activity_id)).mappings().first()
    if row is None:
        raise NotFound("activity")
    return dict(row)


def _check_done(follow_up_on: date | None, done: bool) -> None:
    if done and follow_up_on is None:
        raise FieldErrors({"done": MESSAGES["done"]})


@router.post("", status_code=201)
def create_activity(body: ActivityCreate, conn: Conn, today: Today) -> Activity:
    # A2: exactly one contact or one deal.
    if (body.contact_id is None) == (body.deal_id is None):
        raise FieldErrors({"contact_id": "Log the activity on one contact or one deal."})
    if body.contact_id is not None and not conn.scalar(select(contacts.c.id).where(contacts.c.id == body.contact_id)):
        raise FieldErrors({"contact_id": "That contact no longer exists."})
    if body.deal_id is not None and not conn.scalar(select(deals.c.id).where(deals.c.id == body.deal_id)):
        raise FieldErrors({"deal_id": "That deal no longer exists."})
    _check_done(body.follow_up_on, body.done)
    activity_id = conn.execute(insert(activities).values(**body.model_dump())).inserted_primary_key[0]
    conn.commit()
    return activity_out(get_activity(conn, activity_id), today)


@router.get("/{activity_id}")
def read_activity(activity_id: int, conn: Conn, today: Today) -> Activity:
    return activity_out(get_activity(conn, activity_id), today)


@router.patch("/{activity_id}")
def update_activity(activity_id: int, body: ActivityUpdate, conn: Conn, today: Today) -> Activity:
    current = get_activity(conn, activity_id)
    values = body.model_dump(exclude_unset=True)
    follow_up_on = values.get("follow_up_on", current["follow_up_on"])
    if follow_up_on is None and "done" not in values:
        values["done"] = False  # removing the follow-up clears done
    _check_done(follow_up_on, values.get("done", current["done"]))
    if values:
        conn.execute(update(activities).where(activities.c.id == activity_id).values(**values))
        conn.commit()
    return activity_out(get_activity(conn, activity_id), today)


@router.delete("/{activity_id}", status_code=204)
def delete_activity(activity_id: int, conn: Conn) -> None:
    get_activity(conn, activity_id)
    conn.execute(delete(activities).where(activities.c.id == activity_id))
    conn.commit()
