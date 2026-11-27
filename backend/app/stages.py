"""The pipeline stages (R13) and the deal rules (R14–R18), as plain functions with no database."""

from datetime import date
from typing import Literal, get_args

# The one list of stages, in pipeline order. Everything else (the API's types, the
# database check, the funnel) is built from it, so adding a stage starts here.
Stage = Literal["New", "Qualified", "Proposal", "Negotiation", "Won", "Lost"]
STAGE_NAMES: list[Stage] = list(get_args(Stage))

# The usual probability of closing, per stage.
PROBABILITY: dict[Stage, int] = {"New": 10, "Qualified": 25, "Proposal": 50, "Negotiation": 75, "Won": 100, "Lost": 0}
CLOSED_STAGES: list[Stage] = ["Won", "Lost"]
OPEN_STAGES: list[Stage] = [s for s in STAGE_NAMES if s not in CLOSED_STAGES]
# R48: the funnel runs from New to Won; Lost deals count at the furthest stage they reached.
FUNNEL_STAGES: list[Stage] = [s for s in STAGE_NAMES if s != "Lost"]


def stage_list() -> list[dict]:
    return [{"name": s, "probability": PROBABILITY[s], "open": is_open(s)} for s in STAGE_NAMES]


def stage_index(stage: str) -> int:
    return STAGE_NAMES.index(stage)


def is_open(stage: str) -> bool:
    return stage in OPEN_STAGES


def probability_for_new_deal(stage: str, given: int | None) -> int:
    """R14: a new deal takes its stage's probability unless one is entered."""
    return PROBABILITY[stage] if given is None else given


def probability_after_change(old_stage: str, new_stage: str, current: int) -> int:
    """R15: a stage change takes the new stage's probability, replacing a hand-set one."""
    return PROBABILITY[new_stage] if new_stage != old_stage else current


def close_date_after_change(old_stage: str, new_stage: str, current: date, today: date) -> date:
    """R16: moving into Won or Lost sets the close date to today; moving out leaves it."""
    if new_stage != old_stage and new_stage in CLOSED_STAGES:
        return today
    return current


def is_late(stage: str, close_date: date, today: date) -> bool:
    """R17: open, and the close date is before today."""
    return is_open(stage) and close_date < today


def expected_cents(value_cents: int, probability: int) -> int:
    """R18: value × probability ÷ 100, rounded half up to whole cents."""
    return (value_cents * probability + 50) // 100
