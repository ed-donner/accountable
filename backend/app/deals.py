"""Deals: routes, request models, queries, moves and the delete rule.

Covers R10, R12, R14–R18 (through `stages`), R29, R33, R40, R42 and D8.
"""

from datetime import date, datetime
from typing import Annotated

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import Connection, and_, insert, select, update

from . import activities, api, db, settings, stages
from .activities import Activity
from .api import Name
from .db import contacts, deals, organizations
from .stages import Stage

router = APIRouter(tags=["deals"])

# Up to $10 billion a deal, so totals stay well inside what JavaScript numbers hold exactly.
MAX_CENTS = 10**12
Cents = Annotated[int, Field(ge=0, le=MAX_CENTS)]
Percent = Annotated[int, Field(ge=0, le=100)]


class DealIn(BaseModel):
    name: Name
    organization_id: int
    main_contact_id: int | None = None
    stage: Stage = "New"
    value_cents: Cents
    probability: Percent | None = None
    close_date: date


class DealPatch(BaseModel):
    # Required fields may be left out of a PATCH but not sent as null.
    name: Name = None  # type: ignore[assignment]
    organization_id: int = None  # type: ignore[assignment]
    main_contact_id: int | None = None
    stage: Stage = None  # type: ignore[assignment]
    value_cents: Cents = None  # type: ignore[assignment]
    probability: Percent = None  # type: ignore[assignment]
    close_date: date = None  # type: ignore[assignment]


class MoveIn(BaseModel):
    stage: Stage
    index: Annotated[int, Field(ge=0)]


class StageInfo(BaseModel):
    """R13: a stage, its usual probability and whether deals in it are open."""

    name: Stage
    probability: int
    open: bool


class Deal(BaseModel):
    """A deal with its organization and contact names, expected revenue (R18) and late flag (R17)."""

    id: int
    name: str
    organization_id: int
    organization_name: str
    main_contact_id: int | None
    contact_name: str | None
    stage: Stage
    value_cents: int
    probability: int
    expected_cents: int
    close_date: date
    is_late: bool
    position: int
    created_at: datetime
    updated_at: datetime


class DealDetail(Deal):
    timeline: list[Activity]


class DealDeletePreview(api.DeletePreview):
    stage_changes: int
    activities_deleted: int
    activities_kept: int


# ---------- queries ----------


def _select():
    return select(
        deals,
        organizations.c.name.label("organization_name"),
        contacts.c.name.label("contact_name"),
    ).select_from(
        deals.join(organizations, deals.c.organization_id == organizations.c.id).outerjoin(
            contacts, deals.c.main_contact_id == contacts.c.id
        )
    )


def _with_figures(row, today: date) -> dict:
    deal = dict(row)
    deal["expected_cents"] = stages.expected_cents(deal["value_cents"], deal["probability"])
    deal["is_late"] = stages.is_late(deal["stage"], date.fromisoformat(deal["close_date"]), today)
    return deal


def deal_rows(conn: Connection, where=None) -> list[dict]:
    """Deals with organization and contact names, expected revenue and the late flag."""
    query = _select().order_by(deals.c.position, deals.c.id)
    if where is not None:
        query = query.where(where)
    today = settings.today()
    return [_with_figures(r, today) for r in conn.execute(query).mappings()]


def get_or_404(conn: Connection, deal_id: int) -> dict:
    api.not_found_unless_fits(deal_id, "Deal not found")
    rows = deal_rows(conn, deals.c.id == deal_id)
    if not rows:
        raise HTTPException(404, "Deal not found")
    return rows[0]


def _column_ids(conn: Connection, stage: str, leave_out: int | None = None) -> list[int]:
    query = select(deals.c.id).where(deals.c.stage == stage).order_by(deals.c.position, deals.c.id)
    return [i for (i,) in conn.execute(query) if i != leave_out]


def _renumber(conn: Connection, ids: list[int]) -> None:
    """D8: positions 0, 1, 2… in the given order."""
    for position, deal_id in enumerate(ids):
        conn.execute(update(deals).where(deals.c.id == deal_id).values(position=position))


def _check_links(conn: Connection, organization_id: int | None, main_contact_id: int | None) -> None:
    if organization_id is not None:
        api.require_row(conn, organizations, organization_id, "organization_id", "Choose an organization")
    if main_contact_id is not None:
        api.require_row(conn, contacts, main_contact_id, "main_contact_id", "Choose a contact from the list")


def _change_stage(conn: Connection, deal: dict, new_stage: str, at: str) -> dict:
    """R15, R16 and R12: the values that change with the stage, plus the stage change entry."""
    old_stage = deal["stage"]
    close = stages.close_date_after_change(
        old_stage, new_stage, date.fromisoformat(deal["close_date"]), settings.today()
    )
    activities.log_stage_change(conn, deal["id"], old_stage, new_stage, at)
    return {
        "stage": new_stage,
        "probability": stages.probability_after_change(old_stage, new_stage, deal["probability"]),
        "close_date": close.isoformat(),
    }


# ---------- routes ----------


@router.get("/stages", response_model=list[StageInfo])
def list_stages() -> list[dict]:
    """R13: the fixed stages with their usual probability and whether they're open."""
    return stages.stage_list()


