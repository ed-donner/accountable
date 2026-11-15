"""The Overview figures, all worked out from the current data (R45–R51)."""

from datetime import date

from fastapi import APIRouter
from pydantic import BaseModel
from sqlalchemy import Connection, select

from . import activities, db, settings, stages
from .activities import Activity
from .db import deals
from .stages import Stage

router = APIRouter(tags=["dashboard"])


class StageTotals(BaseModel):
    stage: Stage
    count: int
    value_cents: int
    expected_cents: int


class MonthFigures(BaseModel):
    month: str  # YYYY-MM
    label: str
    year: int
    revenue_cents: int
    won_count: int


class FunnelStep(BaseModel):
    stage: Stage
    count: int
    value_cents: int


class FollowUps(BaseModel):
    overdue: list[Activity]
    today: list[Activity]
    upcoming: list[Activity]


class Dashboard(BaseModel):
    today: date
    open_count: int
    open_value_cents: int
    open_expected_cents: int
    late_count: int
    open_by_stage: list[StageTotals]
    won_this_month: MonthFigures
    win_rate: int | None
    won_last_12: int
    closed_last_12: int
    won_value_last_12_cents: int
    monthly: list[MonthFigures]
    funnel: list[FunnelStep]
    recent_activity: list[Activity]
    follow_ups: FollowUps


MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def last_12_months(today: date) -> list[tuple[int, int]]:
    """(year, month) for the 12 months up to and including the current one, oldest first."""
    months = []
    year, month = today.year, today.month
    for _ in range(12):
        months.append((year, month))
        year, month = (year - 1, 12) if month == 1 else (year, month - 1)
    return list(reversed(months))


def furthest_stage_index(deal: dict, history: dict[int, list[str]]) -> int:
    """R48: Won reaches every stage; an open deal its current one; Lost the furthest it reached first."""
    if deal["stage"] != "Lost":
        return stages.stage_index(deal["stage"])
    reached = [stages.stage_index(s) for s in history.get(deal["id"], []) if s not in ("Lost", None)]
    return max(reached, default=0)


def figures(conn: Connection, today: date) -> dict:
    all_deals = [dict(r) for r in conn.execute(select(deals)).mappings()]
    for d in all_deals:
        d["expected_cents"] = stages.expected_cents(d["value_cents"], d["probability"])

    open_deals = [d for d in all_deals if stages.is_open(d["stage"])]
    open_by_stage = []
    for stage in stages.OPEN_STAGES:
        in_stage = [d for d in open_deals if d["stage"] == stage]
        open_by_stage.append(
            {
                "stage": stage,
                "count": len(in_stage),
                "value_cents": sum(d["value_cents"] for d in in_stage),
                "expected_cents": sum(d["expected_cents"] for d in in_stage),
            }
        )

    # R46, R47: revenue and number of deals won per month, by close date.
    months = last_12_months(today)
    keys = [f"{y:04d}-{m:02d}" for y, m in months]
    by_month = {k: {"revenue_cents": 0, "won_count": 0} for k in keys}
    window_start = f"{keys[0]}-01"
    window_end = f"{keys[-1]}-31"
    won_count = lost_count = 0
    for d in all_deals:
        if stages.is_open(d["stage"]) or not (window_start <= d["close_date"] <= window_end):
            continue
        if d["stage"] == "Won":
            won_count += 1
            month = by_month[d["close_date"][:7]]
            month["revenue_cents"] += d["value_cents"]
            month["won_count"] += 1
        else:
            lost_count += 1
    monthly = [
        {"month": k, "label": MONTH_LABELS[m - 1], "year": y, **by_month[k]}
        for k, (y, m) in zip(keys, months, strict=True)
    ]

    # R48: the value of deals that reached each stage.
    history: dict[int, list[str]] = {}
    a = db.activities
    for deal_id, from_stage, to_stage in conn.execute(
        select(a.c.deal_id, a.c.from_stage, a.c.to_stage).where(a.c.kind == "stage_change")
    ):
        history.setdefault(deal_id, []).extend([from_stage, to_stage])
    reached = {d["id"]: furthest_stage_index(d, history) for d in all_deals}
    funnel = []
    for stage in stages.FUNNEL_STAGES:
        index = stages.stage_index(stage)
        in_funnel = [d for d in all_deals if reached[d["id"]] >= index]
        funnel.append(
            {"stage": stage, "count": len(in_funnel), "value_cents": sum(d["value_cents"] for d in in_funnel)}
        )

    # R50: open follow-ups, grouped.
    follow_ups = {"overdue": [], "today": [], "upcoming": []}
    for item in activities.open_follow_ups(conn):
        follow_ups[item["follow_up_state"]].append(item)

    closed = won_count + lost_count
    return {
        "today": today.isoformat(),
        "open_count": len(open_deals),
        "open_value_cents": sum(d["value_cents"] for d in open_deals),
        "open_expected_cents": sum(d["expected_cents"] for d in open_deals),
        "late_count": sum(1 for d in open_deals if d["close_date"] < today.isoformat()),
        "open_by_stage": open_by_stage,
        "won_this_month": monthly[-1],
        "win_rate": round(won_count * 100 / closed) if closed else None,
        "won_last_12": won_count,
        "closed_last_12": closed,
        "won_value_last_12_cents": sum(m["revenue_cents"] for m in monthly),
        "monthly": monthly,
        "funnel": funnel,
        "recent_activity": activities.recent(conn, 10),
        "follow_ups": follow_ups,
    }


@router.get("/dashboard", response_model=Dashboard)
def get_dashboard() -> dict:
    """Everything the Overview shows, in one response (R45–R50)."""
    with db.transaction() as conn:
        return figures(conn, settings.today())
