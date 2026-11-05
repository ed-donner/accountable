"""The Money section's figures against a few bills with known answers, with today fixed (E20 to E23).

The edges are where a figure goes wrong: a bill due today is in the 30 days and isn't
overdue, one due yesterday is overdue, the 30th day on is in and the 31st isn't, paid
bills count in spending but not in what we owe, tax counts everywhere, and a bill dated
in a later month isn't on the chart.
"""

from datetime import date

import pytest
from accountable import db
from conftest import TODAY

MONEY = "/api/bills/dashboard"
NOTHING = dict.fromkeys(["software", "contractors", "travel", "office", "marketing", "other"], 0)


def money(api) -> dict:
    reply = api.get(MONEY)
    assert reply.status_code == 200, reply.text
    return reply.json()


@pytest.fixture
def today_is(api):
    """Sets the backend's today for the next requests."""

    def set_today(day: date) -> None:
        api.app.dependency_overrides[db.local_today] = lambda: day

    return set_today


@pytest.fixture
def northwind(make) -> int:
    return make.organization("Northwind Software")


def test_with_no_bills_every_figure_is_zero(api):
    reply = money(api)
    assert reply["today"] == "2026-10-31"
    assert reply["owed"] == {"total_cents": 0, "count": 0}
    assert reply["overdue"] == {"total_cents": 0, "count": 0}
    assert reply["due"] == {"total_cents": 0, "count": 0, "bills": []}
    assert [(month["month"], month["label"]) for month in reply["months"]] == [
        ("2025-11", "Nov"),
        ("2025-12", "Dec"),
        ("2026-01", "Jan"),
        ("2026-02", "Feb"),
        ("2026-03", "Mar"),
        ("2026-04", "Apr"),
        ("2026-05", "May"),
        ("2026-06", "Jun"),
        ("2026-07", "Jul"),
        ("2026-08", "Aug"),
        ("2026-09", "Sep"),
        ("2026-10", "Oct"),
    ]
    assert all(month["total_cents"] == 0 and month["categories"] == NOTHING for month in reply["months"])


def test_what_we_owe_overdue_and_due_against_bills_on_each_edge(api, make, northwind):
    """Today is Oct 31, 2026, so the 30 days run to Nov 30."""
    make.bill(
        northwind, "A", bill_date=date(2026, 10, 1), due_date=date(2026, 10, 30), amount_cents=10000, tax_cents=800
    )
    due_today = make.bill(northwind, "B", due_date=TODAY, amount_cents=20000)
    last_day = make.bill(
        northwind, "C", due_date=date(2026, 11, 30), amount_cents=30000, tax_cents=2500, category="travel"
    )
    make.bill(northwind, "D", due_date=date(2026, 12, 1), amount_cents=40000)
    make.bill(northwind, "E", due_date=date(2026, 11, 5), amount_cents=50000, paid_on=date(2026, 10, 31))
    make.bill(
        northwind, "F", bill_date=date(2026, 11, 2), due_date=date(2026, 12, 2), amount_cents=60000, tax_cents=100
    )
    make.bill(
        make.organization("Kingsgate Properties"),
        "KP-1",
        bill_date=date(2026, 6, 1),
        due_date=date(2026, 7, 1),
        amount_cents=5,
        category="office",
    )

    reply = money(api)
    owed = 10800 + 20000 + 32500 + 40000 + 60100 + 5
    assert reply["owed"] == {"total_cents": owed, "count": 6}
    assert reply["overdue"] == {"total_cents": 10800 + 5, "count": 2}
    assert reply["due"] == {
        "total_cents": 20000 + 32500,
        "count": 2,
        "bills": [
            {
                "id": due_today,
                "supplier": "Northwind Software",
                "bill_number": "B",
                "due_date": "2026-10-31",
                "category": "software",
                "total_cents": 20000,
            },
            {
                "id": last_day,
                "supplier": "Northwind Software",
                "bill_number": "C",
                "due_date": "2026-11-30",
                "category": "travel",
                "total_cents": 32500,
            },
        ],
    }


def test_a_bill_due_today_turns_overdue_the_next_day(api, make, northwind, today_is):
    make.bill(northwind, due_date=TODAY, amount_cents=1000)
    assert money(api)["overdue"]["count"] == 0
    today_is(date(2026, 11, 1))
    reply = money(api)
    assert reply["today"] == "2026-11-01"
    assert reply["overdue"] == {"total_cents": 1000, "count": 1}
    assert reply["due"]["count"] == 0


def test_the_due_bills_come_in_due_date_order(api, make, northwind):
    later = make.bill(northwind, "1", due_date=date(2026, 11, 20))
    sooner = make.bill(northwind, "2", due_date=date(2026, 11, 2))
    tie = make.bill(northwind, "3", due_date=date(2026, 11, 20))
    assert [bill["id"] for bill in money(api)["due"]["bills"]] == [sooner, later, tie]


def test_marking_a_bill_paid_takes_it_out_of_what_we_owe(api, make, northwind):
    bill = make.bill(northwind, due_date=date(2026, 10, 20), bill_date=date(2026, 9, 20), amount_cents=1000)
    assert money(api)["overdue"]["count"] == 1
    api.patch(f"/api/bills/{bill}", json={"paid_on": "2026-10-30"})
    reply = money(api)
    assert (reply["owed"], reply["overdue"]) == ({"total_cents": 0, "count": 0}, {"total_cents": 0, "count": 0})


def test_spending_puts_each_bill_in_its_bill_dates_month_paid_or_not_across_a_year(api, make, northwind, today_is):
    today_is(date(2027, 1, 15))
    dated = [
        (date(2026, 1, 31), "software", 999, 0, None),  # Before the 12 months.
        (date(2026, 2, 1), "software", 1000, 100, None),
        (date(2026, 2, 28), "marketing", 500, 0, date(2026, 3, 1)),
        (date(2026, 12, 31), "contractors", 5000, 0, date(2027, 1, 2)),
        (date(2027, 1, 1), "travel", 2000, 160, None),
        (date(2027, 1, 20), "office", 300, 0, None),  # Later this month still counts in it.
        (date(2027, 2, 1), "other", 777, 0, None),  # A later month isn't on the chart yet.
    ]
    for number, (bill_date, category, amount, tax, paid_on) in enumerate(dated):
        make.bill(
            northwind,
            str(number),
            bill_date=bill_date,
            due_date=bill_date,
            category=category,
            amount_cents=amount,
            tax_cents=tax,
            paid_on=paid_on,
        )

    months = {month["month"]: month for month in money(api)["months"]}
    assert list(months) == [f"2026-{month:02d}" for month in range(2, 13)] + ["2027-01"]
    assert months["2026-02"] == {
        "month": "2026-02",
        "label": "Feb",
        "total_cents": 1600,
        "categories": {**NOTHING, "software": 1100, "marketing": 500},
    }
    assert months["2026-12"]["categories"] == {**NOTHING, "contractors": 5000}
    assert months["2027-01"] == {
        "month": "2027-01",
        "label": "Jan",
        "total_cents": 2460,
        "categories": {**NOTHING, "travel": 2160, "office": 300},
    }
    empty = [key for key, month in months.items() if month["total_cents"] == 0]
    assert empty == [key for key in months if key not in ("2026-02", "2026-12", "2027-01")]
    assert all(months[key]["categories"] == NOTHING for key in empty)


def test_the_categories_come_in_their_order(api):
    assert list(money(api)["months"][-1]["categories"]) == list(NOTHING)
