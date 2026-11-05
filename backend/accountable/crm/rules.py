"""Stage rules, usual probabilities and expected revenue.

Today, the current time and the person making the change are always arguments,
so tests and the sample data can choose them.
"""

from collections.abc import Iterable
from dataclasses import dataclass
from datetime import date, datetime
from typing import Any

from sqlalchemy import Connection, bindparam, func, insert, select, update

from accountable import who
from accountable.crm.tables import contacts, deals, stage_changes

STAGES = ["new", "qualified", "proposal", "negotiation", "won", "lost"]
OPEN_STAGES = STAGES[:4]
CLOSED_STAGES = STAGES[4:]

STAGE_NAMES = {stage: stage.capitalize() for stage in STAGES}

USUAL_PROBABILITY = {
    "new": 5,
    "qualified": 20,
    "proposal": 40,
    "negotiation": 70,
    "won": 100,
    "lost": 0,
}

CONTACT_STATUSES = ["lead", "qualified", "customer"]
ACTIVITY_TYPES = ["note", "call", "email"]


def expected_revenue(value: int, probability: int) -> int:
    """Value times probability, to the nearest dollar, with halves rounding up.

    Whole-number arithmetic only: Python's round() sends halves to the nearest
    even number, so $1,010 at 5% would be $50 here and $51 in the browser.
    """
    return (value * probability + 50) // 100


def expected_total(rows: Iterable[Any]) -> int:
    """Adds up the expected revenue of open deals, rounding each deal first."""
    return sum(expected_revenue(row.value, row.probability) for row in rows if row.stage in OPEN_STAGES)


def is_late(stage: str, close_date: date, today: date) -> bool:
    return stage in OPEN_STAGES and close_date < today


@dataclass
class StageResult:
    """What a stage change did, beyond the stage itself."""

    changed: bool = False
    close_date: date | None = None
    new_customer: str | None = None


def top_position(conn: Connection, stage: str) -> int:
    lowest = conn.scalar(select(func.min(deals.c.position)).where(deals.c.stage == stage))
    return 0 if lowest is None else lowest - 1


def _make_customer(conn: Connection, contact_id: int | None, *, user_id: str | None, now: datetime) -> str | None:
    """Returns the contact's name if this made them a customer, which counts as a change by whoever won the deal."""
    if contact_id is None:
        return None
    contact = conn.execute(select(contacts).where(contacts.c.id == contact_id)).one_or_none()
    if contact is None or contact.status == "customer":
        return None
    conn.execute(
        update(contacts).where(contacts.c.id == contact_id).values(status="customer", **who.changed(user_id, now))
    )
    return contact.name


def add_deal(conn: Connection, values: dict[str, Any], *, today: date, now: datetime, user_id: str | None) -> int:
    """Adds a deal at the top of its column. Nothing moved, so no stage change is recorded."""
    stage = values["stage"]
    row = dict(values)
    if row.get("probability") is None:
        row["probability"] = USUAL_PROBABILITY[stage]
    if row.get("close_date") is None:
        row["close_date"] = today
    row["position"] = top_position(conn, stage)
    deal_id = conn.execute(insert(deals).values(**row, **who.added(user_id, now)).returning(deals.c.id)).scalar_one()
    if stage == "won":
        _make_customer(conn, row.get("main_contact_id"), user_id=user_id, now=now)
    return deal_id


def change_stage(
    conn: Connection,
    deal_id: int,
    new_stage: str,
    *,
    today: date,
    now: datetime,
    user_id: str | None,
    probability: int | None = None,
    close_date: date | None = None,
    value: int | None = None,
    to_top: bool = True,
) -> StageResult:
    """The one way a deal changes stage, however that's asked for.

    A probability or close date passed in is what this request gave, and is kept. A value
    passed in is set too, as accepting a quote sets the deal's value to the quote's, so a
    later area never writes the deal itself.
    The caller's transaction covers all of it, so a failure leaves nothing done.
    """
    deal = conn.execute(select(deals).where(deals.c.id == deal_id)).one()
    if new_stage == deal.stage:
        return StageResult()

    conn.execute(
        insert(stage_changes).values(
            deal_id=deal_id,
            from_stage=deal.stage,
            to_stage=new_stage,
            changed_at=now,
            created_at=now,
            created_by=user_id,
        )
    )

    values: dict[str, Any] = {
        "stage": new_stage,
        "probability": USUAL_PROBABILITY[new_stage] if probability is None else probability,
        **who.changed(user_id, now),
    }
    result = StageResult(changed=True)
    if new_stage in CLOSED_STAGES:
        values["close_date"] = today if close_date is None else close_date
        result.close_date = values["close_date"]
    elif close_date is not None:
        values["close_date"] = close_date
    if to_top:
        values["position"] = top_position(conn, new_stage)
    if value is not None:
        values["value"] = value

    conn.execute(update(deals).where(deals.c.id == deal_id).values(**values))

    if new_stage == "won":
        result.new_customer = _make_customer(conn, deal.main_contact_id, user_id=user_id, now=now)
    return result


def place_deal(
    conn: Connection, deal_id: int, stage: str, before_deal_id: int | None, *, now: datetime, user_id: str | None
) -> None:
    """Puts a deal just above another in the column, or at the end, and renumbers the column.

    A new place is a change to the deal that moved. Renumbering the others isn't a
    change to them, so it leaves who last changed them, and when, as it was.
    """
    column = conn.scalars(select(deals.c.id).where(deals.c.stage == stage).order_by(deals.c.position, deals.c.id)).all()
    order = [each for each in column if each != deal_id]
    place = order.index(before_deal_id) if before_deal_id in order else len(order)
    order.insert(place, deal_id)
    conn.execute(
        update(deals)
        .where(deals.c.id == bindparam("deal_id"))
        .values(position=bindparam("place"), updated_at=deals.c.updated_at),
        [{"deal_id": each, "place": place} for place, each in enumerate(order)],
    )
    if order != list(column):
        conn.execute(update(deals).where(deals.c.id == deal_id).values(**who.changed(user_id, now)))
