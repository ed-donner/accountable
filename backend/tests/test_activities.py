"""TB25 and TB26: activities."""


# TB25
def test_required_fields(client):
    response = client.post("/api/activities", json={"contact_id": 1})
    assert response.status_code == 400
    assert response.json()["fields"] == {
        "type": "Choose note, call or email.",
        "description": "Enter a description.",
        "occurred_on": "Enter the date it happened.",
    }


def test_exactly_one_contact_or_deal(api, client):
    org = api.org()
    contact = api.contact()
    deal = api.deal(org["id"])
    base = {"type": "call", "description": "x", "occurred_on": "2026-11-16"}
    for parents in ({}, {"contact_id": contact["id"], "deal_id": deal["id"]}):
        response = client.post("/api/activities", json={**base, **parents})
        assert response.status_code == 400
        assert "contact_id" in response.json()["fields"]
    assert api.activity(contact_id=contact["id"])["contact_id"] == contact["id"]
    assert api.activity(deal_id=deal["id"])["deal_id"] == deal["id"]


def test_done_only_with_follow_up(api, client):
    contact = api.contact()
    body = {
        "type": "call",
        "description": "x",
        "occurred_on": "2026-11-16",
        "contact_id": contact["id"],
        "done": True,
    }
    response = client.post("/api/activities", json=body)
    assert response.json()["fields"] == {"done": "Only a follow-up can be marked done."}
    ok = api.activity(contact_id=contact["id"], follow_up_on="2026-11-20", done=True)
    assert ok["follow_up_status"] == "done"


# TB26
def test_edit_delete_and_mark_done(api, client, activity_exists):
    contact = api.contact()
    activity = api.activity(contact_id=contact["id"], follow_up_on="2026-11-12")
    assert activity["follow_up_status"] == "overdue"
    edited = api.ok(
        "PATCH",
        f"/api/activities/{activity['id']}",
        json={"description": "Called back", "type": "email"},
    )
    assert (edited["description"], edited["type"]) == ("Called back", "email")
    done = api.ok("PATCH", f"/api/activities/{activity['id']}", json={"done": True})
    assert done["done"] is True
    assert done["follow_up_status"] == "done"
    cleared = api.ok("PATCH", f"/api/activities/{activity['id']}", json={"follow_up_on": None})
    assert cleared["done"] is False
    assert client.delete(f"/api/activities/{activity['id']}").status_code == 204
    assert not activity_exists(activity["id"])


def test_there_is_no_endpoint_to_read_one_activity(api, client):
    """The spec's API has no GET for a single activity; the timelines show them."""
    contact = api.contact()
    activity = api.activity(contact_id=contact["id"])
    assert client.get(f"/api/activities/{activity['id']}").status_code == 405
