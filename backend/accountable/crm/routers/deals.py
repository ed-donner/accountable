from datetime import date
from typing import Any

from fastapi import APIRouter, HTTPException
from sqlalchemy import delete, func, select, update

from accountable import api, db, holds, who
from accountable.auth import CurrentUser
from accountable.crm import rules, schemas, timeline
from accountable.crm.tables import activities, contacts, deals, organizations, stage_changes

router = APIRouter(prefix="/deals")

_with_links = select(
    deals,
    organizations.c.name.label("organization_name"),
    contacts.c.name.label("main_contact_name"),
).select_from(deals.outerjoin(organizations).outerjoin(contacts, deals.c.main_contact_id == contacts.c.id))
_with_names = who.with_names(_with_links, deals)

FUTURE_CLOSE = "A won or lost deal can't have a close date in the future"


def _reply(row: Any) -> schemas.Deal:
    return schemas.Deal(**row._mapping, expected_revenue=rules.expected_revenue(row.value, row.probability))


def _detail(row: Any) -> schemas.DealDetail:
    return schemas.DealDetail(
        **{**row._mapping, **who.authorship(row)},
        expected_revenue=rules.expected_revenue(row.value, row.probability),
    )


def _get(conn, deal_id: int):
    row = conn.execute(_with_names.where(deals.c.id == deal_id)).one_or_none()
    if row is None:
        raise HTTPException(404, "Deal not found")
    return row


def _check_links(conn, fields: dict[str, Any], current: Any = None) -> None:
    """A set link can be changed but not cleared, and a blank one can stay blank."""
    checks = (
        ("organization_id", organizations),
        ("main_contact_id", contacts),
    )
    for field, table in checks:
        if field not in fields:
            continue
        chosen = fields[field]
        found = chosen is None or conn.scalar(select(table.c.id).where(table.c.id == chosen)) is not None
        cleared = chosen is None and (current is None or getattr(current, field) is not None)
        if cleared or not found:
            raise api.FieldError({field: schemas.FIELD_MESSAGES[field]})


def _check_close_date(stage: str, close_date: date | None, today: date) -> None:
    if stage in rules.CLOSED_STAGES and close_date is not None and close_date > today:
        raise api.FieldError({"close_date": FUTURE_CLOSE})


@router.get("")
def list_deals() -> list[schemas.Deal]:
    with db.reading() as conn:
        rows = conn.execute(_with_links.order_by(deals.c.stage, deals.c.position, deals.c.id)).all()
    return [_reply(row) for row in rows]


@router.post("", status_code=201)
def add_deal(body: schemas.DealCreate, user: CurrentUser, today: api.Today, now: api.Now) -> schemas.DealDetail:
    values = body.model_dump()
    if values["close_date"] is None and values["stage"] in rules.OPEN_STAGES:
        raise api.FieldError({"close_date": schemas.FIELD_MESSAGES["close_date"]})
    _check_close_date(values["stage"], values["close_date"], today)
    with db.writing() as conn:
        _check_links(conn, values)
        return _detail(_get(conn, rules.add_deal(conn, values, today=today, now=now, user_id=user)))


@router.get("/{deal_id}")
def get_deal(deal_id: api.PathId) -> schemas.DealDetail:
    with db.reading() as conn:
        return _detail(_get(conn, deal_id))


@router.patch("/{deal_id}")
def edit_deal(
    deal_id: api.PathId,
    body: schemas.DealUpdate,
    user: CurrentUser,
    today: api.Today,
    now: api.Now,
) -> schemas.DealDetail:
    fields = body.model_dump(exclude_unset=True)
    with db.writing() as conn:
        current = _get(conn, deal_id)
        _check_links(conn, fields, current)

        stage = fields.pop("stage", current.stage)
        moving = stage != current.stage
        final_close = fields.get("close_date")
        if final_close is None and not (moving and stage in rules.CLOSED_STAGES):
            final_close = current.close_date
        _check_close_date(stage, final_close, today)

        # Links go first, so a deal won in this same edit reaches its new contact.
        given = {key: fields.pop(key) for key in ("probability", "close_date") if moving and key in fields}
        altered = who.alterations(fields, current)
        if altered:
            conn.execute(update(deals).where(deals.c.id == deal_id).values(**altered, **who.changed(user, now)))
        if moving:
            rules.change_stage(conn, deal_id, stage, today=today, now=now, user_id=user, **given)
        return _detail(_get(conn, deal_id))


@router.post("/{deal_id}/move")
def move_deal(
    deal_id: api.PathId,
    body: schemas.DealMove,
    user: CurrentUser,
    today: api.Today,
    now: api.Now,
) -> schemas.MoveResult:
    with db.writing() as conn:
        _get(conn, deal_id)
        result = rules.change_stage(conn, deal_id, body.stage, today=today, now=now, user_id=user, to_top=False)
        # A card dropped on itself stays put, unless it's changed column and isn't there yet.
        if result.changed or body.before_deal_id != deal_id:
            rules.place_deal(conn, deal_id, body.stage, body.before_deal_id, now=now, user_id=user)
        return schemas.MoveResult(
            deal=_reply(_get(conn, deal_id)),
            changes=schemas.MoveChanges(close_date=result.close_date, new_customer=result.new_customer),
        )


@router.delete("/{deal_id}", status_code=204)
def delete_deal(deal_id: api.PathId, holders: holds.Holds) -> None:
    with db.writing() as conn:
        _get(conn, deal_id)
        holds.refuse_if_held(conn, holders, deals, deal_id, "deal")
        conn.execute(delete(deals).where(deals.c.id == deal_id))


@router.get("/{deal_id}/delete-impact")
def deal_impact(deal_id: api.PathId, holders: holds.Holds) -> schemas.DealImpact:
    with db.reading() as conn:
        row = _get(conn, deal_id)
        return schemas.DealImpact(
            activities=conn.execute(
                select(func.count()).select_from(activities).where(activities.c.deal_id == deal_id)
            ).scalar_one(),
            stage_changes=conn.execute(
                select(func.count()).select_from(stage_changes).where(stage_changes.c.deal_id == deal_id)
            ).scalar_one(),
            won=row.stage == "won",
            value=row.value,
            held_by=holds.holding(conn, holders, deals, deal_id),
        )


@router.get("/{deal_id}/timeline")
def deal_timeline(
    deal_id: api.PathId,
    limit: api.PageLimit = timeline.DEFAULT_LIMIT,
    offset: api.PageOffset = 0,
) -> schemas.Timeline:
    with db.reading() as conn:
        page = timeline.for_deal(conn, deal_id, limit, offset)
    if page is None:
        raise HTTPException(404, "Deal not found")
    return page
