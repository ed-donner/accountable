"""The books' replies (J12) and the messages for the fields of its reads."""

import re
from datetime import date
from typing import Annotated, Literal

from fastapi import Query
from pydantic import AfterValidator, BaseModel

from accountable.api import CentsSum, PageOffset, UtcTime
from accountable.books import accounts, profit_and_loss
from accountable.users import Person

DATE_MESSAGE = "Enter a date, such as 2026-12-31"
MONTH_MESSAGE = "Choose a month, such as 2026-12"
RANGE_MESSAGE = "The first month can't be after the last"
TOO_MANY_MONTHS = "Choose up to 60 months"
ACCOUNT_MESSAGE = "Choose one of the books' accounts"
LIMIT_MESSAGE = "Choose a number from 1 to 500"
PERIOD_MESSAGE = "Choose a month, quarter or year"
FIGURE_MESSAGE = "Choose a figure from the statement"
FUTURE_MESSAGE = "The date can't be in the future"

FIELD_MESSAGES = {
    "on": DATE_MESSAGE,
    "from": DATE_MESSAGE,
    "to": DATE_MESSAGE,
    "account": ACCOUNT_MESSAGE,
    "limit": LIMIT_MESSAGE,
    "period": PERIOD_MESSAGE,
    "figure": FIGURE_MESSAGE,
}

MAX_MONTHS = 60
FIRST_MONTH = "1000-01"
DEFAULT_LIMIT = 100

_MONTH = re.compile(r"[1-9][0-9]{3}-(0[1-9]|1[0-2])")


def _month(value: str) -> str:
    if not _MONTH.fullmatch(value):
        raise ValueError(MONTH_MESSAGE)
    return value


def _account(value: str) -> str:
    if value not in accounts.BY_KEY:
        raise ValueError(ACCOUNT_MESSAGE)
    return value


MonthQuery = Annotated[str, Query(), AfterValidator(_month)]
AccountQuery = Annotated[str, Query(), AfterValidator(_account)]
Limit = Annotated[int, Query(ge=1, le=500)]
Offset = PageOffset


class Balance(BaseModel):
    key: str
    name: str
    type: str
    balance_cents: CentsSum


class Balances(BaseModel):
    on: date
    accounts: list[Balance]


class MonthAccount(BaseModel):
    key: str
    debit_cents: CentsSum
    credit_cents: CentsSum
    balance_cents: CentsSum
    """At the month's end."""


class Month(BaseModel):
    month: str
    """Such as "2026-12"."""
    label: str
    year: int
    accounts: list[MonthAccount]


class Months(BaseModel):
    months: list[Month]


class Line(BaseModel):
    account: str
    debit_cents: int
    credit_cents: int


class Entry(BaseModel):
    id: int
    entry_date: date
    kind: str
    source_id: int
    event: str
    link: str
    reverses_id: int | None
    reversed_by_id: int | None
    created_by: Person | None
    created_at: UtcTime
    lines: list[Line]
    label: str | None = None
    """What the source is called, such as an invoice's number, or nothing if it has been deleted or has no name."""


class Entries(BaseModel):
    total: int
    entries: list[Entry]


def _figure(value: str) -> str:
    if value not in profit_and_loss.FIGURES:
        raise ValueError(FIGURE_MESSAGE)
    return value


FigureQuery = Annotated[str, Query(), AfterValidator(_figure)]
PeriodQuery = Annotated[Literal["month", "quarter", "year"], Query()]


class Change(BaseModel):
    kind: Literal["percent", "points", "new", "none"]
    value: int | None
    """A whole percent, or tenths of a point, or nothing."""


class CategoryAmount(BaseModel):
    category: str
    """The bill category's key, such as "software"."""
    name: str
    cents: CentsSum


class Figures(BaseModel):
    revenue_cents: CentsSum
    categories: list[CategoryAmount]
    expenses_cents: CentsSum
    profit_cents: CentsSum
    margin_tenths: int | None


class ChartMonth(Figures):
    month: str
    label: str
    year: int
    first: date
    last: date


class Changes(BaseModel):
    revenue: Change
    categories: list[Change]
    expenses: Change
    profit: Change
    margin: Change


class PeriodFigures(Figures):
    kind: str
    label: str
    first: date
    last: date


class ShownPeriod(PeriodFigures):
    current: bool
    back_on: date | None
    forward_on: date | None
    changes: Changes


class ProfitAndLoss(BaseModel):
    today: date
    months: list[ChartMonth]
    period: ShownPeriod
    previous: PeriodFigures | None


class FigureEntry(Entry):
    amount: CentsSum
    """On the figure, with a minus sign where it takes the figure down."""


class FigureEntries(BaseModel):
    figure: str
    count: int
    total: CentsSum
    """The figure for the range: the sum of every entry's amount, on every page."""
    entries: list[FigureEntry]
