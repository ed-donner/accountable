"""Deals through the API (R10, R12–R17, R29, R33, R40, R42, D8)."""

import pytest

from .conftest import make_activity, make_contact, make_deal, make_org


@pytest.fixture
def org(empty_client):
    return make_org(empty_client)


def column(c, stage):
    return [d["name"] for d in sorted(c.get("/api/deals").json(), key=lambda d: d["position"]) if d["stage"] == stage]


def stage_changes(c, deal_id):
    return [
        (a["from_stage"], a["to_stage"])
        for a in reversed(c.get(f"/api/deals/{deal_id}").json()["timeline"])
        if a["kind"] == "stage_change"
    ]


def test_validation(empty_client, org):  # R10
    r = empty_client.post("/api/deals", json={"name": "", "organization_id": org["id"], "value_cents": -1, "probability": 101, "close_date": "nope"})
    fields = r.json()["fields"]
    assert r.status_code == 422
    assert fields["name"] == "This is required"
    assert fields["value_cents"] == "Must be 0 or more"
    assert fields["probability"] == "Must be 100 or less"
    assert fields["close_date"] == "Enter a valid date"
    r = empty_client.post("/api/deals", json={"name": "X", "value_cents": 1, "close_date": "2026-12-01"})
    assert r.json()["fields"]["organization_id"] == "This is required"
    r = empty_client.post("/api/deals", json={"name": "X", "organization_id": 999, "value_cents": 1, "close_date": "2026-12-01"})
    assert r.status_code == 422


def test_stages_endpoint(empty_client):  # R13
    assert [s["name"] for s in empty_client.get("/api/stages").json()] == ["New", "Qualified", "Proposal", "Negotiation", "Won", "Lost"]


def test_new_deal_probability_figures_and_late_flag(empty_client, org):  # R14, R17, R18
    d = make_deal(empty_client, org["id"], stage="Proposal", value_cents=1_000_000, close_date="2026-11-14")
    assert (d["probability"], d["expected_cents"], d["is_late"]) == (50, 500_000, True)
    d = make_deal(empty_client, org["id"], stage="Proposal", probability=65, close_date="2026-11-15")
    assert (d["probability"], d["is_late"]) == (65, False)
    assert make_deal(empty_client, org["id"], stage="Won", close_date="2026-01-01")["is_late"] is False


def test_stage_change_by_edit_applies_rules_and_logs(empty_client, org):  # R12, R15, R16
    d = make_deal(empty_client, org["id"], stage="Proposal", probability=33, close_date="2026-12-31")
    same = empty_client.patch(f"/api/deals/{d['id']}", json={"probability": 40, "stage": "Proposal"}).json()
    assert same["probability"] == 40  # a hand edit with no stage change is kept
    moved = empty_client.patch(f"/api/deals/{d['id']}", json={"stage": "Negotiation", "probability": 40}).json()
    assert moved["probability"] == 75  # the new stage's probability wins
    won = empty_client.patch(f"/api/deals/{d['id']}", json={"stage": "Won"}).json()
    assert (won["probability"], won["close_date"]) == (100, "2026-11-15")
    edited = empty_client.patch(f"/api/deals/{d['id']}", json={"close_date": "2026-11-01"}).json()
    assert edited["close_date"] == "2026-11-01"  # can be edited afterwards
    back = empty_client.patch(f"/api/deals/{d['id']}", json={"stage": "Negotiation"}).json()
    assert back["close_date"] == "2026-11-01"  # moving out of Won leaves it
    assert stage_changes(empty_client, d["id"]) == [("Proposal", "Negotiation"), ("Negotiation", "Won"), ("Won", "Negotiation")]
    entry = empty_client.get(f"/api/deals/{d['id']}").json()["timeline"][0]
    assert entry["description"] == "Moved from Won to Negotiation"


def test_new_deal_goes_to_top_of_its_column(empty_client, org):  # R42, D8
    for name in ["A", "B", "C"]:
        make_deal(empty_client, org["id"], name)
    assert column(empty_client, "New") == ["C", "B", "A"]


def test_move_within_and_between_columns(empty_client, org):  # R40, D8, R12
    ids = {n: make_deal(empty_client, org["id"], n)["id"] for n in ["A", "B", "C"]}  # New: C, B, A
    for n in ["X", "Y"]:
        ids[n] = make_deal(empty_client, org["id"], n, stage="Proposal")["id"]  # Proposal: Y, X

    r = empty_client.post(f"/api/deals/{ids['C']}/move", json={"stage": "New", "index": 2})
    assert r.status_code == 200 and column(empty_client, "New") == ["B", "A", "C"]
    assert stage_changes(empty_client, ids["C"]) == []

    moved = empty_client.post(f"/api/deals/{ids['A']}/move", json={"stage": "Proposal", "index": 1}).json()
    assert (moved["stage"], moved["probability"]) == ("Proposal", 50)
    assert column(empty_client, "New") == ["B", "C"]
    assert column(empty_client, "Proposal") == ["Y", "A", "X"]
    assert stage_changes(empty_client, ids["A"]) == [("New", "Proposal")]

    empty_client.post(f"/api/deals/{ids['B']}/move", json={"stage": "Proposal", "index": 99})
    assert column(empty_client, "Proposal") == ["Y", "A", "X", "B"]
    positions = sorted(d["position"] for d in empty_client.get("/api/deals").json() if d["stage"] == "Proposal")
    assert positions == [0, 1, 2, 3]

    won = empty_client.post(f"/api/deals/{ids['X']}/move", json={"stage": "Won", "index": 0}).json()
    assert (won["close_date"], won["probability"]) == ("2026-11-15", 100)


def test_detail_has_names_and_timeline(empty_client, org):  # R33
    person = make_contact(empty_client, "Ann")
    d = make_deal(empty_client, org["id"], main_contact_id=person["id"])
    detail = empty_client.get(f"/api/deals/{d['id']}").json()
    assert (detail["organization_name"], detail["contact_name"], detail["timeline"]) == ("Acme", "Ann", [])
    assert empty_client.get("/api/deals/999").status_code == 404


def test_delete_removes_history_and_only_deal_activities(empty_client, org):  # R26, R29
    person = make_contact(empty_client)
    d = make_deal(empty_client, org["id"], "Doomed")
    empty_client.post(f"/api/deals/{d['id']}/move", json={"stage": "Qualified", "index": 0})
    make_activity(empty_client, deal_id=d["id"])
    make_activity(empty_client, deal_id=d["id"])
    shared = make_activity(empty_client, deal_id=d["id"], contact_id=person["id"])
    preview = empty_client.get(f"/api/deals/{d['id']}/delete-preview").json()
    assert (preview["activities_deleted"], preview["activities_kept"], preview["stage_changes"]) == (2, 1, 1)
    assert preview["message"] == (
        "Delete Doomed? 2 activities will be deleted. 1 activity also linked to a contact will stay on that contact. "
        "Its stage history will be deleted."
    )
    assert empty_client.delete(f"/api/deals/{d['id']}").status_code == 204
    timeline = empty_client.get(f"/api/contacts/{person['id']}").json()["timeline"]
    assert [(a["id"], a["deal_id"]) for a in timeline] == [(shared["id"], None)]
    assert empty_client.get("/api/deals").json() == []
