"""What an area's money gives the cash flow (Y1 to Y22): the money that came in or went out, as a
total for each day, and the money still expected, each thing with the day it would be paid.

Each area that moves money says so as a Cash, and main.py puts every area's on the app. The
cash flow's routes read them from there, so they never name the areas whose money they show,
as the delete routes never name the areas that hold a record (holds.py).
"""

from collections.abc import Callable, Sequence
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Annotated, Literal

from fastapi import Depends, Request
from sqlalchemy import Connection, Row

Flow = Literal["in", "out", "likely"]
"""Money coming in, money going out, or the likely deals, which are drawn apart from the forecast (Y14)."""


@dataclass(frozen=True)
class Day:
    """The money that moved on one day, and how many payments or bills it came from."""

    on: date
    cents: int
    count: int


@dataclass(frozen=True)
class Item:
    """One thing still to be paid, as a month's list shows it (Y17)."""

    id: int
    name: str
    """An invoice's number, a bill's bill number or a deal's name."""
    organization: str | None
    due_on: date
    """An invoice's or a bill's due date, or a deal's close date."""
    pays_on: date
    """The day it would be paid, before expected_on() moves anything earlier to tomorrow."""
    cents: int
    days_paid_late: int | None = None
    """For an invoice, the average days paid late its date takes from its customer (Y6)."""


@dataclass(frozen=True)
class Cash:
    """One area's money, for the cash flow."""

    flow: Flow
    moved: Callable[[Connection, date], Sequence[Day]] | None
    """The days money moved, from the given day on. None for the likely deals, which haven't moved any."""
    expected: Callable[[Connection, Row], Sequence[Item]]
    """What's still to be paid, given the company settings as current_settings() reads them, so
    an area needing a setting, such as the payment terms, reads none of its own."""


def expected_on(day: date, today: date) -> date:
    """The later of the day and tomorrow, because the forecast starts tomorrow (Y5, Y7, Y13)."""
    return max(day, today + timedelta(days=1))


def app_cash(request: Request) -> Sequence[Cash]:
    """Every area's cash, which main.py puts on the app. Tests can stand in for it."""
    return request.app.state.cash


AppCash = Annotated[Sequence[Cash], Depends(app_cash)]