@router.get("/deals", response_model=list[Deal])
def list_deals() -> list[dict]:
    with db.transaction() as conn:
        return deal_rows(conn)


@router.post("/deals", status_code=201, response_model=Deal)
def create_deal(body: DealIn) -> dict:
    """R14 for the probability, and R42: a new deal goes to the top of its column."""
    now = db.now_iso()
    with db.transaction() as conn:
        _check_links(conn, body.organization_id, body.main_contact_id)
        values = body.model_dump()
        values["probability"] = stages.probability_for_new_deal(body.stage, body.probability)
        values["close_date"] = body.close_date.isoformat()
        deal_id = conn.execute(
            insert(deals).values(**values, position=-1, created_at=now, updated_at=now)
        ).inserted_primary_key[0]
        _renumber(conn, [deal_id, *_column_ids(conn, body.stage, leave_out=deal_id)])
        return get_or_404(conn, deal_id)


@router.get("/deals/{deal_id}", response_model=DealDetail)
def get_deal(deal_id: int) -> dict:
    """R33: details, figures, organization and main contact, and the timeline."""
    with db.transaction() as conn:
        deal = get_or_404(conn, deal_id)
        deal["timeline"] = activities.timeline(conn, deal_id=deal_id)
        return deal


@router.patch("/deals/{deal_id}", response_model=Deal)
def update_deal(deal_id: int, body: DealPatch) -> dict:
    changes = body.model_dump(exclude_unset=True)
    now = db.now_iso()
    with db.transaction() as conn:
        deal = get_or_404(conn, deal_id)
        _check_links(conn, changes.get("organization_id"), changes.get("main_contact_id"))
        if "close_date" in changes:
            changes["close_date"] = changes["close_date"].isoformat()
        new_stage = changes.pop("stage", deal["stage"])
        if new_stage != deal["stage"]:
            # The stage's own probability and close date win over values sent with it (R15, R16).
            if "close_date" in changes:
                deal["close_date"] = changes["close_date"]
            changes.update(_change_stage(conn, deal, new_stage, now))
            _renumber(conn, _column_ids(conn, deal["stage"], leave_out=deal_id))
            _renumber(conn, [deal_id, *_column_ids(conn, new_stage, leave_out=deal_id)])
        if changes:
            conn.execute(update(deals).where(deals.c.id == deal_id).values(**changes, updated_at=now))
        return get_or_404(conn, deal_id)


@router.post("/deals/{deal_id}/move", response_model=Deal)
def move_deal(deal_id: int, body: MoveIn) -> dict:
    """R40: change stage and/or place. The deal lands at `index` in the target column."""
    now = db.now_iso()
    with db.transaction() as conn:
        deal = get_or_404(conn, deal_id)
        target = _column_ids(conn, body.stage, leave_out=deal_id)
        target.insert(min(body.index, len(target)), deal_id)
        if body.stage != deal["stage"]:
            changes = _change_stage(conn, deal, body.stage, now)
            conn.execute(update(deals).where(deals.c.id == deal_id).values(**changes, updated_at=now))
            _renumber(conn, _column_ids(conn, deal["stage"], leave_out=deal_id))
        _renumber(conn, target)
        return get_or_404(conn, deal_id)


def _delete_counts(conn: Connection, deal_id: int) -> dict:
    a = db.activities
    rows = conn.execute(select(a.c.kind, a.c.contact_id).where(a.c.deal_id == deal_id)).all()
    return {
        "stage_changes": sum(1 for kind, _ in rows if kind == "stage_change"),
        "activities_deleted": sum(1 for kind, contact in rows if kind != "stage_change" and contact is None),
        "activities_kept": sum(1 for _, contact in rows if contact is not None),
    }


@router.get("/deals/{deal_id}/delete-preview", response_model=DealDeletePreview)
def delete_preview(deal_id: int) -> dict:
    """R26, R29: what deleting this deal will do."""
    with db.transaction() as conn:
        deal = get_or_404(conn, deal_id)
        counts = _delete_counts(conn, deal_id)
    parts = [f"Delete {deal['name']}?"]
    if counts["activities_deleted"]:
        parts.append(f"{api.plural(counts['activities_deleted'], 'activity', 'activities')} will be deleted.")
    if counts["activities_kept"]:
        kept = api.plural(counts["activities_kept"], "activity", "activities")
        parts.append(f"{kept} also linked to a contact will stay on that contact.")
    if counts["stage_changes"]:
        history = api.plural(counts["stage_changes"], "stage change", "stage changes")
        parts.append(f"Its stage history ({history}) will be deleted.")
    return {"blocked": False, **counts, "message": " ".join(parts)}


@router.delete("/deals/{deal_id}", status_code=204)
def delete_deal(deal_id: int) -> None:
    """R29: stage changes and activities linked only to this deal go; ones also on a contact stay."""
    a = db.activities
    with db.transaction() as conn:
        deal = get_or_404(conn, deal_id)
        conn.execute(a.delete().where(and_(a.c.deal_id == deal_id, a.c.contact_id.is_(None))))
        conn.execute(deals.delete().where(deals.c.id == deal_id))
        _renumber(conn, _column_ids(conn, deal["stage"]))
