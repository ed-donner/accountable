"""TB01 to TB06: stage rules."""

from datetime import date, timedelta

import pytest

from app import rules

TODAY = date(2026, 11, 16)


# TB01
@pytest.mark.parametrize(
    "stage,expected",
    [
        ("new", 10),
        ("qualified", 25),
        ("proposal", 50),
        ("negotiation", 75),
        ("won", 100),
        ("lost", 0),
    ],
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
    deal = api.ok(
        "PATCH",
        f"/api/deals/{deal['id']}",
        json={"name": "Renamed", "stage": "qualified"},
    )
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


def test_closed_deal_never_loses_its_close_date(api):
    """RV5: clearing the close date on a Won or Lost deal, or while closing it, gives today."""
    org = api.org()
    deal = api.deal(org["id"], stage="negotiation", close_date="2026-11-01")
    won = api.ok("PATCH", f"/api/deals/{deal['id']}", json={"stage": "won", "close_date": None})
    assert won["close_date"] == TODAY.isoformat()
    api.ok("PATCH", f"/api/deals/{deal['id']}", json={"close_date": "2026-11-10"})
    cleared = api.ok("PATCH", f"/api/deals/{deal['id']}", json={"close_date": None})
    assert cleared["close_date"] == TODAY.isoformat()
    reopened = api.ok(
        "PATCH",
        f"/api/deals/{deal['id']}",
        json={"stage": "proposal", "close_date": None},
    )
    assert reopened["close_date"] is None


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


# --- RV4 and RV5 across every path into a stage (spec D3 and D4 as amended) -----

CLOSED = ["won", "lost"]
OPEN = ["new", "qualified", "proposal", "negotiation"]


@pytest.mark.parametrize("stage", CLOSED)
def test_every_way_into_a_closed_stage_sets_a_close_date(api, stage):
    """Add, edit and drag on the board all leave a Won or Lost deal with a close date."""
    org = api.org()
    today = TODAY.isoformat()
    assert api.deal(org["id"], stage=stage)["close_date"] == today
    assert api.deal(org["id"], stage=stage, close_date=None)["close_date"] == today
    edited = api.deal(org["id"], stage="proposal", close_date="2027-03-01")
    assert (
        api.ok("PATCH", f"/api/deals/{edited['id']}", json={"stage": stage})["close_date"] == today
    )
    cleared = api.deal(org["id"], stage="proposal", close_date="2027-03-01")
    body = {"stage": stage, "close_date": None}
    assert api.ok("PATCH", f"/api/deals/{cleared['id']}", json=body)["close_date"] == today
    moved = api.deal(org["id"], stage="negotiation")
    assert api.move(moved["id"], stage)["close_date"] == today


def test_moving_between_won_and_lost_resets_the_close_date(api):
    org = api.org()
    deal = api.deal(org["id"], stage="won", close_date="2026-10-01")
    assert deal["close_date"] == "2026-10-01"
    lost = api.move(deal["id"], "lost")
    assert lost["close_date"] == TODAY.isoformat()
    assert lost["probability"] == 0


@pytest.mark.parametrize("stage", CLOSED)
def test_clearing_the_close_date_of_a_closed_deal_gives_today(api, stage):
    org = api.org()
    deal = api.deal(org["id"], stage=stage, close_date="2026-11-02")
    for blank in (None, ""):
        api.ok("PATCH", f"/api/deals/{deal['id']}", json={"close_date": "2026-11-02"})
        assert (
            api.ok("PATCH", f"/api/deals/{deal['id']}", json={"close_date": blank})["close_date"]
            == TODAY.isoformat()
        )


@pytest.mark.parametrize("stage", OPEN)
def test_an_open_deal_may_have_no_close_date(api, stage):
    org = api.org()
    deal = api.deal(org["id"], stage=stage, close_date="2027-01-01")
    assert (
        api.ok("PATCH", f"/api/deals/{deal['id']}", json={"close_date": None})["close_date"] is None
    )


@pytest.mark.parametrize("stage", CLOSED)
def test_no_path_gives_a_closed_deal_a_future_close_date(api, client, stage):
    org = api.org()
    future = (TODAY + timedelta(days=1)).isoformat()
    response = client.post(
        "/api/deals",
        json={
            "name": "D",
            "organization_id": org["id"],
            "value": 1,
            "stage": stage,
            "close_date": future,
        },
    )
    assert response.status_code == 400
    assert "close_date" in response.json()["fields"]
    deal = api.deal(org["id"], stage="proposal")
    response = client.patch(f"/api/deals/{deal['id']}", json={"stage": stage, "close_date": future})
    assert response.status_code == 400
    assert "close_date" in response.json()["fields"]
    assert api.ok("GET", f"/api/deals/{deal['id']}")["stage"] == "proposal"  # Nothing saved.


def test_a_probability_typed_in_with_a_stage_change_wins(api):
    org = api.org()
    deal = api.deal(org["id"], stage="new")
    edited = api.ok(
        "PATCH",
        f"/api/deals/{deal['id']}",
        json={"stage": "proposal", "probability": 65},
    )
    assert edited["probability"] == 65


def test_an_unchanged_probability_sent_with_a_stage_change_is_reset(api):
    """The edit form sends every field; sending back the old figure isn't typing one in."""
    org = api.org()
    deal = api.deal(org["id"], stage="new")
    edited = api.ok(
        "PATCH",
        f"/api/deals/{deal['id']}",
        json={"stage": "proposal", "probability": 10},
    )
    assert edited["probability"] == 50


def test_a_close_date_typed_in_with_a_win_wins(api):
    org = api.org()
    deal = api.deal(org["id"], stage="negotiation", close_date="2026-12-15")
    won = api.ok(
        "PATCH",
        f"/api/deals/{deal['id']}",
        json={"stage": "won", "close_date": "2026-11-12"},
    )
    assert won["close_date"] == "2026-11-12"


@pytest.mark.parametrize("stage", OPEN + CLOSED)
def test_a_probability_typed_in_on_a_new_deal_wins(api, stage):
    org = api.org()
    assert api.deal(org["id"], stage=stage, probability=33)["probability"] == 33


@pytest.mark.parametrize("stage", OPEN + CLOSED)
def test_a_board_move_always_takes_the_stages_probability(api, stage):
    """A drag has nothing typed in, so the stage's usual figures apply (D3)."""
    org = api.org()
    start = "proposal" if stage != "proposal" else "new"
    deal = api.deal(org["id"], stage=start, probability=33)
    assert api.move(deal["id"], stage)["probability"] == rules.usual_probability(stage)
