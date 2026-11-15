"""Activities, timelines and follow-ups (R11, R30, R34–R38, D5)."""

from .conftest import make_activity, make_contact, make_deal, make_org


def test_needs_a_contact_or_a_deal(empty_client):  # R11
    r = empty_client.post("/api/activities", json={"kind": "note", "description": "Lonely"})
    assert r.status_code == 422 and r.json()["fields"]["contact_id"] == "Link it to a contact or a deal"
    r = empty_client.post("/api/activities", json={"kind": "note", "description": "", "contact_id": 1})
    assert r.json()["fields"]["description"] == "This is required"
    r = empty_client.post("/api/activities", json={"kind": "stage_change", "description": "x", "contact_id": 1})
    assert r.status_code == 422


def test_shows_in_both_timelines_newest_first(empty_client):  # R34, R36
    org = make_org(empty_client)
    person = make_contact(empty_client)
    deal = make_deal(empty_client, org["id"])
    make_activity(empty_client, contact_id=person["id"], description="Older", occurred_at="2026-11-01T10:00:00Z")
    make_activity(empty_client, contact_id=person["id"], deal_id=deal["id"], description="Newer", occurred_at="2026-11-10T10:00:00Z")
    contact_tl = empty_client.get("/api/activities", params={"contact_id": person["id"]}).json()
    deal_tl = empty_client.get("/api/activities", params={"deal_id": deal["id"]}).json()
    assert [a["description"] for a in contact_tl] == ["Newer", "Older"]
    assert [a["description"] for a in deal_tl] == ["Newer"]
    assert deal_tl[0]["contact_name"] == "Jane Doe" and deal_tl[0]["deal_name"] == "Deal"


def test_edit_mark_done_and_delete(empty_client):  # R30, R37, R38
    person = make_contact(empty_client)
    a = make_activity(empty_client, contact_id=person["id"], follow_up_date="2026-11-20")
    assert a["follow_up_state"] == "upcoming"
    edited = empty_client.patch(f"/api/activities/{a['id']}", json={"description": "Changed", "done": True}).json()
    assert (edited["description"], edited["done"], edited["follow_up_state"]) == ("Changed", True, None)
    r = empty_client.patch(f"/api/activities/{a['id']}", json={"contact_id": None})
    assert r.status_code == 422  # would leave it linked to nothing
    assert empty_client.delete(f"/api/activities/{a['id']}").status_code == 204
    assert empty_client.get("/api/activities", params={"contact_id": person["id"]}).json() == []


def test_follow_up_states(empty_client):  # R38
    person = make_contact(empty_client)
    states = [
        make_activity(empty_client, contact_id=person["id"], follow_up_date=day)["follow_up_state"]
        for day in ["2026-11-14", "2026-11-15", "2026-11-16"]
    ]
    assert states == ["overdue", "today", "upcoming"]
    assert make_activity(empty_client, contact_id=person["id"])["follow_up_state"] is None


def test_stage_change_entries_cannot_be_edited_or_deleted(empty_client):  # D5
    org = make_org(empty_client)
    deal = make_deal(empty_client, org["id"])
    empty_client.post(f"/api/deals/{deal['id']}/move", json={"stage": "Qualified", "index": 0})
    [entry] = empty_client.get("/api/activities", params={"deal_id": deal["id"]}).json()
    assert entry["kind"] == "stage_change"
    assert empty_client.patch(f"/api/activities/{entry['id']}", json={"description": "x"}).status_code == 409
    assert empty_client.delete(f"/api/activities/{entry['id']}").status_code == 409
