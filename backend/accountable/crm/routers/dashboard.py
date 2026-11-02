"""The dashboard's figures and the funnel, all in one reply."""

from collections.abc import Iterable, Sequence
from datetime import date
from typing import Any

from fastapi import APIRouter
from sqlalchemy import and_, select

from accountable import db
from accountable.crm import rules, schemas, timeline
from accountable.crm.tables import activities, contacts, deals, stage_changes

router = APIRouter()

MONTHS = 12
RECENT = 10
FUNNEL_STAGES = rules.STAGES[:5]  # New to Won. Lost isn't a step on the way to a sale.
MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def whole_percent(part: int, whole: int) -> int:
    """A percentage, with halves rounding up. Zero when there's nothing to divide by."""
    return 0 if whole == 0 else (part * 200 + whole) // (whole * 2)


def month_series(won: Iterable[Any], today: date) -> list[schemas.MonthFigures]:
    index = today.year * 12 + today.month - 1
    months = []
    for back in range(MONTHS - 1, -1, -1):
        year, month = (index - back) // 12, (index - back) % 12 + 1
        months.append(
            schemas.MonthFigures(month=f"{year}-{month:02d}", label=MONTH_LABELS[month - 1], revenue=0, deals=0)
        )
    by_month = {item.month: item for item in months}
    for deal in won:
        item = by_month.get(f"{deal.close_date.year}-{deal.close_date.month:02d}")
        if item is not None:
            item.revenue += deal.value
            item.deals += 1
    return months


def funnel(all_deals: Sequence[Any], changes: Iterable[Any]) -> list[schemas.FunnelStage]:
    """Value that has reached each stage, from each deal's furthest stage so far.

    The history is what counts, so moving back removes nothing. Being lost isn't
    a step: a lost deal counts up to the furthest stage it reached before that.
    """
    rank = {stage: place for place, stage in enumerate(FUNNEL_STAGES)}
    furthest = {deal.id: rank.get(deal.stage, 0) for deal in all_deals}
    for change in changes:
        for stage in (change.from_stage, change.to_stage):
            if stage in rank:
                furthest[change.deal_id] = max(furthest[change.deal_id], rank[stage])

    reached = [0] * len(FUNNEL_STAGES)
    for deal in all_deals:
        for place in range(furthest[deal.id] + 1):
            reached[place] += deal.value

    return [
        schemas.FunnelStage(
            stage=stage,
            value=reached[place],
            carried=None
            if place == 0 or reached[place - 1] == 0
            else whole_percent(reached[place], reached[place - 1]),
        )
        for place, stage in enumerate(FUNNEL_STAGES)
    ]


def follow_ups(conn, today: date) -> schemas.FollowUps:
    rows = conn.execute(
        select(
            activities.c.id,
            activities.c.description,
            activities.c.follow_up_date,
            activities.c.contact_id,
            contacts.c.name.label("contact_name"),
            activities.c.deal_id,
            deals.c.name.label("deal_name"),
        )
        .select_from(timeline.activities_with_names)
        .where(and_(activities.c.follow_up_date.is_not(None), activities.c.follow_up_done.is_(False)))
        .order_by(activities.c.follow_up_date, activities.c.id)
    ).all()
    items = [
        schemas.FollowUp(
            id=row.id,
            description=row.description,
            follow_up_date=row.follow_up_date,
            overdue=row.follow_up_date < today,
            about=(
                schemas.About(kind="deal", id=row.deal_id, name=row.deal_name)
                if row.deal_id is not None
                else schemas.About(kind="contact", id=row.contact_id, name=row.contact_name)
            ),
        )
        for row in rows
    ]
    overdue = sum(item.overdue for item in items)
    return schemas.FollowUps(overdue=overdue, upcoming=len(items) - overdue, items=items)


@router.get("/dashboard")
def dashboard(today: schemas.Today, now: schemas.Now) -> schemas.Dashboard:
    with db.reading() as conn:
        all_deals = conn.execute(
            select(deals.c.id, deals.c.stage, deals.c.value, deals.c.probability, deals.c.close_date)
        ).all()
        changes = conn.execute(
            select(stage_changes.c.deal_id, stage_changes.c.from_stage, stage_changes.c.to_stage)
        ).all()
        waiting = follow_ups(conn, today)
        recent = timeline.recent(conn, now, RECENT)

    open_deals = [deal for deal in all_deals if deal.stage in rules.OPEN_STAGES]
    months = month_series([deal for deal in all_deals if deal.stage == "won"], today)
    open_value = sum(deal.value for deal in open_deals)
    expected = rules.expected_total(open_deals)

    return schemas.Dashboard(
        today=today,
        overdue_follow_ups=waiting.overdue,
        late_deals=sum(rules.is_late(deal.stage, deal.close_date, today) for deal in open_deals),
        revenue_this_month=months[-1].revenue,
        revenue_last_month=months[-2].revenue,
        deals_won_this_month=months[-1].deals,
        deals_won_last_month=months[-2].deals,
        open_pipeline=open_value,
        open_deals=len(open_deals),
        expected_revenue=expected,
        expected_share=whole_percent(expected, open_value),
        months=months,
        band=[
            schemas.BandStage(
                stage=stage,
                value=sum(deal.value for deal in open_deals if deal.stage == stage),
                count=sum(deal.stage == stage for deal in open_deals),
            )
            for stage in rules.OPEN_STAGES
        ],
        funnel=funnel(all_deals, changes),
        follow_ups=waiting,
        recent=recent,
    )
