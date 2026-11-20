"""The rules (spec 2.4). Pure functions, with no database.

frontend/src/lib/rules.ts repeats the ones the browser needs, and both are
checked against frontend/src/lib/rules-cases.json.
"""

from collections.abc import Iterable
from dataclasses import dataclass, field
from datetime import date, timedelta

STAGES = ("new", "qualified", "proposal", "negotiation", "won", "lost")
OPEN_STAGES = ("new", "qualified", "proposal", "negotiation")
CLOSED_STAGES = ("won", "lost")
FUNNEL_STAGES = ("new", "qualified", "proposal", "negotiation", "won")

STAGE_NAMES = {
    "new": "New",
    "qualified": "Qualified",
    "proposal": "Proposal",
    "negotiation": "Negotiation",
    "won": "Won",
    "lost": "Lost",
}

USUAL_PROBABILITY = {
    "new": 10,
    "qualified": 25,
    "proposal": 50,
    "negotiation": 75,
    "won": 100,
    "lost": 0,
}

CONTACT_STATUSES = ("lead", "qualified", "customer")
ACTIVITY_TYPES = ("note", "call", "email", "stage_change")
LOGGABLE_TYPES = ("note", "call", "email")

CLOSED_WINDOW_DAYS = 30
FOLLOW_UP_DAYS = 7


def is_open(stage: str) -> bool:
    return stage in OPEN_STAGES


def expected_value(value: int, probability: int) -> int:
    """Value times probability, rounded to the nearest dollar, halves up (DEAL-3)."""
    return (value * probability + 50) // 100


def is_late(stage: str, close_date: date, today: date) -> bool:
    """Open, and the close date is before today (DEAL-2)."""
    return is_open(stage) and close_date < today


def closed_window_start(today: date) -> date:
    return today - timedelta(days=CLOSED_WINDOW_DAYS)


def in_closed_window(close_date: date, today: date) -> bool:
    """Shown in the board's Won and Lost columns: closed on or after today minus 30 days (PIPE-2)."""
    return close_date >= closed_window_start(today)


def months(today: date) -> list[str]:
    """The 12 calendar months ending with this one, oldest first, as "YYYY-MM"."""
    result = []
    year, month = today.year, today.month
    for _ in range(12):
        result.append(f"{year:04d}-{month:02d}")
        month -= 1
        if month == 0:
            year, month = year - 1, 12
    return list(reversed(result))


def months_start(today: date) -> date:
    """The first day of the oldest of the 12 months."""
    first = months(today)[0]
    return date(int(first[:4]), int(first[5:7]), 1)


def month_key(day: date) -> str:
    return f"{day.year:04d}-{day.month:02d}"


def furthest_stage(current: str, changes: Iterable[tuple[str | None, str | None]]) -> str:
    """The furthest stage a deal reached, for the funnel (spec 2.4, concern 2).

    That's the highest of its current stage (unless it's Lost) and every from
    and to stage in its stage changes, leaving out Lost. A lost deal with no
    stage changes counts at New only.
    """
    rank = {stage: index for index, stage in enumerate(FUNNEL_STAGES)}
    reached = [current] if current != "lost" else []
    for from_stage, to_stage in changes:
        reached.extend(stage for stage in (from_stage, to_stage) if stage and stage != "lost")
    if not reached:
        return "new"
    return max(reached, key=lambda stage: rank[stage])


@dataclass
class FunnelDeal:
    created_on: date
    stage: str
    value: int
    changes: list[tuple[str | None, str | None]] = field(default_factory=list)


def funnel(deals: Iterable[FunnelDeal], today: date) -> list[dict]:
    """For New to Won, the count and value of the deals created in the last 12
    months that reached each stage. A deal counts at its furthest stage and at
    every stage before it (DASH-5)."""
    start = months_start(today)
    steps = {stage: {"stage": stage, "count": 0, "value": 0} for stage in FUNNEL_STAGES}
    for deal in deals:
        if deal.created_on < start or deal.created_on > today:
            continue
        furthest = furthest_stage(deal.stage, deal.changes)
        for stage in FUNNEL_STAGES[: FUNNEL_STAGES.index(furthest) + 1]:
            steps[stage]["count"] += 1
            steps[stage]["value"] += deal.value
    return [steps[stage] for stage in FUNNEL_STAGES]


def stage_change_description(from_stage: str, to_stage: str) -> str:
    return f"Moved from {STAGE_NAMES[from_stage]} to {STAGE_NAMES[to_stage]}"
