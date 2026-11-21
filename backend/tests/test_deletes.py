from backend.tests.conftest import add_contact, add_deal, add_org, assert_numbered, column_ids, log, ok, patch_deal


def test_an_organization_without_deals(client):
    org = add_org(client, "Bluefin Logistics")
    contacts = [add_contact(client, name, organization_id=org["id"]) for name in ("Sarah", "Tom", "Ana")]

    assert ok(client.get(f"/api/organizations/{org['id']}/delete-impact")) == {"contacts": 3, "deals": []}
    assert client.delete(f"/api/organizations/{org['id']}").status_code == 204

    # Its contacts stay, with no organization (DEL-2).
    for contact in contacts:
        assert ok(client.get(f"/api/contacts/{contact['id']}"))["organization"] is None
    assert client.get(f"/api/organizations/{org['id']}").status_code == 404


def test_an_organization_with_deals_cant_be_deleted(client):
    org = add_org(client, "Bluefin Logistics")
    add_contact(client, organization_id=org["id"])
    deal = add_deal(client, org["id"], "Website redesign", stage="proposal", value=48500)

    impact = ok(client.get(f"/api/organizations/{org['id']}/delete-impact"))
    assert impact == {
        "contacts": 1,
        "deals": [{"id": deal["id"], "name": "Website redesign", "stage": "proposal", "value": 48500}],
    }

    response = client.delete(f"/api/organizations/{org['id']}")
    assert response.status_code == 409
    assert response.json() == {
        "detail": (
            "Bluefin Logistics can't be deleted while it has deals. "
            "Move these deals to another organization or delete them first:"
        ),
        "deals": impact["deals"],
    }
    # Nothing changed (DEL-3).
    page = ok(client.get(f"/api/organizations/{org['id']}"))
    assert len(page["contacts"]) == 1 and len(page["deals"]) == 1


def test_a_contact(client):
    org = add_org(client)
    sarah = add_contact(client, "Sarah Chen", organization_id=org["id"])
    first = add_deal(client, org["id"], "Website redesign", main_contact_id=sarah["id"])
    second = add_deal(client, org["id"], "Q1 SEO retainer", main_contact_id=sarah["id"])
    for _ in range(6):
        log(client, contact_id=sarah["id"])
    on_deal = log(client, "Kept with the deal", deal_id=first["id"])

    impact = ok(client.get(f"/api/contacts/{sarah['id']}/delete-impact"))
    assert impact == {
        "activities": 6,
        "deals": [{"id": second["id"], "name": "Q1 SEO retainer"}, {"id": first["id"], "name": "Website redesign"}],
    }
    assert client.delete(f"/api/contacts/{sarah['id']}").status_code == 204

    # The activities logged on her are deleted, and the deals stay with no main contact (DEL-4).
    assert client.get(f"/api/contacts/{sarah['id']}").status_code == 404
    for deal in (first, second):
        assert ok(client.get(f"/api/deals/{deal['id']}"))["main_contact"] is None
    assert [e["id"] for e in ok(client.get(f"/api/deals/{first['id']}/timeline"))] == [on_deal["id"]]


def test_a_deal(client):
    org = add_org(client)
    keep = add_deal(client, org["id"], "Kept", stage="negotiation")
    deal = add_deal(client, org["id"], "Website redesign", stage="proposal")
    log(client, deal_id=deal["id"])
    log(client, deal_id=deal["id"])
    patch_deal(client, deal["id"], stage="negotiation")
    patch_deal(client, deal["id"], stage="won")

    assert ok(client.get(f"/api/deals/{deal['id']}/delete-impact")) == {"activities": 4, "stage_changes": 2}
    assert client.delete(f"/api/deals/{deal['id']}").status_code == 204

    assert client.get(f"/api/deals/{deal['id']}").status_code == 404
    assert client.get(f"/api/deals/{deal['id']}/timeline").status_code == 404
    assert column_ids(client, "negotiation") == [keep["id"]]
    assert_numbered(client, "negotiation", "won")


def test_deleting_a_deal_numbers_its_column_again(client):
    org = add_org(client)
    ids = [add_deal(client, org["id"], name)["id"] for name in ("A", "B", "C")]
    assert client.delete(f"/api/deals/{ids[1]}").status_code == 204
    assert column_ids(client, "proposal") == [ids[2], ids[0]]
    assert_numbered(client, "proposal")


def test_a_deal_without_stage_changes(client):
    org = add_org(client)
    deal = add_deal(client, org["id"])
    log(client, deal_id=deal["id"])
    assert ok(client.get(f"/api/deals/{deal['id']}/delete-impact")) == {"activities": 1, "stage_changes": 0}


def test_an_activity(client):
    contact = add_contact(client)
    entry = log(client, contact_id=contact["id"])
    assert client.delete(f"/api/activities/{entry['id']}").status_code == 204
    assert ok(client.get(f"/api/contacts/{contact['id']}/timeline")) == []
