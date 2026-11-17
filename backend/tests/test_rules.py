"""TB01 to TB06: stage rules."""

from datetime import date, timedelta

import pytest

from app import rules

TODAY = date(2026, 11, 16)


# TB01
@pytest.mark.parametrize(
    "stage,expected",
    [("new", 10), ("qualified", 25), ("proposal", 50), ("negotiation", 75), ("won", 100), ("lost", 0)],
)
def test_usual_probability(stage, expected):
    assert rules.usual_probability(stage) == expected


def test_new_deal_takes_its_stage_probability(api):
    org = api.org()
    deal = api.deal(org["id"], stage="proposal")
    assert deal["probability"] == 50
    assert api.deal(org["id"])["probability"] == 10


# TB02
def test_stage_change_resets_probability():
    assert rules.stage_change_updates("new", "proposal", TODAY)["probability"] == 50


def test_hand_set_probability_kept_until_stage_changes(api):
    org = api.org()
    deal = api.deal(org["id"], stage="qualified")
    deal = api.ok("PATCH", f"/api/deals/{deal['id']}", json={"probability": 40})
    assert deal["probability"] == 40
    deal = api.ok("PATCH", f"/api/deals/{deal['id']}", json={"name": "Renamed", "stage": "qualified"})
    assert deal["probability"] == 40
    deal = api.ok("PATCH", f"/api/deals/{deal['id']}", json={"stage": "negotiation"})
    assert deal["probability"] == 75


def test_same_stage_changes_nothing():
    assert rules.stage_change_updates("proposal", "proposal", TODAY) == {}


# TB03
@pytest.mark.parametrize("stage", ["won", "lost"])
def test_closing_sets_close_date_to_today(stage):
    updates = rules.stage_change_updates("negotiation", stage, TODAY)
    assert updates["close_date"] == TODAY


def test_reopening_keeps_close_date():
    assert "close_date" not in rules.stage_change_updates("won", "negotiation", TODAY)


# TB04
def test_closed_deal_cannot_close_after_today():
    tomorrow = TODAY + timedelta(days=1)
    assert rules.close_date_error("won", tomorrow, TODAY)
    assert rules.close_date_error("lost", tomorrow, TODAY)
    assert rules.close_date_error("won", TODAY, TODAY) is None
    assert rules.close_date_error("proposal", tomorrow, TODAY) is None


def test_api_refuses_future_close_date_on_won_deal(api, client):
    org = api.org()
    deal = api.deal(org["id"], stage="won")
    response = client.patch(f"/api/deals/{deal['id']}", json={"close_date": "2026-12-01"})
    assert response.status_code == 400
    assert "close_date" in response.json()["fields"]


# TB05
def test_status_never_lowered():
    assert rules.status_after_win("lead") == "customer"
    assert rules.status_after_win("qualified") == "customer"
    assert rules.status_after_win("customer") == "customer"
    assert rules.raised_status("customer", "lead") == "customer"


def test_win_makes_main_contact_a_customer(api):
    org = api.org()
    contact = api.contact(organization_id=org["id"])
    assert contact["status"] == "lead"
    deal = api.deal(org["id"], contact_id=contact["id"], stage="negotiation")
    api.ok("PATCH", f"/api/deals/{deal['id']}", json={"stage": "won"})
    assert api.ok("GET", f"/api/contacts/{contact['id']}")["status"] == "customer"
    api.ok("PATCH", f"/api/deals/{deal['id']}", json={"stage": "proposal"})
    assert api.ok("GET", f"/api/contacts/{contact['id']}")["status"] == "customer"


# TB06
def test_late_means_open_with_close_date_before_today():
    yesterday = TODAY - timedelta(days=1)
    assert rules.is_late("proposal", yesterday, TODAY)
    assert not rules.is_late("proposal", TODAY, TODAY)
    assert not rules.is_late("proposal", None, TODAY)
    assert not rules.is_late("won", yesterday, TODAY)
    assert not rules.is_late("lost", yesterday, TODAY)


def test_deal_shows_late_flag(api, client):
    org = api.org()
    deal = api.deal(org["id"], stage="proposal", close_date="2026-11-10")
    assert deal["is_late"] is True
    # The browser's date decides what "today" is.
    response = client.get(f"/api/deals/{deal['id']}", headers={"X-Local-Date": "2026-11-01"})
    assert response.json()["is_late"] is False
