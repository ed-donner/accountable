"""The months that every area's charts by month show: the last 12, ending with this one, and
the 3 after it that the cash flow's forecast shows (Y1)."""

import calendar
from dataclasses import dataclass
from datetime import date

COUNT = 12
FORECAST = 3
LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


@dataclass(frozen=True)
class Month:
    key: str
    """Such as "2026-10", which month_key() gives any day in it."""
    label: str
    """Such as "Oct"."""
    year: int
    """Such as 2026, so a chart can tell its two Decembers apart."""

    @property
    def first_day(self) -> date:
        return date.fromisoformat(f"{self.key}-01")

    @property
    def last_day(self) -> date:
        first = self.first_day
        return first.replace(day=calendar.monthrange(first.year, first.month)[1])


def month_key(day: date) -> str:
    return f"{day.year}-{day.month:02d}"


def _counted(day: date) -> int:
    """Months since the start of year 0, so adding and taking away crosses the turn of a year."""
    return day.year * 12 + day.month - 1


def _month(counted: int) -> Month:
    year, month = divmod(counted, 12)
    return Month(key=f"{year}-{month + 1:02d}", label=LABELS[month], year=year)


def last_months(today: date, count: int = COUNT) -> list[Month]:
    """Oldest first, ending with today's month, across the turn of a year."""
    now = _counted(today)
    return [_month(now - back) for back in range(count - 1, -1, -1)]


def next_months(today: date, count: int = FORECAST) -> list[Month]:
    """The months after today's, oldest first, across the turn of a year."""
    now = _counted(today)
    return [_month(now + ahead) for ahead in range(1, count + 1)]
