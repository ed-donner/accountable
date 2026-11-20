import pytest

from backend.tests.conftest import add_contact, add_deal, add_org, field_errors, log, ok, patch_deal, stage_changes


@pytest.fixture
def records(client):
    org = add_org(client)
    contact = add_contact(client, "Sarah Chen", organization_id=org["id"])
    deal = add_deal(client, org["id"], "Website redesign", main_contact_id=contact["id"])
    return {"contact": contact, "deal": deal}


def test_log_on_a_contact(client, records):
    entry = log(client, "Intro call", contact_id=records["contact"]["id"])
    assert entry == {
        "id": entry["id"],
        "type": "call",
        "description": "Intro call",
        "occurred_at": "2026-11-10T15:15:00Z",
        "follow_up_date": None,
        "done": False,
        "from_stage": None,
        "to_stage": None,
        "contact": {"id": records["contact"]["id"], "name": "Sarah Chen"},
        "deal": None,
    }


def test_log_on_a_deal(client, records):
    entry = log(client, "Sent the proposal", type="email", deal_id=records["deal"]["id"])
    assert entry["deal"] == {"id": records["deal"]["id"], "name": "Website redesign"}
    assert entry["contact"] is None and entry["type"] == "email"


def test_both_or_neither_link_is_refused(client, records):
    base = {"type": "note", "description": "Hi", "occurred_at": "2026-11-10T15:15:00Z"}
    both = {**base, "contact_id": records["contact"]["id"], "deal_id": records["deal"]["id"]}
    assert client.post("/api/activities", json=both).status_code == 422
    assert client.post("/api/activities", json=base).status_code == 422


def test_a_stage_change_cant_be_logged(client, records):
    body = {
        "type": "stage_change",
        "description": "Moved",
        "occurred_at": "2026-11-10T15:15:00Z",
        "deal_id": records["deal"]["id"],
    }
    assert "type" in field_errors(client.post("/api/activities", json=body))


def test_the_link_must_exist(client, records):
    body = {"type": "note", "description": "Hi", "occurred_at": "2026-11-10T15:15:00Z"}
    assert field_errors(client.post("/api/activities", json={**body, "contact_id": 999})) == {
        "contact_id": "That contact no longer exists."
    }
    assert field_errors(client.post("/api/activities", json={**body, "deal_id": 999})) == {
        "deal_id": "That deal no longer exists."
    }


def test_description_rules(client, records):
    body = {"type": "note", "occurred_at": "2026-11-10T15:15:00Z", "contact_id": records["contact"]["id"]}
    assert field_errors(client.post("/api/activities", json={**body, "description": "  "})) == {
        "description": "Enter a description."
    }
    assert field_errors(client.post("/api/activities", json={**body, "description": "x" * 5001})) == {
        "description": "Use 5,000 characters or fewer."
    }
    assert log(client, "x" * 5000, contact_id=records["contact"]["id"])["description"] == "x" * 5000


def test_line_breaks_are_kept(client, records):
    assert log(client, "One\nTwo\n\nThree", contact_id=records["contact"]["id"])["description"] == "One\nTwo\n\nThree"


def test_a_follow_up_is_optional_starts_not_done_and_can_be_in_the_past(client, records):
    contact_id = records["contact"]["id"]
    assert log(client, contact_id=contact_id)["follow_up_date"] is None
    future = log(client, contact_id=contact_id, follow_up_date="2026-11-22")
    assert (future["follow_up_date"], future["done"]) == ("2026-11-22", False)
    assert log(client, contact_id=contact_id, follow_up_date="2026-11-01")["follow_up_date"] == "2026-11-01"


def test_edit_every_editable_field(client, records):
    entry = log(client, "Old", contact_id=records["contact"]["id"])
    changed = ok(
        client.patch(
            f"/api/activities/{entry['id']}",
            json={
                "type": "note",
                "description": "New",
                "occurred_at": "2026-11-12T09:30:00Z",
                "follow_up_date": "2026-11-25",
                "done": True,
            },
        )
    )
    assert (changed["type"], changed["description"], changed["occurred_at"]) == ("note", "New", "2026-11-12T09:30:00Z")
    assert (changed["follow_up_date"], changed["done"]) == ("2026-11-25", True)


def test_done_can_be_ticked_and_unticked(client, records):
    entry = log(client, contact_id=records["contact"]["id"], follow_up_date="2026-11-21")
    assert ok(client.patch(f"/api/activities/{entry['id']}", json={"done": True}))["done"] is True
    assert ok(client.patch(f"/api/activities/{entry['id']}", json={"done": False}))["done"] is False


def test_an_activity_without_a_follow_up_is_never_done(client, records):
    entry = log(client, contact_id=records["contact"]["id"])
    assert ok(client.patch(f"/api/activities/{entry['id']}", json={"done": True}))["done"] is False
    followed = log(client, contact_id=records["contact"]["id"], follow_up_date="2026-11-21")
    ok(client.patch(f"/api/activities/{followed['id']}", json={"done": True}))
    cleared = ok(client.patch(f"/api/activities/{followed['id']}", json={"follow_up_date": None}))
    assert cleared["done"] is False


def test_the_link_cant_be_changed(client, records):
    entry = log(client, contact_id=records["contact"]["id"])
    assert client.patch(f"/api/activities/{entry['id']}", json={"deal_id": records["deal"]["id"]}).status_code == 422


def test_stage_changes_cant_be_changed_or_deleted(client, records):
    patch_deal(client, records["deal"]["id"], stage="negotiation")
    [entry] = stage_changes(client, records["deal"]["id"])
    for response in [
        client.patch(f"/api/activities/{entry['id']}", json={"description": "Edited"}),
        client.delete(f"/api/activities/{entry['id']}"),
    ]:
        assert response.status_code == 409
        assert response.json() == {"detail": "Stage changes can't be changed or deleted."}
    assert stage_changes(client, records["deal"]["id"]) == [entry]


def test_a_time_with_an_offset_is_stored_as_the_same_moment_in_utc(client, records):
    entry = log(client, contact_id=records["contact"]["id"], occurred_at="2026-11-10T20:45:00+05:30")
    assert entry["occurred_at"] == "2026-11-10T15:15:00Z"
    [stored] = ok(client.get(f"/api/contacts/{records['contact']['id']}/timeline"))
    assert stored["occurred_at"] == "2026-11-10T15:15:00Z"


def test_a_time_without_a_zone_is_refused(client, records):
    body = {"type": "note", "description": "Hi", "occurred_at": "2026-11-10T15:15:00", "contact_id": 1}
    assert "occurred_at" in field_errors(client.post("/api/activities", json=body))


def test_delete_an_activity(client, records):
    entry = log(client, contact_id=records["contact"]["id"])
    assert client.delete(f"/api/activities/{entry['id']}").status_code == 204
    assert client.patch(f"/api/activities/{entry['id']}", json={"done": True}).status_code == 404
    assert client.delete(f"/api/activities/{entry['id']}").status_code == 404
