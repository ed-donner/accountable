"""The pure rules of the profit and loss page (X3 to X7), with plain values and no database."""

from datetime import date, timedelta

import pytest
from accountable.books import accounts
from accountable.books.profit_and_loss import (
    Change,
    Period,
    after,
    before,
    change,
    margin_change,
    margin_tenths,
    period_containing,
)


def found(period: Period | None) -> Period:
    assert period is not None
    return period


def test_category_of_names_the_bills_category():
    assert [accounts.category_of(key) for key in accounts.EXPENSE_ACCOUNTS] == [
        "software",
        "contractors",
        "travel",
        "office",
        "marketing",
        "other",
    ]
    assert all(accounts.expense_for(accounts.category_of(key)) == key for key in accounts.EXPENSE_ACCOUNTS)


@pytest.mark.parametrize(
    ("kind", "day", "first", "last", "label"),
    [
        ("month", date(2026, 3, 1), date(2026, 3, 1), date(2026, 3, 31), "March 2026"),
        ("month", date(2026, 3, 31), date(2026, 3, 1), date(2026, 3, 31), "March 2026"),
        ("month", date(2028, 2, 10), date(2028, 2, 1), date(2028, 2, 29), "February 2028"),
        ("month", date(2026, 2, 28), date(2026, 2, 1), date(2026, 2, 28), "February 2026"),
        ("month", date(2026, 12, 31), date(2026, 12, 1), date(2026, 12, 31), "December 2026"),
        ("quarter", date(2026, 1, 1), date(2026, 1, 1), date(2026, 3, 31), "Q1 2026"),
        ("quarter", date(2026, 3, 31), date(2026, 1, 1), date(2026, 3, 31), "Q1 2026"),
        ("quarter", date(2026, 4, 1), date(2026, 4, 1), date(2026, 6, 30), "Q2 2026"),
        ("quarter", date(2026, 9, 30), date(2026, 7, 1), date(2026, 9, 30), "Q3 2026"),
        ("quarter", date(2026, 12, 31), date(2026, 10, 1), date(2026, 12, 31), "Q4 2026"),
        ("year", date(2026, 1, 1), date(2026, 1, 1), date(2026, 12, 31), "2026"),
        ("year", date(2026, 12, 31), date(2026, 1, 1), date(2026, 12, 31), "2026"),
    ],
)
def test_the_period_containing_a_day(kind, day, first, last, label):
    period = period_containing(kind, day)
    assert (period.first, period.last, period.label) == (first, last, label)


@pytest.mark.parametrize(
    ("kind", "day", "earlier", "later"),
    [
        ("month", date(2026, 1, 15), date(2025, 12, 1), date(2026, 2, 1)),
        ("month", date(2026, 12, 15), date(2026, 11, 1), date(2027, 1, 1)),
        ("quarter", date(2026, 2, 1), date(2025, 10, 1), date(2026, 4, 1)),
        ("quarter", date(2026, 11, 1), date(2026, 7, 1), date(2027, 1, 1)),
        ("year", date(2026, 6, 1), date(2025, 1, 1), date(2027, 1, 1)),
    ],
)
def test_the_period_before_and_after_cross_the_turn_of_a_year(kind, day, earlier, later):
    period = period_containing(kind, day)
    assert found(before(period)).first == earlier
    assert found(after(period)).first == later
    assert found(before(period)).last == period.first - timedelta(days=1)
    assert found(after(period)).first == period.last + timedelta(days=1)
    assert after(found(before(period))) == period


def test_the_labels_of_the_periods_around_the_first_quarter():
    q1 = period_containing("quarter", date(2026, 2, 1))
    assert found(before(q1)).label == "Q4 2025"
    assert found(after(q1)).label == "Q2 2026"
    assert found(before(period_containing("month", date(2026, 3, 1)))).label == "February 2026"
    assert found(before(period_containing("year", date(2026, 3, 1)))).label == "2025"


def test_the_ends_of_time_have_no_period_beyond():
    assert before(period_containing("year", date(1, 5, 5))) is None
    assert after(period_containing("year", date(9999, 5, 5))) is None


@pytest.mark.parametrize(
    ("profit", "revenue", "tenths"),
    [
        (30010, 48250, 622),
        (1, 8, 125),
        (1, 16, 63),
        (-1, 16, -63),
        (1, 3000, 0),
        (-1, 3000, 0),
        (5, 2000, 3),
        (-5, 2000, -3),
        (-8000, 100000, -80),
        (100, 100, 1000),
        (-300, 100, -3000),
        (0, 100, 0),
    ],
)
def test_the_margin_in_tenths_rounds_a_half_away_from_zero(profit, revenue, tenths):
    assert margin_tenths(profit, revenue) == tenths


@pytest.mark.parametrize("revenue", [0, -500])
def test_no_revenue_gives_no_margin(revenue):
    assert margin_tenths(100, revenue) is None
    assert margin_tenths(0, revenue) is None


@pytest.mark.parametrize(
    ("earlier", "now", "expected"),
    [
        (100, 112, Change("percent", 12)),
        (100, 92, Change("percent", -8)),
        (100, 100, Change("percent", 0)),
        (200, 201, Change("percent", 1)),
        (200, 199, Change("percent", -1)),
        (300, 301, Change("percent", 0)),
        (-100, -50, Change("percent", 50)),
        (-100, -150, Change("percent", -50)),
        (-100, 100, Change("percent", 200)),
        (100, -100, Change("percent", -200)),
        (100, 0, Change("percent", -100)),
        (-100, 0, Change("percent", 100)),
        (0, 100, Change("new", None)),
        (0, -100, Change("new", None)),
        (0, 0, Change("none", None)),
        (10**18, 2 * 10**18, Change("percent", 100)),
    ],
)
def test_a_change(earlier, now, expected):
    assert change(earlier, now) == expected


@pytest.mark.parametrize(
    ("earlier", "now", "expected"),
    [
        (600, 621, Change("points", 21)),
        (600, 596, Change("points", -4)),
        (600, 600, Change("points", 0)),
        (None, 600, Change("new", None)),
        (600, None, Change("none", None)),
        (None, None, Change("none", None)),
        (-50, 0, Change("points", 50)),
    ],
)
def test_the_margins_change_is_in_tenths_of_a_point(earlier, now, expected):
    assert margin_change(earlier, now) == expected
