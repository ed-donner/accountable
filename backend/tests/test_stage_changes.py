import pytest

from backend.tests.conftest import add_deal, add_org, assert_numbered, column, ok, patch_deal, stage_changes


@pytest.fixture
def org(client):
    return add_org(client, "Bluefin Logistics")


def test_changing_the_stage_sets_the_usual_probability(client, org):
    deal = add_deal(client, org["id"], stage="proposal")
    assert patch_deal(client, deal["id"], stage="negotiation")["probability"] == 75


def test_an_open_stage_sent_with_a_probability_keeps_it(client, org):
    deal = add_deal(client, org["id"], stage="proposal")
    assert patch_deal(client, deal["id"], stage="negotiation", probability=60)["probability"] == 60


@pytest.mark.parametrize(("stage", "probability"), [("won", 100), ("lost", 0)])
def test_won_and_lost_are_forced(client, org, stage, probability):
    deal = add_deal(client, org["id"], stage="proposal")
    assert patch_deal(client, deal["id"], stage=stage, probability=40)["probability"] == probability
    # And they stay there when the probability alone is sent.
    assert patch_deal(client, deal["id"], probability=40)["probability"] == probability


@pytest.mark.parametrize("stage", ["won", "lost"])
def test_won_or_lost_sets_today_unless_a_close_date_is_sent(client, org, stage):
    first = add_deal(client, org["id"], "First", close_date="2026-12-12")
    assert patch_deal(client, first["id"], stage=stage)["close_date"] == "2026-11-19"
    second = add_deal(client, org["id"], "Second", close_date="2026-12-12")
    assert patch_deal(client, second["id"], stage=stage, close_date="2026-11-02")["close_date"] == "2026-11-02"


def test_an_open_stage_keeps_the_close_date(client, org):
    deal = add_deal(client, org["id"], stage="new", close_date="2027-01-20")
    assert patch_deal(client, deal["id"], stage="qualified")["close_date"] == "2027-01-20"


def test_the_stage_change_is_recorded(client, org):
    deal = add_deal(client, org["id"], stage="proposal")
    patch_deal(client, deal["id"], stage="negotiation")
    [entry] = stage_changes(client, deal["id"])
    assert entry["from_stage"] == "proposal"
    assert entry["to_stage"] == "negotiation"
    assert entry["description"] == "Moved from Proposal to Negotiation"
    assert entry["occurred_at"] == "2026-11-19T15:00:00Z"
    assert entry["deal"] == {"id": deal["id"], "name": "Website redesign"}
    assert entry["contact"] is None
    assert entry["follow_up_date"] is None and entry["done"] is False


def test_adding_a_deal_records_no_stage_change(client, org):
    for stage in ("new", "won"):
        deal = add_deal(client, org["id"], stage=stage)
        assert stage_changes(client, deal["id"]) == []


def test_a_change_that_keeps_the_stage_records_none(client, org):
    deal = add_deal(client, org["id"], stage="proposal")
    patch_deal(client, deal["id"], stage="proposal", name="Renamed")
    patch_deal(client, deal["id"], value=1000)
    assert stage_changes(client, deal["id"]) == []


def test_a_probability_set_by_hand_survives_other_edits(client, org):
    deal = add_deal(client, org["id"], stage="proposal")
    assert patch_deal(client, deal["id"], probability=65)["probability"] == 65
    assert patch_deal(client, deal["id"], name="Renamed")["probability"] == 65
    assert patch_deal(client, deal["id"], value=1000, close_date="2027-03-01")["probability"] == 65
    # Until the stage changes.
    assert patch_deal(client, deal["id"], stage="negotiation")["probability"] == 75


def test_reopening_keeps_the_close_date_and_shows_late(client, org):
    deal = add_deal(client, org["id"], stage="won", close_date="2026-11-01")
    reopened = patch_deal(client, deal["id"], stage="proposal")
    assert reopened["close_date"] == "2026-11-01"
    assert reopened["probability"] == 50
    assert reopened["is_late"] is True


def test_a_deal_moved_by_patch_goes_to_the_top_of_its_new_column(client, org):
    a = add_deal(client, org["id"], "A", stage="proposal")
    b = add_deal(client, org["id"], "B", stage="proposal")
    n1 = add_deal(client, org["id"], "N1", stage="negotiation")
    n2 = add_deal(client, org["id"], "N2", stage="negotiation")
    patch_deal(client, a["id"], stage="negotiation")
    assert [deal_id for deal_id, _ in column(client, "negotiation")] == [a["id"], n2["id"], n1["id"]]
    assert [deal_id for deal_id, _ in column(client, "proposal")] == [b["id"]]
    assert_numbered(client, "proposal", "negotiation")


def test_several_moves_record_each_step(client, org):
    deal = add_deal(client, org["id"], stage="new")
    for stage in ("qualified", "proposal", "won"):
        patch_deal(client, deal["id"], stage=stage)
    steps = [(e["from_stage"], e["to_stage"]) for e in stage_changes(client, deal["id"])]
    # The timeline is newest first; these share a time, so the higher id comes first.
    assert steps == [("proposal", "won"), ("qualified", "proposal"), ("new", "qualified")]
    assert ok(client.get(f"/api/deals/{deal['id']}"))["stage"] == "won"
