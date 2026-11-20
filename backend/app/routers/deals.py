from fastapi import APIRouter, HTTPException, Response
from sqlalchemy import Connection, delete, func, insert, select, update

from backend.app import clock, rules
from backend.app.db import Conn, activities, contacts, deals, organizations
from backend.app.queries import deal_out, deal_select, entry_out, entry_select, get_deal, newest_first
from backend.app.schemas import Deal, DealCreate, DealImpact, DealMove, DealUpdate, TimelineEntry, bad_field

router = APIRouter(prefix="/api/deals", tags=["deals"])


def _row(conn: Connection, deal_id: int):
    row = conn.execute(select(deals).where(deals.c.id == deal_id)).first()
    if row is None:
        raise HTTPException(404, "Deal not found")
    return row


def _organization_name(conn: Connection, organization_id: int) -> str:
    name = conn.execute(select(organizations.c.name).where(organizations.c.id == organization_id)).scalar()
    if name is None:
        raise bad_field("organization_id", "Choose an organization from the list.", organization_id)
    return name


def _check_main_contact(conn: Connection, contact_id: int | None, organization_id: int) -> None:
    """The main contact must work at the deal's organization."""
    if contact_id is None:
        return
    contact_org = conn.execute(select(contacts.c.organization_id).where(contacts.c.id == contact_id)).first()
    if contact_org is None or contact_org.organization_id != organization_id:
        org_name = _organization_name(conn, organization_id)
        raise bad_field("main_contact_id", f"Choose a contact from {org_name}.", contact_id)


def _column_ids(conn: Connection, stage: str, leaving_out: int | None = None) -> list[int]:
    """The ids in a stage's column, in order. Hidden Won and Lost cards keep their places."""
    query = select(deals.c.id).where(deals.c.stage == stage).order_by(deals.c.position, deals.c.id)
    if leaving_out is not None:
        query = query.where(deals.c.id != leaving_out)
    return list(conn.execute(query).scalars())


def _number(conn: Connection, ids: list[int]) -> None:
    """Number a column's cards from 0, top to bottom."""
    for position, deal_id in enumerate(ids):
        conn.execute(update(deals).where(deals.c.id == deal_id, deals.c.position != position).values(position=position))


def _make_room_at_top(conn: Connection, stage: str) -> None:
    conn.execute(update(deals).where(deals.c.stage == stage).values(position=deals.c.position + 1))


def stage_values(new_stage: str, sent: dict, current_close_date) -> dict:
    """Probability and close date for a deal moving to new_stage (plan, decision 3).

    Probability: a figure sent at an open stage is saved; otherwise the usual
    figure. Won is always 100 and Lost always 0. Close date: a date sent is
    saved; otherwise Won or Lost gets today and any other stage keeps its date.
    """
    if rules.is_open(new_stage) and sent.get("probability") is not None:
        probability = sent["probability"]
    else:
        probability = rules.USUAL_PROBABILITY[new_stage]
    if sent.get("close_date") is not None:
        close_date = sent["close_date"]
    elif new_stage in rules.CLOSED_STAGES:
        close_date = clock.today()
    else:
        close_date = current_close_date
    return {"probability": probability, "close_date": close_date}


def change_stage(conn: Connection, deal, new_stage: str, sent: dict, to_top: bool = True) -> None:
    """Move a deal to another stage (STG-2), for both PATCH and move.

    Sets the probability and close date, puts the deal at the top of its new
    column unless the move places it, numbers the old column again, and adds
    the stage-change entry to its timeline.
    """
    now = clock.now()
    values = stage_values(new_stage, sent, deal.close_date)
    if to_top:
        _make_room_at_top(conn, new_stage)
        values["position"] = 0
    conn.execute(update(deals).where(deals.c.id == deal.id).values(stage=new_stage, updated_at=now, **values))
    _number(conn, _column_ids(conn, deal.stage, leaving_out=deal.id))
    conn.execute(
        insert(activities).values(
            type="stage_change",
            deal_id=deal.id,
            description=rules.stage_change_description(deal.stage, new_stage),
            occurred_at=now,
            done=False,
            from_stage=deal.stage,
            to_stage=new_stage,
            created_at=now,
            updated_at=now,
        )
    )


@router.get("", response_model=list[Deal])
def list_deals(conn: Conn):
    today = clock.today()
    rows = conn.execute(deal_select().order_by(deals.c.close_date, deals.c.id))
    return [deal_out(row, today) for row in rows]


