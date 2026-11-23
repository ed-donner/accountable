"""Business rules for deals and contacts (D3 to D7, A6). The frontend only shows their results."""

from datetime import date, timedelta
from typing import Literal

Stage = Literal["new", "qualified", "proposal", "negotiation", "won", "lost"]
Status = Literal["lead", "qualified", "customer"]
ActivityType = Literal["note", "call", "email"]
FollowUpStatus = Literal["overdue", "upcoming", "later", "done"]

STAGES: list[Stage] = ["new", "qualified", "proposal", "negotiation", "won", "lost"]
OPEN_STAGES: list[Stage] = ["new", "qualified", "proposal", "negotiation"]
CLOSED_STAGES: list[Stage] = ["won", "lost"]
STAGE_LABELS = {
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
STATUSES: list[Status] = ["lead", "qualified", "customer"]

UPCOMING_DAYS = 7


def usual_probability(stage: str) -> int:
    """D3: each stage's usual probability of close."""
    return USUAL_PROBABILITY[stage]


def is_open(stage: str) -> bool:
    return stage in OPEN_STAGES


def stage_change_updates(old_stage: str | None, new_stage: str, today: date) -> dict:
    """D3 and D4: what changes on a deal when it moves to another stage.

    Returns the fields to set. Empty when the stage doesn't change, so a
    hand-set probability is kept until the next real change.
    """
    if old_stage == new_stage:
        return {}
    updates: dict = {"stage": new_stage, "probability": usual_probability(new_stage)}
    if new_stage in CLOSED_STAGES:
        updates["close_date"] = today
    return updates


def close_date_error(stage: str, close_date: date | None, today: date) -> str | None:
    """D4 and Concern 7: a Won or Lost deal can't close after today."""
    if stage in CLOSED_STAGES and close_date is not None and close_date > today:
        return "A closed deal can't have a close date after today."
    return None


def raised_status(current: Status, target: Status) -> Status:
    """D5: a status only ever goes up, never down."""
    if STATUSES.index(target) > STATUSES.index(current):
        return target
    return current


def status_after_win(current: Status) -> Status:
    return raised_status(current, "customer")


def is_late(stage: str, close_date: date | None, today: date) -> bool:
    """D7: open with a close date before today."""
    return is_open(stage) and close_date is not None and close_date < today


def expected_revenue(value: int, probability: int) -> int:
    return round(value * probability / 100)


def follow_up_status(follow_up_on: date | None, done: bool, today: date) -> FollowUpStatus | None:
    """A6 and Concern 10: done, overdue, upcoming (today to 7 days) or later."""
    if follow_up_on is None:
        return None
    if done:
        return "done"
    if follow_up_on < today:
        return "overdue"
    if follow_up_on <= today + timedelta(days=UPCOMING_DAYS):
        return "upcoming"
    return "later"


def stage_change_text(from_stage: str | None, to_stage: str) -> str:
    if from_stage is None:
        return f"Added in {STAGE_LABELS[to_stage]}"
    return f"Moved from {STAGE_LABELS[from_stage]} to {STAGE_LABELS[to_stage]}"
