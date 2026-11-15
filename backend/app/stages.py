"""The pipeline stages (R13) and the deal rules (R14–R18), as plain functions with no database."""

from datetime import date

# (name, usual probability of close, open?)
STAGES = [
    ("New", 10, True),
    ("Qualified", 25, True),
    ("Proposal", 50, True),
    ("Negotiation", 75, True),
    ("Won", 100, False),
    ("Lost", 0, False),
]
STAGE_NAMES = [name for name, _, _ in STAGES]
PROBABILITY = {name: p for name, p, _ in STAGES}
OPEN_STAGES = [name for name, _, is_open_stage in STAGES if is_open_stage]
CLOSED_STAGES = ["Won", "Lost"]


def stage_list() -> list[dict]:
    return [{"name": n, "probability": p, "open": o} for n, p, o in STAGES]


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
