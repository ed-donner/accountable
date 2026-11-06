"""The months every area's charts by month show, from months.py."""

from datetime import date

from accountable.months import last_months, month_key, next_months


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


def test_the_3_months_after_this_one_cross_the_turn_of_a_year():
    assert [(month.key, month.label, month.year) for month in next_months(date(2026, 11, 5))] == [
        ("2026-12", "Dec", 2026),
        ("2027-01", "Jan", 2027),
        ("2027-02", "Feb", 2027),
    ]
    assert [month.key for month in next_months(date(2026, 12, 31))] == ["2027-01", "2027-02", "2027-03"]


def test_each_month_has_its_year_so_two_decembers_are_told_apart():
    december, *_, this_december = last_months(date(2026, 12, 1), 13)
    assert (december.key, december.year) == ("2025-12", 2025)
    assert (this_december.key, this_december.year) == ("2026-12", 2026)


def test_each_month_knows_its_first_and_last_days():
    months = {month.key: month for month in last_months(date(2028, 12, 1), 12)}
    assert (months["2028-02"].first_day, months["2028-02"].last_day) == (date(2028, 2, 1), date(2028, 2, 29))
    assert (months["2028-12"].first_day, months["2028-12"].last_day) == (date(2028, 12, 1), date(2028, 12, 31))
    assert months["2028-04"].last_day == date(2028, 4, 30)
