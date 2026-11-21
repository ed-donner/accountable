"""Deals: endpoints, queries, board moves and card positions."""

from datetime import date, datetime
from typing import Annotated

from fastapi import APIRouter, Query
from sqlalchemy import Connection, delete, func, insert, select, update

from app import rules
from app.db import activities, contacts, deals, organizations, stage_changes
from app.deps import Conn, Today, now_on
from app.rules import Stage
from app.schemas import MESSAGES, DealCreate, DealImpact, DealList, DealMove, DealRow, DealUpdate, FieldErrors, NotFound

router = APIRouter(prefix="/deals", tags=["deals"])

# --- Card positions (P4, P7) -----------------------------------------------
# Lower is higher up the column. A card dropped between two others takes the
# midpoint; at the top or bottom it's one past the end. When the gap gets too
# small the column is renumbered 1, 2, 3 in the same transaction (R5).

MIN_GAP = 0.000001


def position_between(above: float | None, below: float | None) -> float | None:
    """The position for a card between `above` and `below`, or None when the gap is too small."""
    if above is None and below is None:
        return 1.0
    if above is None:
        return below - 1.0
    if below is None:
        return above + 1.0
    middle = (above + below) / 2
    if middle - above < MIN_GAP or below - middle < MIN_GAP:
        return None
    return middle


def renumber_column(conn: Connection, stage: str, exclude_id: int | None = None) -> None:
    query = select(deals.c.id).where(deals.c.stage == stage).order_by(deals.c.position, deals.c.id)
    if exclude_id is not None:
        query = query.where(deals.c.id != exclude_id)
    for number, deal_id in enumerate(conn.scalars(query).all(), start=1):
        conn.execute(update(deals).where(deals.c.id == deal_id).values(position=float(number)))


def _position_of(conn: Connection, deal_id: int | None) -> float | None:
    if deal_id is None:
        return None
    return conn.scalar(select(deals.c.position).where(deals.c.id == deal_id))


def place_between(
    conn: Connection, stage: str, moving_id: int | None, above_id: int | None, below_id: int | None
) -> float:
    """Position for a card landing under `above_id` and over `below_id` in `stage`."""
    position = position_between(_position_of(conn, above_id), _position_of(conn, below_id))
    if position is None:
        renumber_column(conn, stage, exclude_id=moving_id)
        position = position_between(_position_of(conn, above_id), _position_of(conn, below_id))
    assert position is not None
    return position


def top_position(conn: Connection, stage: str, exclude_id: int | None = None) -> float:
    """Position at the top of a column, for a new deal (P7)."""
    query = select(func.min(deals.c.position)).where(deals.c.stage == stage)
    if exclude_id is not None:
        query = query.where(deals.c.id != exclude_id)
    lowest = conn.scalar(query)
    return 1.0 if lowest is None else lowest - 1.0


# --- Queries ----------------------------------------------------------------


def deal_rows(conn: Connection, today: date, *where, order_by=None) -> list[dict]:
    """Deals with their organization and contact names, expected revenue and lateness."""
    query = (
        select(
            deals,
            organizations.c.name.label("organization_name"),
            contacts.c.name.label("contact_name"),
        )
        .select_from(
            deals.outerjoin(organizations, organizations.c.id == deals.c.organization_id).outerjoin(
                contacts, contacts.c.id == deals.c.contact_id
            )
        )
        .where(*where)
        .order_by(*(order_by if order_by is not None else [deals.c.name, deals.c.id]))
    )
    rows = []
    for row in conn.execute(query).mappings():
        item = dict(row)
        item["expected_revenue"] = rules.expected_revenue(item["value"], item["probability"])
        item["is_late"] = rules.is_late(item["stage"], item["close_date"], today)
        rows.append(item)
    return rows


def get_deal(conn: Connection, deal_id: int, today: date) -> dict:
    rows = deal_rows(conn, today, deals.c.id == deal_id)
    if not rows:
        raise NotFound("deal")
    return rows[0]


def _check_links(conn: Connection, organization_id: int | None, contact_id: int | None) -> None:
    errors = {}
    if organization_id is not None and not conn.scalar(
        select(organizations.c.id).where(organizations.c.id == organization_id)
    ):
        errors["organization_id"] = "That organization no longer exists. Choose another."
    if contact_id is not None and not conn.scalar(select(contacts.c.id).where(contacts.c.id == contact_id)):
        errors["contact_id"] = "That contact no longer exists. Choose another."
    if errors:
        raise FieldErrors(errors)


def _record_stage_change(conn: Connection, deal_id: int, old: str | None, new: str, today: date) -> None:
    """D6: every stage change leaves an entry.

    changed_at is on the user's today; created_at is the real clock, like an activity's,
    so timelines can order entries made on the same day.
    """
    created = datetime.now()
    conn.execute(
        insert(stage_changes).values(
            deal_id=deal_id,
            from_stage=old,
            to_stage=new,
            changed_at=now_on(today),
            created_at=created,
            updated_at=created,
        )
    )


def _make_customer(conn: Connection, contact_id: int | None) -> None:
    """D5: a win makes the main contact a customer, never lowering a status."""
    if contact_id is None:
        return
    current = conn.scalar(select(contacts.c.status).where(contacts.c.id == contact_id))
    if current is None:
        return
    raised = rules.status_after_win(current)
    if raised != current:
        conn.execute(update(contacts).where(contacts.c.id == contact_id).values(status=raised))


