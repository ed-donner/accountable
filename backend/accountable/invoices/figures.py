"""What an invoice shows as, how late it is and what's owed on it (V3, V29), with today passed in,
and the Bill to a new draft starts with (V5).

Worked out from what's stored, never kept, so the page, the table and the dashboard agree,
and an invoice moves into Overdue, and along the groups of How late, as the days pass (V31).
"""

from collections.abc import Iterable
from datetime import date
from typing import Literal

from accountable.company import tax
from accountable.invoices.tables import DRAFT, VOID

ShowsAs = Literal["draft", "issued", "part_paid", "overdue", "paid", "void"]
LateGroup = Literal["not_due", "1_30", "31_60", "61_90", "over_90"]

# Each group's last day late, in order, and over 90 days after them. Not yet due includes an invoice due today.
_LAST_DAYS: list[tuple[LateGroup, int]] = [("not_due", 0), ("1_30", 30), ("31_60", 60), ("61_90", 90)]
GROUPS: list[LateGroup] = [group for group, _ in _LAST_DAYS] + ["over_90"]


def owed(status: str, total_cents: int | None, paid_cents: int) -> int:
    """Nothing is owed on a draft or a void invoice."""
    if status in (DRAFT, VOID) or total_cents is None:
        return 0
    return total_cents - paid_cents


def days_past_due(due_date: date, today: date) -> int:
    """How many days today is after the due date, so an invoice due yesterday is 1, and due today 0."""
    return max((today - due_date).days, 0)


def shows_as(status: str, total_cents: int | None, paid_cents: int, due_date: date | None, today: date) -> ShowsAs:
    """The first of the six in V3 that fits."""
    if status == DRAFT or total_cents is None or due_date is None:
        return "draft"
    if status == VOID:
        return "void"
    if paid_cents >= total_cents:
        return "paid"
    if today > due_date:
        return "overdue"
    return "part_paid" if paid_cents > 0 else "issued"


def days_late(shown: ShowsAs, due_date: date | None, today: date) -> int | None:
    """Days past the due date, for an overdue invoice only."""
    if shown != "overdue" or due_date is None:
        return None
    return days_past_due(due_date, today)


def late_group(due_date: date, today: date) -> LateGroup:
    """Which group of How late an invoice with money owed is in (V29)."""
    late = days_past_due(due_date, today)
    for group, last_day in _LAST_DAYS:
        if late <= last_day:
            return group
    return "over_90"


def draft_totals(lines: Iterable[tax.Line], rate: int) -> tax.Totals:
    """A draft's figures, from its lines as saved, at the settings' rate as it is now (V7)."""
    return tax.totals(lines, rate)


def bill_to(organization: str | None, contact: str | None, email: str | None) -> str | None:
    """The organization's name, then Attn: and the main contact's name, then their email, each on
    its own line, leaving out any that's blank (V5)."""
    parts = [organization, f"Attn: {contact}" if contact else None, email]
    return "\n".join(part for part in parts if part) or None
