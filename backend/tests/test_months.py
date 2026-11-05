"""The months every area's charts by month show, from months.py."""

from datetime import date

from accountable.months import last_months, month_key


def test_the_last_12_months_end_with_this_one_oldest_first():
    months = last_months(date(2026, 11, 5))
    assert [month.key for month in months] == ["2025-12"] + [f"2026-{n:02d}" for n in range(1, 12)]
    assert [month.label for month in months][-3:] == ["Sep", "Oct", "Nov"]


def test_the_months_cross_the_turn_of_a_year():
    assert [(month.key, month.label) for month in last_months(date(2027, 1, 1), 3)] == [
        ("2026-11", "Nov"),
        ("2026-12", "Dec"),
        ("2027-01", "Jan"),
    ]


def test_each_day_is_in_its_own_month():
    assert [month_key(day) for day in (date(2026, 1, 1), date(2026, 1, 31), date(2026, 12, 31))] == [
        "2026-01",
        "2026-01",
        "2026-12",
    ]