def _apply_stage(conn: Connection, deal: dict, values: dict, sent: dict, today: date) -> dict:
    """D3 to D6 for a change of stage. `sent` is what the client asked for, which
    wins over the stage's defaults when it changed probability or close date itself."""
    new_stage = values.get("stage", deal["stage"])
    changes = rules.stage_change_updates(deal["stage"], new_stage, today)
    if not changes:
        return values
    for field in ("probability", "close_date"):
        if field in changes and field in sent and sent[field] != deal[field]:
            changes.pop(field)
    values = {**values, **changes}
    values["position"] = top_position(conn, new_stage, exclude_id=deal["id"])
    _record_stage_change(conn, deal["id"], deal["stage"], new_stage, today)
    if new_stage == "won":
        _make_customer(conn, values.get("contact_id", deal["contact_id"]))
    return values


# --- Endpoints --------------------------------------------------------------


@router.get("")
def list_deals(
    conn: Conn,
    today: Today,
    stage: Stage | None = None,
    limit: Annotated[int | None, Query(ge=1)] = None,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> DealList:
    where = [deals.c.stage == stage] if stage else []
    rows = deal_rows(conn, today, *where)
    return DealList(items=rows[offset : offset + limit if limit else None], total=len(rows))


@router.post("", status_code=201)
def create_deal(body: DealCreate, conn: Conn, today: Today) -> DealRow:
    _check_links(conn, body.organization_id, body.contact_id)
    close_date = body.close_date
    if body.stage in rules.CLOSED_STAGES and close_date is None:
        close_date = today
    if error := rules.close_date_error(body.stage, close_date, today):
        raise FieldErrors({"close_date": error})
    probability = body.probability if body.probability is not None else rules.usual_probability(body.stage)
    deal_id = conn.execute(
        insert(deals).values(
            name=body.name,
            organization_id=body.organization_id,
            contact_id=body.contact_id,
            stage=body.stage,
            value=body.value,
            probability=probability,
            close_date=close_date,
            position=top_position(conn, body.stage),
        )
    ).inserted_primary_key[0]
    _record_stage_change(conn, deal_id, None, body.stage, today)
    if body.stage == "won":
        _make_customer(conn, body.contact_id)
    conn.commit()
    return DealRow(**get_deal(conn, deal_id, today))


@router.get("/{deal_id}")
def read_deal(deal_id: int, conn: Conn, today: Today) -> DealRow:
    return DealRow(**get_deal(conn, deal_id, today))


@router.patch("/{deal_id}")
def update_deal(deal_id: int, body: DealUpdate, conn: Conn, today: Today) -> DealRow:
    deal = get_deal(conn, deal_id, today)
    sent = body.model_dump(exclude_unset=True)
    # Concern 1: required, unless it's already empty because its organization was deleted.
    if "organization_id" in sent and sent["organization_id"] is None and deal["organization_id"] is not None:
        raise FieldErrors({"organization_id": MESSAGES["organization_id"]})
    _check_links(conn, sent.get("organization_id"), sent.get("contact_id"))
    values = _apply_stage(conn, deal, dict(sent), sent, today)
    stage = values.get("stage", deal["stage"])
    close_date = values.get("close_date", deal["close_date"])
    if error := rules.close_date_error(stage, close_date, today):
        raise FieldErrors({"close_date": error})
    if values:
        conn.execute(update(deals).where(deals.c.id == deal_id).values(**values))
    conn.commit()
    return DealRow(**get_deal(conn, deal_id, today))


@router.post("/{deal_id}/move")
def move_deal(deal_id: int, body: DealMove, conn: Conn, today: Today) -> DealRow:
    """P3, P4: change stage and place in one transaction. `after_id` is the card
    it lands under and `before_id` the card it lands over."""
    deal = get_deal(conn, deal_id, today)
    for field in ("before_id", "after_id"):
        neighbor = getattr(body, field)
        if neighbor is None:
            continue
        stage = conn.scalar(select(deals.c.stage).where(deals.c.id == neighbor))
        if neighbor == deal_id or stage != body.stage:
            raise FieldErrors({field: MESSAGES[field]})
    values = _apply_stage(conn, deal, {"stage": body.stage}, {}, today)
    values["position"] = place_between(conn, body.stage, deal_id, body.after_id, body.before_id)
    conn.execute(update(deals).where(deals.c.id == deal_id).values(**values))
    conn.commit()
    return DealRow(**get_deal(conn, deal_id, today))


@router.get("/{deal_id}/delete-impact")
def deal_delete_impact(deal_id: int, conn: Conn, today: Today) -> DealImpact:
    deal = get_deal(conn, deal_id, today)
    return DealImpact(
        name=deal["name"],
        activities=conn.scalar(select(func.count()).where(activities.c.deal_id == deal_id)),
        stage_changes=conn.scalar(select(func.count()).where(stage_changes.c.deal_id == deal_id)),
    )


@router.delete("/{deal_id}", status_code=204)
def delete_deal(deal_id: int, conn: Conn, today: Today) -> None:
    """D10: its activities and stage changes go with it."""
    get_deal(conn, deal_id, today)
    conn.execute(delete(deals).where(deals.c.id == deal_id))
    conn.commit()
