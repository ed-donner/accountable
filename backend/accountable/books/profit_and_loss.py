"""The rules of the profit and loss page (X3 to X7), on plain values: no database and no clock.

Everything is whole-number arithmetic, so nothing divides by zero and no float rounds a figure.
"""

import calendar
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import date
from typing import Literal

from accountable.books import accounts

PeriodKind = Literal["month", "quarter", "year"]
KINDS: tuple[PeriodKind, ...] = ("month", "quarter", "year")
MONTH_NAMES = [name for name in calendar.month_name if name]
_MONTHS_IN = {"month": 1, "quarter": 3, "year": 12}

ChangeKind = Literal["percent", "points", "new", "none"]


@dataclass(frozen=True)
class Period:
    kind: PeriodKind
    first: date
    last: date

    @property
    def label(self) -> str:
        """Such as "March 2026", "Q1 2026" or "2026"."""
        if self.kind == "month":
            return f"{MONTH_NAMES[self.first.month - 1]} {self.first.year}"
        if self.kind == "quarter":
            return f"Q{(self.first.month - 1) // 3 + 1} {self.first.year}"
        return str(self.first.year)


@dataclass(frozen=True)
class Change:
    kind: ChangeKind
    value: int | None
    """A whole percent for "percent", tenths of a point for "points", otherwise None."""


def _span(kind: PeriodKind, counted: int) -> Period:
    """The period starting in the month `counted` (months since year 0)."""
    year, month = divmod(counted, 12)
    end_year, end_month = divmod(counted + _MONTHS_IN[kind] - 1, 12)
    last = calendar.monthrange(end_year, end_month + 1)[1]
    return Period(kind, date(year, month + 1, 1), date(end_year, end_month + 1, last))


def period_containing(kind: PeriodKind, day: date) -> Period:
    month = day.year * 12 + day.month - 1
    size = _MONTHS_IN[kind]
    return _span(kind, month - month % size)


def _counted(period: Period) -> int:
    return period.first.year * 12 + period.first.month - 1


def before(period: Period) -> Period | None:
    """The period of the same kind just before, or None before year 1."""
    counted = _counted(period) - _MONTHS_IN[period.kind]
    return _span(period.kind, counted) if counted >= 12 else None


def after(period: Period) -> Period | None:
    """The period of the same kind just after, or None past year 9999."""
    counted = _counted(period) + _MONTHS_IN[period.kind]
    return _span(period.kind, counted) if counted < 9999 * 12 + 12 else None


def _half_away(numerator: int, denominator: int) -> int:
    """numerator / denominator, a half rounding away from zero. The denominator is above 0."""
    rounded = (2 * abs(numerator) + denominator) // (2 * denominator)
    return rounded if numerator >= 0 else -rounded


def margin_tenths(profit: int, revenue: int) -> int | None:
    """Profit as tenths of a percent of revenue, or None when there is no revenue."""
    if revenue <= 0:
        return None
    return _half_away(profit * 1000, revenue)


def change(earlier: int, now: int) -> Change:
    """The change in a figure from the period before (X7)."""
    if earlier == 0:
        return Change("none", None) if now == 0 else Change("new", None)
    return Change("percent", _half_away((now - earlier) * 100, abs(earlier)))


def margin_change(earlier: int | None, now: int | None) -> Change:
    """The change in the margin, in tenths of a percentage point."""
    if now is None:
        return Change("none", None)
    if earlier is None:
        return Change("new", None)
    return Change("points", now - earlier)


# The figures (X2). Each one's sign is the books' own: Revenue is credits less debits, an expense debits less credits.
Totals = Mapping[str, tuple[int, int]]
"""An account's debits and credits, by its key."""
ACCOUNTS = (accounts.REVENUE_ACCOUNT, *accounts.EXPENSE_ACCOUNTS)
FIGURES = ("revenue", "expenses", "profit", *accounts.EXPENSE_ACCOUNTS)


def figure_accounts(figure: str) -> tuple[str, ...]:
    """The accounts an entry needs a line in to be behind a figure (X13)."""
    if figure == "revenue":
        return (accounts.REVENUE_ACCOUNT,)
    if figure == "expenses":
        return accounts.EXPENSE_ACCOUNTS
    if figure == "profit":
        return ACCOUNTS
    return (figure,)


@dataclass(frozen=True)
class Figures:
    """A period's statement."""

    revenue: int
    categories: tuple[int, ...]
    """Each expense account's, in the chart's order."""
    expenses: int
    profit: int
    margin: int | None
    """In tenths of a percent."""


def figures_of(totals: Totals) -> Figures:
    revenue = accounts.balance(accounts.REVENUE_ACCOUNT, *totals.get(accounts.REVENUE_ACCOUNT, (0, 0)))
    categories = tuple(accounts.balance(key, *totals.get(key, (0, 0))) for key in accounts.EXPENSE_ACCOUNTS)
    expenses = sum(categories)
    profit = revenue - expenses
    return Figures(revenue, categories, expenses, profit, margin_tenths(profit, revenue))


def amount_of(figure: str, totals: Totals) -> int:
    """What the lines in `totals` add to a figure, with the figure's sign."""
    found = figures_of(totals)
    if figure == "revenue":
        return found.revenue
    if figure == "expenses":
        return found.expenses
    if figure == "profit":
        return found.profit
    return found.categories[accounts.EXPENSE_ACCOUNTS.index(figure)]


@dataclass(frozen=True)
class Changes:
    revenue: Change
    categories: tuple[Change, ...]
    expenses: Change
    profit: Change
    margin: Change


def changes_between(earlier: Figures, now: Figures) -> Changes:
    return Changes(
        revenue=change(earlier.revenue, now.revenue),
        categories=tuple(change(old, new) for old, new in zip(earlier.categories, now.categories, strict=True)),
        expenses=change(earlier.expenses, now.expenses),
        profit=change(earlier.profit, now.profit),
        margin=margin_change(earlier.margin, now.margin),
    )
