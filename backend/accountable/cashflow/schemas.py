"""The cash flow's replies (Y1 to Y22) and the message for its one field, the month of a month's list."""

import re
from datetime import date
from typing import Annotated, Literal

from fastapi import Query
from pydantic import AfterValidator, BaseModel

from accountable.api import CentsSum

MONTH_MESSAGE = "Choose a month, such as 2026-12"
FIELD_MESSAGES = {"month": MONTH_MESSAGE}

MONTH = re.compile(r"[0-9]{4}-(0[1-9]|1[0-2])")


def _month(value: str) -> str:
    if not MONTH.fullmatch(value):
        raise ValueError(MONTH_MESSAGE)
    return value


MonthQuery = Annotated[str, Query(), AfterValidator(_month)]
"""Such as 2026-12. A value that isn't a month is a 422, and one outside the forecast a 404."""

Kind = Literal["past", "current", "forecast"]


class Opening(BaseModel):
    balance_cents: CentsSum
    on: date
    """The cash at the start of this day (B23)."""


class Month(BaseModel):
    """One of the 15 months. A past month's expected and likely figures are 0, since its money has moved."""

    month: str
    """Such as "2026-12"."""
    label: str
    """Such as "Dec"."""
    year: int
    kind: Kind
    in_cents: CentsSum
    """The payments received, so far for this month (Y2, Y3)."""
    in_count: int
    out_cents: CentsSum
    """The bills paid, tax included."""
    out_count: int
    expected_in_cents: CentsSum
    """What's owed on the open invoices expected in it, from tomorrow on (Y5)."""
    expected_in_count: int
    expected_out_cents: CentsSum
    """The unpaid bills expected in it, from tomorrow on (Y7)."""
    expected_out_count: int
    likely_cents: CentsSum
    """The likely deals' expected revenue, which the forecast leaves out (Y13, Y14)."""
    likely_count: int
    balance_cents: CentsSum | None
    """The cash at its end, or what's expected then, or None before the opening balance's month or with none (Y9, Y10)."""
    balance_with_deals_cents: CentsSum | None
    """The same with the likely deals added, from this month on. A past month's is its balance."""


class CashFlow(BaseModel):
    today: date
    """The backend's, so the page can tell when the day has passed it (Y19)."""
    opening: Opening | None
    cash_today: CentsSum | None
    forecast_end: CentsSum | None
    """The balance expected at the end of the third forecast month (Y16)."""
    forecast_end_with_deals: CentsSum | None
    months: list[Month]
    """The last 12, oldest first, then the 3 after this one."""


class ExpectedItem(BaseModel):
    id: int
    name: str
    """An invoice's number, a bill's bill number or a deal's name."""
    organization: str | None
    due_on: date
    """An invoice's or a bill's due date, or a deal's close date."""
    expected_on: date
    cents: CentsSum
    days_paid_late: int | None
    """For an invoice, its customer's average days paid late (Y6). None for a bill or a deal."""


class Group(BaseModel):
    total_cents: CentsSum
    items: list[ExpectedItem]
    """In expected date order, then by id."""


class Expected(BaseModel):
    """What's expected in this month or one of the three after it (Y17)."""

    month: str
    coming_in: Group
    going_out: Group
    likely_deals: Group
