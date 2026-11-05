"""What an invoice shows as, its days late and its group in How late (V3, V29, V31), with today fixed."""

from datetime import date, timedelta

import pytest
from accountable.invoices import figures

TODAY = date(2026, 10, 31)
DUE = date(2026, 11, 15)
TOTAL = 125000


@pytest.mark.parametrize(
    ("status", "paid", "due", "shown"),
    [
        ("draft", 0, None, "draft"),
        ("void", 0, DUE, "void"),
        ("issued", TOTAL, DUE, "paid"),
        ("issued", 0, TODAY - timedelta(days=1), "overdue"),
        ("issued", 50000, DUE, "part_paid"),
        ("issued", 0, DUE, "issued"),
    ],
)
def test_each_of_the_six(status, paid, due, shown):
    total = None if status == "draft" else TOTAL
    assert figures.shows_as(status, total, paid, due, TODAY) == shown


def test_part_paid_and_past_its_due_date_shows_overdue():
    assert figures.shows_as("issued", TOTAL, 50000, TODAY - timedelta(days=1), TODAY) == "overdue"


def test_paid_after_its_due_date_shows_paid():
    assert figures.shows_as("issued", TOTAL, TOTAL, TODAY - timedelta(days=40), TODAY) == "paid"


def test_a_void_invoice_past_its_due_date_shows_void():
    assert figures.shows_as("void", TOTAL, 0, TODAY - timedelta(days=40), TODAY) == "void"


def test_due_today_isnt_overdue():
    assert figures.shows_as("issued", TOTAL, 0, TODAY, TODAY) == "issued"
    assert figures.days_late("issued", TODAY, TODAY) is None


def test_due_yesterday_is_one_day_late():
    due = TODAY - timedelta(days=1)
    shown = figures.shows_as("issued", TOTAL, 0, due, TODAY)
    assert (shown, figures.days_late(shown, due, TODAY)) == ("overdue", 1)


def test_days_late_only_for_an_overdue_invoice():
    past = TODAY - timedelta(days=12)
    assert figures.days_late("paid", past, TODAY) is None
    assert figures.days_late("overdue", past, TODAY) == 12
    assert figures.days_late("draft", None, TODAY) is None


@pytest.mark.parametrize(
    ("late", "group"),
    [
        (-5, "not_due"),
        (0, "not_due"),
        (1, "1_30"),
        (30, "1_30"),
        (31, "31_60"),
        (60, "31_60"),
        (61, "61_90"),
        (90, "61_90"),
        (91, "over_90"),
        (400, "over_90"),
    ],
)
def test_each_groups_edges(late, group):
    assert figures.late_group(TODAY - timedelta(days=late), TODAY) == group


def test_the_groups_in_order():
    assert figures.GROUPS == ["not_due", "1_30", "31_60", "61_90", "over_90"]


def test_nothing_is_owed_on_a_draft_or_a_void_invoice():
    assert figures.owed("draft", None, 0) == 0
    assert figures.owed("void", TOTAL, 0) == 0
    assert figures.owed("issued", TOTAL, 50000) == 75000
    assert figures.owed("issued", TOTAL, TOTAL) == 0


def test_the_day_moves_an_invoice_along():
    """Nothing kept changes as the days pass: only today does (V31)."""
    due = date(2026, 10, 1)
    shown = [figures.shows_as("issued", TOTAL, 0, due, due + timedelta(days=late)) for late in (0, 1)]
    groups = [figures.late_group(due, due + timedelta(days=late)) for late in (0, 1, 31, 61, 91)]
    assert shown == ["issued", "overdue"]
    assert groups == figures.GROUPS
