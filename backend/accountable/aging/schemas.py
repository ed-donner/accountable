"""The aged balances' replies (X6, X7) and the message for its one field, the day shown."""

from datetime import date

from pydantic import BaseModel

from accountable.aging.ages import Part
from accountable.api import CentsSum

ON_MESSAGE = "Choose today or an earlier day"
FIELD_MESSAGES = {"on": ON_MESSAGE}


class PartSum(BaseModel):
    key: Part
    cents: CentsSum
    count: int


class Item(BaseModel):
    id: int
    number: str
    due_on: date
    days_past_due: int
    """Negative or 0 when it's not yet due."""
    part: Part
    cents: CentsSum
    """What's still owed on it on the day shown."""


class Row(BaseModel):
    id: int
    name: str
    parts: list[PartSum]
    """The five parts, in order."""
    total_cents: CentsSum
    oldest_days_past_due: int
    items: list[Item]
    """Oldest due date first, then by number."""


class Totals(BaseModel):
    parts: list[PartSum]
    total_cents: CentsSum


class AgedBalances(BaseModel):
    today: date
    """The backend's, so the page can tell when the day has passed it (X9)."""
    on: date
    """The day shown."""
    rows: list[Row]
    totals: Totals
