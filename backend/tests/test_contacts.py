"""Contacts (R9, R23, R26, R28, R32)."""

from .conftest import make_activity, make_contact, make_deal, make_org


def test_required_name_and_allowed_statuses(empty_client):  # R9
    assert empty_client.post("/api/contacts", json={"name": ""}).json()["fields"]["name"] == "This is required"
    r = empty_client.post("/api/contacts", json={"name": "Jo", "status": "vip"})
    assert r.status_code == 422 and r.json()["fields"]["status"] == "Choose one of the options"
    assert make_contact(empty_client, "Jo")["status"] == "lead"  # default
    r = empty_client.post("/api/contacts", json={"name": "Jo", "organization_id": 999})
    assert r.status_code == 422 and "organization_id" in r.json()["fields"]


def test_status_filter_and_organization_name(empty_client):  # R23
    org = make_org(empty_client, "Acme")
    make_contact(empty_client, "Lee", status="lead")
    make_contact(empty_client, "Cat", status="customer", organization_id=org["id"])
    customers = empty_client.get("/api/contacts", params={"status": "customer"}).json()
    assert [(c["name"], c["organization_name"]) for c in customers] == [("Cat", "Acme")]
    assert len(empty_client.get("/api/contacts").json()) == 2


def test_detail_has_deals_and_timeline(empty_client):  # R32
    org = make_org(empty_client)
    person = make_contact(empty_client, organization_id=org["id"])
    make_deal(empty_client, org["id"], "Theirs", main_contact_id=person["id"])
    make_activity(empty_client, contact_id=person["id"], description="Called")
    detail = empty_client.get(f"/api/contacts/{person['id']}").json()
    assert detail["organization_name"] == "Acme"
    assert [d["name"] for d in detail["deals"]] == ["Theirs"]
    assert [a["description"] for a in detail["timeline"]] == ["Called"]


def test_delete_unlinks_deals_and_keeps_shared_activities(empty_client):  # R26, R28
    org = make_org(empty_client)
    person = make_contact(empty_client, "Jane Doe")
    deal_a = make_deal(empty_client, org["id"], "A", main_contact_id=person["id"])
    make_deal(empty_client, org["id"], "B", main_contact_id=person["id"])
    for _ in range(5):
        make_activity(empty_client, contact_id=person["id"])
    shared = make_activity(empty_client, contact_id=person["id"], deal_id=deal_a["id"], description="Shared")

    preview = empty_client.get(f"/api/contacts/{person['id']}/delete-preview").json()
    assert preview["message"] == (
        "Delete Jane Doe? Their 2 deals will stay, with no main contact. 5 activities will be deleted. "
        "1 activity also linked to a deal will stay on that deal."
    )
    assert empty_client.delete(f"/api/contacts/{person['id']}").status_code == 204
    deals = empty_client.get("/api/deals").json()
    assert [d["main_contact_id"] for d in deals] == [None, None]
    timeline = empty_client.get(f"/api/deals/{deal_a['id']}").json()["timeline"]
    assert [(a["id"], a["contact_id"]) for a in timeline] == [(shared["id"], None)]
