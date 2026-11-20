from contextlib import contextmanager
from datetime import date, datetime, time, timezone

import pytest

from backend.app import clock
from backend.tests.conftest import NOW, TODAY, add_contact, add_deal, add_org, log, ok, patch_deal


@contextmanager
def on_day(day: date):
    """Run part of a test as if it were another day, then come back."""
    clock.freeze(day, datetime.combine(day, time(15), tzinfo=timezone.utc))
    try:
        yield
    finally:
        clock.freeze(TODAY, NOW)


def dashboard(client):
    return ok(client.get("/api/dashboard"))


@pytest.fixture
def org(client):
    return add_org(client, "Bluefin Logistics")


def test_an_empty_database(client):
    data = dashboard(client)
    assert data["today"] == "2026-11-19"
    assert data["open_pipeline"] == {"value": 0, "count": 0}
    assert data["expected_revenue"] == 0
    assert data["won_this_month"] == {"value": 0, "count": 0, "last_month_value": 0}
    assert data["follow_up_counts"] == {"overdue": 0, "due_soon": 0}
    assert len(data["months"]) == 12 and all(m["revenue"] == 0 and m["deals"] == 0 for m in data["months"])
    assert [s["stage"] for s in data["funnel"]] == ["new", "qualified", "proposal", "negotiation", "won"]
    assert [s["stage"] for s in data["open_by_stage"]] == ["new", "qualified", "proposal", "negotiation"]
    assert data["follow_ups"] == [] and data["recent"] == []


def test_open_pipeline_counts_only_open_deals(client, org):
    add_deal(client, org["id"], stage="new", value=10000)
    add_deal(client, org["id"], stage="negotiation", value=30000)
    add_deal(client, org["id"], stage="won", value=99000)
    add_deal(client, org["id"], stage="lost", value=77000)
    assert dashboard(client)["open_pipeline"] == {"value": 40000, "count": 2}


def test_expected_revenue_adds_each_deals_rounded_figure(client, org):
    # Each deal's $1 at 50% rounds to $1, so two make $2, not round($1) = $1.
    add_deal(client, org["id"], "One", stage="proposal", value=1)
    add_deal(client, org["id"], "Two", stage="proposal", value=1)
    assert dashboard(client)["expected_revenue"] == 2
    assert sum(d["expected_value"] for d in ok(client.get("/api/deals"))) == 2


def test_won_this_month_and_last_month(client, org):
    add_deal(client, org["id"], "This month, first day", stage="won", value=1000, close_date="2026-11-01")
    add_deal(client, org["id"], "Today", stage="won", value=2000)
    add_deal(client, org["id"], "Last month, last day", stage="won", value=400, close_date="2026-10-31")
    add_deal(client, org["id"], "Last month, first day", stage="won", value=30, close_date="2026-10-01")
    add_deal(client, org["id"], "Two months ago", stage="won", value=5, close_date="2026-09-30")
    add_deal(client, org["id"], "Lost this month", stage="lost", value=70000)
    assert dashboard(client)["won_this_month"] == {"value": 3000, "count": 2, "last_month_value": 430}


def test_last_month_crosses_the_year_in_january(client, org):
    add_deal(client, org["id"], "December", stage="won", value=700, close_date="2026-12-31")
    add_deal(client, org["id"], "January", stage="won", value=50, close_date="2027-01-02")
    with on_day(date(2027, 1, 5)):
        assert dashboard(client)["won_this_month"] == {"value": 50, "count": 1, "last_month_value": 700}


def test_follow_up_counts(client):
    contact = add_contact(client)
    for follow_up in ("2026-11-01", "2026-11-18", "2026-11-19", "2026-11-26", "2026-11-27"):
        log(client, f"Due {follow_up}", contact_id=contact["id"], follow_up_date=follow_up)
    done = log(client, "Done already", contact_id=contact["id"], follow_up_date="2026-11-10")
    ok(client.patch(f"/api/activities/{done['id']}", json={"done": True}))
    log(client, "No follow-up", contact_id=contact["id"])
    # Overdue: before today. Due soon: today to today + 7.
    assert dashboard(client)["follow_up_counts"] == {"overdue": 2, "due_soon": 2}


def test_the_12_months(client, org):
    add_deal(client, org["id"], "First of the month", stage="won", value=100, close_date="2026-03-01")
    add_deal(client, org["id"], "Last of the month", stage="won", value=20, close_date="2026-03-31")
    add_deal(client, org["id"], "Oldest month", stage="won", value=3, close_date="2025-12-01")
    add_deal(client, org["id"], "13 months ago", stage="won", value=9000, close_date="2025-11-30")
    add_deal(client, org["id"], "Lost in March", stage="lost", value=5000, close_date="2026-03-15")
    months = dashboard(client)["months"]
    assert [m["month"] for m in months][0] == "2025-12"
    assert [m["month"] for m in months][-1] == "2026-11"
    by_month = {m["month"]: (m["revenue"], m["deals"]) for m in months}
    assert by_month["2026-03"] == (120, 2)
    assert by_month["2025-12"] == (3, 1)
    # A month with no wins shows 0.
    assert by_month["2026-04"] == (0, 0)
    assert sum(m["revenue"] for m in months) == 123


