"""How late money is, and the rows of the aged balances report (X1, X10), as plain functions of values.

Nothing here reads the database or the clock, so a test can fix any day.
"""

from collections.abc import Iterable
from dataclasses import dataclass, field
from datetime import date
from typing import Literal

Part = Literal["not_due", "1_30", "31_60", "61_90", "over_90"]
# In order, the same keys as the dashboard's How late (invoices.figures).
PARTS: list[Part] = ["not_due", "1_30", "31_60", "61_90", "over_90"]

# Each part's last day past due, so the next part starts the day after.
_LAST_DAYS: list[tuple[Part, int]] = [("not_due", 0), ("1_30", 30), ("31_60", 60), ("61_90", 90)]


def part_of(days_past_due: int) -> Part:
    """Not yet due is 0 days past due or less, such as an item due on the day or after it."""
    for part, last_day in _LAST_DAYS:
        if days_past_due <= last_day:
            return part
    return "over_90"


@dataclass(frozen=True)
class Owed:
    """One open invoice or bill, with what's owed on it on the chosen day."""

    id: int
    organization_id: int
    organization: str
    number: str
    due_on: date
    cents: int


@dataclass(frozen=True)
class Item:
    id: int
    number: str
    due_on: date
    days_past_due: int
    part: Part
    cents: int


@dataclass
class Sum:
    cents: int = 0
    count: int = 0

    def add(self, cents: int) -> None:
        self.cents += cents
        self.count += 1


@dataclass
class Totals:
    """Money in each part, and in all of them."""

    parts: dict[Part, Sum] = field(default_factory=lambda: {part: Sum() for part in PARTS})
    total: int = 0

    def add(self, item: Item) -> None:
        self.parts[item.part].add(item.cents)
        self.total += item.cents


@dataclass
class Row(Totals):
    id: int = 0
    name: str = ""
    items: list[Item] = field(default_factory=list)

    @property
    def oldest(self) -> int:
        """The most days past due among its items, or 0 if all are not yet due."""
        return max((max(item.days_past_due, 0) for item in self.items), default=0)


def item_of(owed: Owed, on: date) -> Item:
    days = (on - owed.due_on).days
    return Item(owed.id, owed.number, owed.due_on, days, part_of(days), owed.cents)


def _order(row: Row) -> tuple[int, int, str, int]:
    return -row.oldest, -row.total, row.name.casefold(), row.id


def aged(owing: Iterable[Owed], on: date) -> tuple[list[Row], Totals]:
    """A row for each organization with something owed, ordered as X10 says, and the totals of all."""
    rows: dict[int, Row] = {}
    totals = Totals()
    for owed in owing:
        item = item_of(owed, on)
        row = rows.setdefault(owed.organization_id, Row(id=owed.organization_id, name=owed.organization))
        row.items.append(item)
        row.add(item)
        totals.add(item)
    for row in rows.values():
        row.items.sort(key=lambda item: (item.due_on, item.number))
    return sorted(rows.values(), key=_order), totals
