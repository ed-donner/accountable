"""Dashboard figures, computed in one request (H1 to H8)."""

from datetime import date, timedelta

from fastapi import APIRouter
from sqlalchemy import Connection, and_, func, select

from app import rules
from app.db import activities, contacts, count_rows, deals, stage_changes
from app.deps import Conn, Today
from app.rules import OPEN_STAGES, Stage
from app.schemas import (
    Dashboard,
    FollowUp,
    FunnelStep,
    Headline,
    MonthFigure,
    RecentItem,
    Ref,
    StageFigure,
)

router = APIRouter(prefix="/dashboard", tags=["dashboard"])

FUNNEL_STAGES: list[Stage] = ["new", "qualified", "proposal", "negotiation", "won"]
RECENT_COUNT = 10


def _month_start(day: date, months_back: int = 0) -> date:
    year, month = day.year, day.month - months_back
    while month <= 0:
        month += 12
        year -= 1
    return date(year, month, 1)


def _headline_and_pipeline(conn: Connection, today: date) -> tuple[Headline, list[StageFigure]]:
    by_stage = {stage: {"count": 0, "value": 0, "expected": 0} for stage in OPEN_STAGES}
    for stage, value, probability in conn.execute(
        select(deals.c.stage, deals.c.value, deals.c.probability).where(
            deals.c.stage.in_(OPEN_STAGES)
        )
    ):
        figures = by_stage[stage]
        figures["count"] += 1
        figures["value"] += value
        figures["expected"] += rules.expected_revenue(value, probability)

    month_start = _month_start(today)
    won_value, won_count = conn.execute(
        select(func.coalesce(func.sum(deals.c.value), 0), func.count()).where(
            deals.c.stage == "won",
            deals.c.close_date >= month_start,
            deals.c.close_date <= today,
        )
    ).one()
    due = activities.c.done.is_(False) & (activities.c.follow_up_on <= today)
    follow_ups_due = count_rows(conn, activities, due)
    overdue = count_rows(
        conn, activities, activities.c.done.is_(False), activities.c.follow_up_on < today
    )

    headline = Headline(
        open_value=sum(f["value"] for f in by_stage.values()),
        open_count=sum(f["count"] for f in by_stage.values()),
        expected_revenue=sum(f["expected"] for f in by_stage.values()),
        won_this_month_value=won_value,
        won_this_month_count=won_count,
        follow_ups_due=follow_ups_due,
        follow_ups_overdue=overdue,
    )
    pipeline = [
        StageFigure(
            stage=stage,
            count=f["count"],
            value=f["value"],
            expected_revenue=f["expected"],
        )
        for stage, f in by_stage.items()
    ]
    return headline, pipeline


def _months(conn: Connection, today: date) -> list[MonthFigure]:
    """H2, H3, Concern 7: the last 12 months ending this month, by close date."""
    first = _month_start(today, 11)
    months = {_month_start(today, back).strftime("%Y-%m"): [0, 0, 0] for back in range(11, -1, -1)}
    query = select(deals.c.stage, deals.c.value, deals.c.close_date).where(
        deals.c.stage.in_(["won", "lost"]),
        deals.c.close_date >= first,
        deals.c.close_date <= today,
    )
    for stage, value, close_date in conn.execute(query):
        figures = months[close_date.strftime("%Y-%m")]
        if stage == "won":
            figures[0] += value
            figures[1] += 1
        else:
            figures[2] += 1
    return [
        MonthFigure(month=m, won_value=f[0], won_count=f[1], lost_count=f[2])
        for m, f in months.items()
    ]


