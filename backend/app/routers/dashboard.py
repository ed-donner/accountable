from collections import defaultdict
from datetime import timedelta

from fastapi import APIRouter
from sqlalchemy import Connection, and_, select

from backend.app import clock, rules
from backend.app.db import Conn, activities, deals
from backend.app.queries import entry_out, entry_select, newest_first
from backend.app.schemas import Dashboard

router = APIRouter(prefix="/api", tags=["dashboard"])


def _previous_month(key: str) -> str:
    year, month = int(key[:4]), int(key[5:7])
    month -= 1
    if month == 0:
        year, month = year - 1, 12
    return f"{year:04d}-{month:02d}"


def _funnel(conn: Connection, today) -> list[dict]:
    rows = conn.execute(select(deals.c.id, deals.c.stage, deals.c.value, deals.c.created_at)).all()
    changes = defaultdict(list)
    for change in conn.execute(
        select(activities.c.deal_id, activities.c.from_stage, activities.c.to_stage).where(
            activities.c.type == "stage_change"
        )
    ):
        changes[change.deal_id].append((change.from_stage, change.to_stage))
    # rules.funnel leaves out the deals created before the 12 months. created_at
    # is stored in UTC, so it's turned into a local date to compare with today,
    # which is local. Otherwise a deal added in the evening west of UTC would be
    # dated tomorrow and left out.
    funnel_deals = [
        rules.FunnelDeal(clock.local_date(row.created_at), row.stage, row.value, changes[row.id]) for row in rows
    ]
    return rules.funnel(funnel_deals, today)


@router.get("/dashboard", response_model=Dashboard)
def get_dashboard(conn: Conn):
    """Everything the dashboard shows, worked out from the database each time (DASH-9)."""
    today = clock.today()
    now = clock.now()
    all_deals = conn.execute(select(deals.c.stage, deals.c.value, deals.c.probability, deals.c.close_date)).all()

    # Open pipeline, and by stage (DASH-2, DASH-6). Expected revenue adds up each
    # deal's rounded figure, so it matches the Deals table.
    by_stage = {stage: {"stage": stage, "count": 0, "value": 0, "expected": 0} for stage in rules.OPEN_STAGES}
    for deal in all_deals:
        if rules.is_open(deal.stage):
            figures = by_stage[deal.stage]
            figures["count"] += 1
            figures["value"] += deal.value
            figures["expected"] += rules.expected_value(deal.value, deal.probability)
    open_by_stage = [by_stage[stage] for stage in rules.OPEN_STAGES]

    # Revenue and deals won in each of the 12 months (DASH-3, DASH-4).
    month_keys = rules.months(today)
    months = {key: {"month": key, "revenue": 0, "deals": 0} for key in month_keys}
    this_month = month_keys[-1]
    last_month = _previous_month(this_month)
    last_month_value = 0
    for deal in all_deals:
        if deal.stage != "won":
            continue
        key = rules.month_key(deal.close_date)
        if key in months:
            months[key]["revenue"] += deal.value
            months[key]["deals"] += 1
        if key == last_month:
            last_month_value += deal.value

    # Follow-ups: open, and due on or before today plus 7 days (DASH-7).
    horizon = today + timedelta(days=rules.FOLLOW_UP_DAYS)
    open_follow_up = and_(
        activities.c.follow_up_date.is_not(None),
        activities.c.done.is_(False),
        activities.c.follow_up_date <= horizon,
    )
    follow_ups = []
    for row in conn.execute(
        entry_select().where(open_follow_up).order_by(activities.c.follow_up_date, activities.c.occurred_at, activities.c.id)
    ):
        entry = entry_out(row)
        entry["days_late"] = max(0, (today - row.follow_up_date).days)
        follow_ups.append(entry)

    recent = conn.execute(newest_first(entry_select().where(activities.c.occurred_at <= now)).limit(10))

    return {
        "today": today,
        "open_pipeline": {
            "value": sum(s["value"] for s in open_by_stage),
            "count": sum(s["count"] for s in open_by_stage),
        },
        "expected_revenue": sum(s["expected"] for s in open_by_stage),
        "won_this_month": {
            "value": months[this_month]["revenue"],
            "count": months[this_month]["deals"],
            "last_month_value": last_month_value,
        },
        "follow_up_counts": {
            "overdue": sum(1 for f in follow_ups if f["follow_up_date"] < today),
            "due_soon": sum(1 for f in follow_ups if f["follow_up_date"] >= today),
        },
        "months": [months[key] for key in month_keys],
        "funnel": _funnel(conn, today),
        "open_by_stage": open_by_stage,
        "follow_ups": follow_ups,
        "recent": [entry_out(row) for row in recent],
    }
