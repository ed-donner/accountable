"""Organizations (R8, R26, R27, R31)."""

from .conftest import make_contact, make_deal, make_org


def test_name_is_required(empty_client):  # R8
    r = empty_client.post("/api/organizations", json={"name": "  "})
    assert r.status_code == 422
    assert r.json()["fields"]["name"] == "This is required"
    org = make_org(empty_client)
    r = empty_client.patch(f"/api/organizations/{org['id']}", json={"name": None})
    assert r.status_code == 422


def test_list_has_counts_and_open_value(empty_client):
    org = make_org(empty_client, "Acme", industry="Retail", website="https://acme.example.com")
    make_contact(empty_client, organization_id=org["id"])
    make_deal(empty_client, org["id"], value_cents=500_000, stage="Proposal")
    make_deal(empty_client, org["id"], value_cents=200_000, stage="Won")
    [row] = empty_client.get("/api/organizations").json()
    assert (row["contact_count"], row["deal_count"], row["open_deal_value_cents"]) == (1, 2, 500_000)


def test_detail_has_contacts_and_deals(empty_client):  # R31
    org = make_org(empty_client)
    make_contact(empty_client, "Ann", organization_id=org["id"])
    make_deal(empty_client, org["id"], "Big deal")
    detail = empty_client.get(f"/api/organizations/{org['id']}").json()
    assert [c["name"] for c in detail["contacts"]] == ["Ann"]
    assert [d["name"] for d in detail["deals"]] == ["Big deal"]
    assert empty_client.get("/api/organizations/999").status_code == 404


def test_edit(empty_client):
    org = make_org(empty_client)
    r = empty_client.patch(f"/api/organizations/{org['id']}", json={"industry": "Software"})
    assert r.json()["industry"] == "Software" and r.json()["name"] == "Acme"


def test_cannot_delete_while_it_has_deals(empty_client):  # R26, R27
    org = make_org(empty_client)
    for i in range(3):
        make_deal(empty_client, org["id"], f"Deal {i}")
    preview = empty_client.get(f"/api/organizations/{org['id']}/delete-preview").json()
    assert preview["blocked"] is True
    assert preview["message"] == "Acme has 3 deals. Move them to another organization or delete them first."
    r = empty_client.delete(f"/api/organizations/{org['id']}")
    assert r.status_code == 409
    assert "3 deals" in r.json()["detail"]


def test_delete_leaves_contacts_without_organization(empty_client):  # R26, R27
    org = make_org(empty_client)
    person = make_contact(empty_client, organization_id=org["id"])
    preview = empty_client.get(f"/api/organizations/{org['id']}/delete-preview").json()
    assert preview == {
        "blocked": False,
        "deal_count": 0,
        "contact_count": 1,
        "message": "Delete Acme? Its 1 contact will stay, with no organization.",
    }
    assert empty_client.delete(f"/api/organizations/{org['id']}").status_code == 204
    assert empty_client.get(f"/api/contacts/{person['id']}").json()["organization_id"] is None
    assert empty_client.get("/api/organizations").json() == []