@router.post("", response_model=Deal, status_code=201)
def add_deal(body: DealCreate, conn: Conn):
    _organization_name(conn, body.organization_id)
    _check_main_contact(conn, body.main_contact_id, body.organization_id)
    if body.close_date is None and rules.is_open(body.stage):
        raise bad_field("close_date", "Enter a close date.", None)

    # Adding a deal records no stage change (STG-6), and it goes to the top of its column.
    values = stage_values(body.stage, {"probability": body.probability, "close_date": body.close_date}, None)
    _make_room_at_top(conn, body.stage)
    now = clock.now()
    new_id = conn.execute(
        insert(deals)
        .values(
            name=body.name,
            organization_id=body.organization_id,
            main_contact_id=body.main_contact_id,
            stage=body.stage,
            value=body.value,
            position=0,
            created_at=now,
            updated_at=now,
            **values,
        )
        .returning(deals.c.id)
    ).scalar_one()
    return get_deal(conn, new_id, clock.today())


@router.get("/{deal_id}", response_model=Deal)
def read_deal(deal_id: int, conn: Conn):
    return get_deal(conn, deal_id, clock.today())


@router.patch("/{deal_id}", response_model=Deal)
def change_deal(deal_id: int, body: DealUpdate, conn: Conn):
    deal = _row(conn, deal_id)
    sent = body.model_dump(exclude_unset=True)
    for field in ("name", "organization_id", "stage", "value", "close_date"):
        if field in sent and sent[field] is None:
            raise bad_field(field, "This can't be empty.", None)

    organization_id = sent.get("organization_id", deal.organization_id)
    _organization_name(conn, organization_id)
    if "main_contact_id" in sent:
        main_contact_id = sent["main_contact_id"]
    elif organization_id != deal.organization_id:
        # A new organization without a main contact sent clears the old one.
        main_contact_id = None
    else:
        main_contact_id = deal.main_contact_id
    _check_main_contact(conn, main_contact_id, organization_id)

    plain = {k: v for k, v in sent.items() if k in ("name", "value")}
    plain.update(organization_id=organization_id, main_contact_id=main_contact_id)

    new_stage = sent.get("stage", deal.stage)
    if new_stage != deal.stage:
        conn.execute(update(deals).where(deals.c.id == deal_id).values(**plain))
        change_stage(conn, deal, new_stage, sent)
    else:
        # The same stage: a probability sent at an open stage is kept, and Won
        # and Lost stay at 100 and 0 (STG-3, STG-4).
        if "probability" in sent and sent["probability"] is not None and rules.is_open(deal.stage):
            plain["probability"] = sent["probability"]
        if "close_date" in sent:
            plain["close_date"] = sent["close_date"]
        conn.execute(update(deals).where(deals.c.id == deal_id).values(**plain, updated_at=clock.now()))
    return get_deal(conn, deal_id, clock.today())


@router.post("/{deal_id}/move", response_model=Deal)
def move_deal(deal_id: int, body: DealMove, conn: Conn):
    """Put a card where it was dropped on the board, all in one transaction."""
    deal = _row(conn, deal_id)
    if body.before_id is not None:
        if body.before_id == deal_id:
            raise bad_field("before_id", "A card can't be placed before itself.", body.before_id)
        target = conn.execute(select(deals.c.stage).where(deals.c.id == body.before_id)).scalar()
        if target != body.stage:
            raise bad_field("before_id", "That card isn't in the column the deal was dropped in.", body.before_id)

    if body.stage != deal.stage:
        # Nothing sent, so the usual probability, and today for Won or Lost.
        change_stage(conn, deal, body.stage, {}, to_top=False)
    else:
        conn.execute(update(deals).where(deals.c.id == deal_id).values(updated_at=clock.now()))

    column = _column_ids(conn, body.stage, leaving_out=deal_id)
    place = column.index(body.before_id) if body.before_id is not None else len(column)
    column.insert(place, deal_id)
    _number(conn, column)
    return get_deal(conn, deal_id, clock.today())


@router.get("/{deal_id}/timeline", response_model=list[TimelineEntry])
def deal_timeline(deal_id: int, conn: Conn):
    _row(conn, deal_id)
    rows = conn.execute(newest_first(entry_select().where(activities.c.deal_id == deal_id)))
    return [entry_out(row) for row in rows]


@router.get("/{deal_id}/delete-impact", response_model=DealImpact)
def deal_delete_impact(deal_id: int, conn: Conn):
    _row(conn, deal_id)
    total, stage_changes = conn.execute(
        select(
            func.count(),
            func.count().filter(activities.c.type == "stage_change"),
        ).where(activities.c.deal_id == deal_id)
    ).one()
    return {"activities": total, "stage_changes": stage_changes}


@router.delete("/{deal_id}", status_code=204)
def delete_deal(deal_id: int, conn: Conn):
    """Deletes the deal and its activities, including its stage changes (DEL-5)."""
    deal = _row(conn, deal_id)
    conn.execute(delete(activities).where(activities.c.deal_id == deal_id))
    conn.execute(delete(deals).where(deals.c.id == deal_id))
    _number(conn, _column_ids(conn, deal.stage))
    return Response(status_code=204)