def _funnel(conn: Connection) -> list[FunnelStep]:
    """H5, Concern 6: value of deals at each stage now or past it. Lost deals count
    for the furthest stage they reached before being lost."""
    furthest: dict[int, int] = {}
    for deal_id, stage in conn.execute(select(deals.c.id, deals.c.stage)):
        furthest[deal_id] = FUNNEL_STAGES.index(stage) if stage != "lost" else -1
    for deal_id, to_stage in conn.execute(
        select(stage_changes.c.deal_id, stage_changes.c.to_stage).where(
            stage_changes.c.to_stage != "lost"
        )
    ):
        if deal_id in furthest:
            furthest[deal_id] = max(furthest[deal_id], FUNNEL_STAGES.index(to_stage))
    values = dict(conn.execute(select(deals.c.id, deals.c.value)).all())

    steps: list[FunnelStep] = []
    previous: int | None = None
    for index, stage in enumerate(FUNNEL_STAGES):
        reached = [deal_id for deal_id, reach in furthest.items() if reach >= index]
        value = sum(values[deal_id] for deal_id in reached)
        share = round(value / previous, 4) if previous else None
        steps.append(
            FunnelStep(stage=stage, count=len(reached), value=value, share_of_previous=share)
        )
        previous = value
    return steps


def _recent(conn: Connection) -> list[RecentItem]:
    """H6: the latest activities and stage changes across everything."""
    deal_names = dict(conn.execute(select(deals.c.id, deals.c.name)).all())
    items: list[RecentItem] = []
    activity_query = (
        select(activities, contacts.c.name.label("contact_name"))
        .select_from(activities.outerjoin(contacts, contacts.c.id == activities.c.contact_id))
        .order_by(
            activities.c.occurred_on.desc(),
            activities.c.created_at.desc(),
            activities.c.id.desc(),
        )
        .limit(RECENT_COUNT)
    )
    for row in conn.execute(activity_query).mappings():
        items.append(
            RecentItem(
                kind="activity",
                id=row["id"],
                on=row["occurred_on"],
                at=row["created_at"],
                text=row["description"],
                type=row["type"],
                contact=Ref(id=row["contact_id"], name=row["contact_name"])
                if row["contact_id"]
                else None,
                deal=Ref(id=row["deal_id"], name=deal_names[row["deal_id"]])
                if row["deal_id"]
                else None,
            )
        )
    change_query = (
        select(stage_changes)
        .order_by(stage_changes.c.changed_at.desc(), stage_changes.c.id.desc())
        .limit(RECENT_COUNT)
    )
    for row in conn.execute(change_query).mappings():
        items.append(
            RecentItem(
                kind="stage_change",
                id=row["id"],
                on=row["changed_at"].date(),
                at=row["created_at"],
                text=rules.stage_change_text(row["from_stage"], row["to_stage"]),
                type=None,
                contact=None,
                deal=Ref(id=row["deal_id"], name=deal_names[row["deal_id"]]),
            )
        )
    items.sort(
        key=lambda item: (item.on, item.at, item.kind == "activity", item.id),
        reverse=True,
    )
    return items[:RECENT_COUNT]


def _follow_ups(conn: Connection, today: date) -> list[FollowUp]:
    """H7, A6, Concern 10: overdue oldest first, then today and the next 7 days soonest first."""
    horizon = today + timedelta(days=rules.UPCOMING_DAYS)
    query = (
        select(
            activities,
            contacts.c.name.label("contact_name"),
            deals.c.name.label("deal_name"),
        )
        .select_from(
            activities.outerjoin(contacts, contacts.c.id == activities.c.contact_id).outerjoin(
                deals, deals.c.id == activities.c.deal_id
            )
        )
        .where(and_(activities.c.done.is_(False), activities.c.follow_up_on <= horizon))
        .order_by(activities.c.follow_up_on, activities.c.id)
    )
    items = []
    for row in conn.execute(query).mappings():
        items.append(
            FollowUp(
                id=row["id"],
                type=row["type"],
                description=row["description"],
                follow_up_on=row["follow_up_on"],
                status="overdue" if row["follow_up_on"] < today else "upcoming",
                contact=Ref(id=row["contact_id"], name=row["contact_name"])
                if row["contact_id"]
                else None,
                deal=Ref(id=row["deal_id"], name=row["deal_name"]) if row["deal_id"] else None,
            )
        )
    return items


@router.get("")
def dashboard(conn: Conn, today: Today) -> Dashboard:
    headline, pipeline = _headline_and_pipeline(conn, today)
    return Dashboard(
        today=today,
        headline=headline,
        months=_months(conn, today),
        pipeline=pipeline,
        funnel=_funnel(conn),
        recent=_recent(conn),
        follow_ups=_follow_ups(conn, today),
    )
