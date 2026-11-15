"""Activities and timelines: notes, calls, emails, follow-ups and stage change entries.

Covers R11, R12, R30, R34–R38 and D5.
"""

from datetime import date, datetime
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import Connection, insert, select, update

from . import api, db, settings
from .api import Name as Description
from .db import ActivityKind, EnteredKind, activities, contacts, deals
from .stages import Stage

router = APIRouter(prefix="/activities", tags=["activities"])

FollowUpState = Literal["overdue", "today", "upcoming"]
STAGE_CHANGE_LOCKED = "Stage changes are recorded automatically and can't be changed or deleted."


class ActivityIn(BaseModel):
    kind: EnteredKind
    contact_id: int | None = None
    deal_id: int | None = None
    description: Description
    occurred_at: datetime | None = None
    follow_up_date: date | None = None
    done: bool = False


class ActivityPatch(BaseModel):
    # Required fields may be left out of a PATCH but not sent as null.
    kind: EnteredKind = None  # type: ignore[assignment]
    contact_id: int | None = None
    deal_id: int | None = None
    description: Description = None  # type: ignore[assignment]
    occurred_at: datetime = None  # type: ignore[assignment]
    follow_up_date: date | None = None
    done: bool = None  # type: ignore[assignment]


class Activity(BaseModel):
    """A timeline entry, with the names of what it's linked to and its follow-up state (R38)."""

    id: int
    kind: ActivityKind
    contact_id: int | None
    contact_name: str | None
    deal_id: int | None
    deal_name: str | None
    description: str
    occurred_at: datetime
    follow_up_date: date | None
    follow_up_state: FollowUpState | None
    done: bool
    from_stage: Stage | None
    to_stage: Stage | None
    created_at: datetime
    updated_at: datetime


def follow_up_state(follow_up: str | None, done: bool, today: date) -> FollowUpState | None:
    """R38: overdue, today or upcoming, for an open follow-up."""
    if not follow_up or done:
        return None
    due = date.fromisoformat(follow_up)
    return "overdue" if due < today else "today" if due == today else "upcoming"


def _select():
    return select(
        activities,
        contacts.c.name.label("contact_name"),
        deals.c.name.label("deal_name"),
    ).select_from(
        activities.outerjoin(contacts, activities.c.contact_id == contacts.c.id).outerjoin(
            deals, activities.c.deal_id == deals.c.id
        )
    )


def _rows(conn: Connection, query) -> list[dict]:
    today = settings.today()
    out = []
    for row in conn.execute(query).mappings():
        item = dict(row)
        item["follow_up_state"] = follow_up_state(item["follow_up_date"], item["done"], today)
        out.append(item)
    return out


def timeline(conn: Connection, contact_id: int | None = None, deal_id: int | None = None) -> list[dict]:
    """R34, R36: a record's entries, newest first. A deal's includes its stage changes."""
    query = _select().order_by(activities.c.occurred_at.desc(), activities.c.id.desc())
    if contact_id is not None:
        query = query.where(activities.c.contact_id == contact_id)
    if deal_id is not None:
        query = query.where(activities.c.deal_id == deal_id)
    return _rows(conn, query)


def recent(conn: Connection, limit: int = 10) -> list[dict]:
    """R49: the latest activities and stage change entries across all records."""
    return _rows(conn, _select().order_by(activities.c.occurred_at.desc(), activities.c.id.desc()).limit(limit))


def open_follow_ups(conn: Connection) -> list[dict]:
    """R50: every follow-up not yet done, soonest first."""
    query = (
        _select()
        .where(activities.c.follow_up_date.is_not(None), activities.c.done.is_(False))
        .order_by(activities.c.follow_up_date, activities.c.occurred_at)
    )
    return _rows(conn, query)


def log_stage_change(conn: Connection, deal_id: int, old: str, new: str, at: str) -> None:
    """R12: "Moved from Proposal to Negotiation", written by the system only."""
    conn.execute(
        insert(activities).values(
            kind="stage_change",
            deal_id=deal_id,
            description=f"Moved from {old} to {new}",
            occurred_at=at,
            from_stage=old,
            to_stage=new,
            done=False,
            created_at=at,
            updated_at=at,
        )
    )


def _get_or_404(conn: Connection, activity_id: int) -> dict:
    rows = _rows(conn, _select().where(activities.c.id == activity_id))
    if not rows:
        raise HTTPException(404, "Activity not found")
    return rows[0]


def _check_links(conn: Connection, contact_id: int | None, deal_id: int | None) -> None:
    if contact_id is None and deal_id is None:
        raise api.field_error("contact_id", "Link it to a contact or a deal")
    if contact_id is not None:
        api.require_row(conn, contacts, contact_id, "contact_id", "Choose a contact from the list")
    if deal_id is not None:
        api.require_row(conn, deals, deal_id, "deal_id", "Choose a deal from the list")


@router.get("", response_model=list[Activity])
def list_activities(contact_id: int | None = None, deal_id: int | None = None) -> list[dict]:
    if contact_id is None and deal_id is None:
        raise api.field_error("contact_id", "Give a contact or a deal")
    with db.transaction() as conn:
        return timeline(conn, contact_id=contact_id, deal_id=deal_id)


@router.post("", status_code=201, response_model=Activity)
def create_activity(body: ActivityIn) -> dict:
    """R35: a note, call or email on a contact and/or deal, with an optional follow-up."""
    now = db.now_iso()
    values = body.model_dump()
    values["occurred_at"] = db.to_iso(body.occurred_at) if body.occurred_at else now
    values["follow_up_date"] = body.follow_up_date.isoformat() if body.follow_up_date else None
    with db.transaction() as conn:
        _check_links(conn, body.contact_id, body.deal_id)
        activity_id = conn.execute(
            insert(activities).values(**values, created_at=now, updated_at=now)
        ).inserted_primary_key[0]
        return _get_or_404(conn, activity_id)


@router.patch("/{activity_id}", response_model=Activity)
def update_activity(activity_id: int, body: ActivityPatch) -> dict:
    """R37: edit, or mark done. Stage change entries can't be edited (D5)."""
    changes = body.model_dump(exclude_unset=True)
    if "occurred_at" in changes:
        changes["occurred_at"] = db.to_iso(changes["occurred_at"])
    if changes.get("follow_up_date") is not None:
        changes["follow_up_date"] = changes["follow_up_date"].isoformat()
    with db.transaction() as conn:
        current = _get_or_404(conn, activity_id)
        if current["kind"] == "stage_change":
            raise HTTPException(409, STAGE_CHANGE_LOCKED)
        _check_links(conn, changes.get("contact_id", current["contact_id"]), changes.get("deal_id", current["deal_id"]))
        if changes:
            conn.execute(
                update(activities).where(activities.c.id == activity_id).values(**changes, updated_at=db.now_iso())
            )
        return _get_or_404(conn, activity_id)


@router.delete("/{activity_id}", status_code=204)
def delete_activity(activity_id: int) -> None:
    """R30: deletes just this activity. Stage change entries can't be deleted (D5)."""
    with db.transaction() as conn:
        if _get_or_404(conn, activity_id)["kind"] == "stage_change":
            raise HTTPException(409, STAGE_CHANGE_LOCKED)
        conn.execute(activities.delete().where(activities.c.id == activity_id))
