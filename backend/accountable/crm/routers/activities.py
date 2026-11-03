from fastapi import APIRouter, HTTPException
from sqlalchemy import delete, insert, select, update

from accountable import db
from accountable.auth import CurrentUser
from accountable.crm import schemas, who
from accountable.crm.tables import activities, contacts, deals

router = APIRouter(prefix="/activities")


def _get(conn, activity_id: int):
    row = conn.execute(select(activities).where(activities.c.id == activity_id)).one_or_none()
    if row is None:
        raise HTTPException(404, "Activity not found")
    return row


@router.post("", status_code=201)
def add_activity(body: schemas.ActivityCreate, user: CurrentUser, now: schemas.Now) -> schemas.Activity:
    values = body.model_dump()
    if (values["contact_id"] is None) == (values["deal_id"] is None):
        raise schemas.FieldError({"contact_id": "Choose a contact or a deal, not both"})
    values["occurred_at"] = values["occurred_at"] or now
    with db.writing() as conn:
        for field, table in (("contact_id", contacts), ("deal_id", deals)):
            chosen = values[field]
            if chosen is not None and conn.scalar(select(table.c.id).where(table.c.id == chosen)) is None:
                raise schemas.FieldError({field: "That record no longer exists"})
        new_id = conn.execute(
            insert(activities).values(**values, **who.added(user, now)).returning(activities.c.id)
        ).scalar_one()
        return schemas.Activity(**_get(conn, new_id)._mapping)


@router.patch("/{activity_id}")
def edit_activity(
    activity_id: schemas.PathId, body: schemas.ActivityUpdate, user: CurrentUser, now: schemas.Now
) -> schemas.Activity:
    fields = body.model_dump(exclude_unset=True)
    with db.writing() as conn:
        altered = who.alterations(fields, _get(conn, activity_id))
        if altered:
            conn.execute(
                update(activities).where(activities.c.id == activity_id).values(**altered, **who.changed(user, now))
            )
        return schemas.Activity(**_get(conn, activity_id)._mapping)


@router.delete("/{activity_id}", status_code=204)
def delete_activity(activity_id: schemas.PathId) -> None:
    with db.writing() as conn:
        _get(conn, activity_id)
        conn.execute(delete(activities).where(activities.c.id == activity_id))
