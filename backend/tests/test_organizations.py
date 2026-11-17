"""TB10 to TB13: organizations."""


# TB10
def test_create_read_update_delete(api, client):
    org = api.org("Acme Ltd", industry="Software", notes="Met at a fair")
    assert org["name"] == "Acme Ltd"
    read = api.ok("GET", f"/api/organizations/{org['id']}")
    assert read["industry"] == "Software"
    updated = api.ok("PATCH", f"/api/organizations/{org['id']}", json={"name": "Acme Group"})
    assert updated["name"] == "Acme Group"
    assert updated["industry"] == "Software"
    assert client.delete(f"/api/organizations/{org['id']}").status_code == 204
    assert client.get(f"/api/organizations/{org['id']}").status_code == 404


def test_name_required(client):
    for body in ({}, {"name": ""}, {"name": "   "}):
        response = client.post("/api/organizations", json=body)
        assert response.status_code == 400
        assert response.json()["fields"] == {"name": "Enter a name."}


def test_name_cannot_be_cleared(api, client):
    org = api.org()
    response = client.patch(f"/api/organizations/{org['id']}", json={"name": None})
    assert response.status_code == 400
    assert response.json()["fields"]["name"] == "Enter a name."


# TB11
def test_website_gets_https(api):
    assert api.org(website="acme.com")["website"] == "https://acme.com"
    assert api.org(website="http://acme.com/about")["website"] == "http://acme.com/about"
    assert api.org(website="")["website"] is None


def test_website_format_checked(client):
    response = client.post("/api/organizations", json={"name": "X", "website": "not a website"})
    assert response.status_code == 400
    assert response.json()["fields"] == {"website": "Enter a website like company.com."}


# TB12
def test_list_has_counts_and_open_value(api):
    org = api.org()
    api.org("Empty Co")
    api.contact(organization_id=org["id"])
    api.contact("Bo", organization_id=org["id"])
    api.deal(org["id"], value=1000, stage="new")
    api.deal(org["id"], value=2500, stage="negotiation")
    api.deal(org["id"], value=9999, stage="won")
    listing = api.ok("GET", "/api/organizations")
    assert listing["total"] == 2
    row = next(item for item in listing["items"] if item["id"] == org["id"])
    assert (row["contact_count"], row["open_deal_count"], row["open_value"]) == (2, 2, 3500)
    empty = next(item for item in listing["items"] if item["name"] == "Empty Co")
    assert (empty["contact_count"], empty["open_deal_count"], empty["open_value"]) == (0, 0, 0)


def test_list_takes_limit_and_offset(api):
    for name in "ABCDE":
        api.org(name)
    page = api.ok("GET", "/api/organizations?limit=2&offset=2")
    assert [item["name"] for item in page["items"]] == ["C", "D"]
    assert page["total"] == 5


def test_page_has_contacts_and_deals(api):
    org = api.org()
    contact = api.contact(organization_id=org["id"])
    deal = api.deal(org["id"], contact_id=contact["id"])
    page = api.ok("GET", f"/api/organizations/{org['id']}")
    assert [c["id"] for c in page["contacts"]] == [contact["id"]]
    assert [d["id"] for d in page["deals"]] == [deal["id"]]
    assert page["deals"][0]["contact_name"] == "Ada Park"


# TB13
def test_delete_keeps_contacts_deals_and_activities(api, client):
    org = api.org()
    contact = api.contact(organization_id=org["id"])
    deal = api.deal(org["id"], contact_id=contact["id"])
    api.activity(contact_id=contact["id"])
    api.activity(deal_id=deal["id"])
    impact = api.ok("GET", f"/api/organizations/{org['id']}/delete-impact")
    assert impact == {"name": "Acme Ltd", "contacts": 1, "deals": 1}
    assert client.delete(f"/api/organizations/{org['id']}").status_code == 204
    assert api.ok("GET", f"/api/contacts/{contact['id']}")["organization_id"] is None
    assert api.ok("GET", f"/api/deals/{deal['id']}")["organization_id"] is None
    assert len(api.ok("GET", f"/api/contacts/{contact['id']}/timeline")["items"]) == 3
