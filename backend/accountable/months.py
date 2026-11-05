"""The months that every area's charts by month show: the last 12, ending with this one."""

from dataclasses import dataclass
from datetime import date

COUNT = 12
LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


@dataclass(frozen=True)
class Month:
    key: str
    """Such as "2026-10", which month_key() gives any day in it."""
    label: str
    """Such as "Oct"."""


def month_key(day: date) -> str:
    return f"{day.year}-{day.month:02d}"


def last_months(today: date, count: int = COUNT) -> list[Month]:
    """Oldest first, ending with today's month, across the turn of a year."""
    index = today.year * 12 + today.month - 1
    months = []
    for back in range(count - 1, -1, -1):
        year, month = divmod(index - back, 12)
        months.append(Month(key=f"{year}-{month + 1:02d}", label=LABELS[month]))
    return months