def test_the_funnel(client, org):
    def funnel():
        return {s["stage"]: (s["count"], s["value"]) for s in dashboard(client)["funnel"]}

    add_deal(client, org["id"], "Still new", stage="new", value=1)
    lost_from_proposal = add_deal(client, org["id"], "Lost from proposal", stage="new", value=10)
    patch_deal(client, lost_from_proposal["id"], stage="proposal")
    patch_deal(client, lost_from_proposal["id"], stage="lost")
    add_deal(client, org["id"], "Lost with no changes", stage="lost", value=100)
    won = add_deal(client, org["id"], "Won", stage="new", value=1000)
    for stage in ("qualified", "proposal", "negotiation", "won"):
        patch_deal(client, won["id"], stage=stage)
    skipped = add_deal(client, org["id"], "Skipped", stage="new", value=10000)
    patch_deal(client, skipped["id"], stage="negotiation")
    with on_day(date(2025, 10, 19)):
        old = add_deal(client, org["id"], "Created 13 months ago", stage="new", value=100000, close_date="2025-12-01")
        patch_deal(client, old["id"], stage="won")

    assert funnel() == {
        "new": (5, 11111),
        "qualified": (3, 11010),
        "proposal": (3, 11010),
        "negotiation": (2, 11000),
        "won": (1, 1000),
    }


def test_open_pipeline_by_stage(client, org):
    add_deal(client, org["id"], stage="new", value=10000)
    add_deal(client, org["id"], stage="new", value=5000)
    add_deal(client, org["id"], stage="negotiation", value=1001)
    add_deal(client, org["id"], stage="won", value=9999)
    assert dashboard(client)["open_by_stage"] == [
        {"stage": "new", "count": 2, "value": 15000, "expected": 1500},
        {"stage": "qualified", "count": 0, "value": 0, "expected": 0},
        {"stage": "proposal", "count": 0, "value": 0, "expected": 0},
        {"stage": "negotiation", "count": 1, "value": 1001, "expected": 751},
    ]


def test_follow_ups_list(client, org):
    contact = add_contact(client, "Sarah Chen")
    deal = add_deal(client, org["id"], "Website redesign")
    log(client, "Later", contact_id=contact["id"], follow_up_date="2026-12-01")
    log(client, "Due Monday", deal_id=deal["id"], follow_up_date="2026-11-23")
    log(client, "Six days late", contact_id=contact["id"], follow_up_date="2026-11-13")
    log(client, "Due today", deal_id=deal["id"], follow_up_date="2026-11-19")
    done = log(client, "Done", contact_id=contact["id"], follow_up_date="2026-11-12")
    ok(client.patch(f"/api/activities/{done['id']}", json={"done": True}))

    follow_ups = dashboard(client)["follow_ups"]
    assert [(f["description"], f["days_late"]) for f in follow_ups] == [
        ("Six days late", 6),
        ("Due today", 0),
        ("Due Monday", 0),
    ]
    assert follow_ups[0]["contact"] == {"id": contact["id"], "name": "Sarah Chen"}
    assert follow_ups[1]["deal"] == {"id": deal["id"], "name": "Website redesign"}


def test_ticking_done_takes_a_follow_up_off_the_list(client):
    contact = add_contact(client)
    entry = log(client, contact_id=contact["id"], follow_up_date="2026-11-18")
    assert len(dashboard(client)["follow_ups"]) == 1
    ok(client.patch(f"/api/activities/{entry['id']}", json={"done": True}))
    assert dashboard(client)["follow_ups"] == []


def test_recent_activity(client, org):
    contact = add_contact(client)
    for day in range(1, 12):
        log(client, f"Nov {day}", contact_id=contact["id"], occurred_at=f"2026-11-{day:02d}T10:00:00Z")
    log(client, "Later today", contact_id=contact["id"], occurred_at="2026-11-19T18:00:00Z")
    log(client, "Next week", contact_id=contact["id"], occurred_at="2026-11-26T10:00:00Z")
    deal = add_deal(client, org["id"], "Website redesign")
    patch_deal(client, deal["id"], stage="negotiation")

    recent = dashboard(client)["recent"]
    assert len(recent) == 10
    # Stage changes count, and future times are left out (up to now, 15:00Z).
    assert recent[0]["description"] == "Moved from Proposal to Negotiation"
    assert recent[0]["deal"]["name"] == "Website redesign"
    assert [r["description"] for r in recent[1:4]] == ["Nov 11", "Nov 10", "Nov 9"]
    assert "Later today" not in [r["description"] for r in recent]


def test_a_deal_just_moved_to_won_shows_straight_away(client, org):
    deal = add_deal(client, org["id"], stage="negotiation", value=25000)
    before = dashboard(client)
    patch_deal(client, deal["id"], stage="won")
    after = dashboard(client)
    assert after["won_this_month"]["value"] == before["won_this_month"]["value"] + 25000
    assert after["months"][-1]["revenue"] == before["months"][-1]["revenue"] + 25000
    assert after["open_pipeline"]["value"] == before["open_pipeline"]["value"] - 25000
    assert after["recent"][0]["description"] == "Moved from Negotiation to Won"
