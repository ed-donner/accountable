"""TB14 to TB16: contacts."""


# TB14
def test_create_read_update_delete(api, client):
    contact = api.contact("Ada Park", email="ada@acme.com", phone="555 0100", job_title="CFO")
    assert contact["status"] == "lead"
    assert api.ok("GET", f"/api/contacts/{contact['id']}")["email"] == "ada@acme.com"
    updated = api.ok("PATCH", f"/api/contacts/{contact['id']}", json={"status": "qualified"})
    assert updated["status"] == "qualified"
    assert updated["job_title"] == "CFO"
    assert client.delete(f"/api/contacts/{contact['id']}").status_code == 204
    assert client.get(f"/api/contacts/{contact['id']}").status_code == 404


def test_name_required_and_email_checked(client):
    response = client.post("/api/contacts", json={"email": "nope"})
    assert response.status_code == 400
    assert response.json()["fields"] == {
        "name": "Enter a name.",
        "email": "Enter an email address like name@company.com.",
    }


def test_bad_status_refused(client):
    response = client.post("/api/contacts", json={"name": "A", "status": "vip"})
    assert response.json()["fields"] == {"status": "Choose lead, qualified or customer."}


def test_unknown_organization_refused(client):
    response = client.post("/api/contacts", json={"name": "A", "organization_id": 999})
    assert response.status_code == 400
    assert "organization_id" in response.json()["fields"]


# TB15
def test_status_filter_and_counts(api):
    api.contact("A")
    api.contact("B", status="qualified")
    api.contact("C", status="customer")
    api.contact("D", status="customer")
    everyone = api.ok("GET", "/api/contacts")
    assert everyone["total"] == 4
    assert everyone["status_counts"] == {
        "all": 4,
        "lead": 1,
        "qualified": 1,
        "customer": 2,
    }
    customers = api.ok("GET", "/api/contacts?status=customer")
    assert [c["name"] for c in customers["items"]] == ["C", "D"]
    assert customers["total"] == 2
    assert customers["status_counts"]["all"] == 4


def test_last_activity_date_includes_their_deals(api):
    org = api.org()
    contact = api.contact(organization_id=org["id"])
    deal = api.deal(org["id"], contact_id=contact["id"])
    api.activity(contact_id=contact["id"], occurred_on="2026-10-01")
    api.activity(deal_id=deal["id"], occurred_on="2026-11-02")
    row = api.ok("GET", "/api/contacts")["items"][0]
    assert row["last_activity_on"] == "2026-11-02"
    assert row["organization_name"] == "Acme Ltd"


def test_page_has_organization_and_deals(api):
    org = api.org()
    contact = api.contact(organization_id=org["id"])
    deal = api.deal(org["id"], contact_id=contact["id"])
    page = api.ok("GET", f"/api/contacts/{contact['id']}")
    assert page["organization"] == {"id": org["id"], "name": "Acme Ltd"}
    assert [d["id"] for d in page["deals"]] == [deal["id"]]


# TB16
def test_delete_keeps_deals_and_removes_own_activities(api, client, activity_exists):
    org = api.org()
    contact = api.contact(organization_id=org["id"])
    deal = api.deal(org["id"], contact_id=contact["id"])
    own = api.activity(contact_id=contact["id"])
    on_deal = api.activity(deal_id=deal["id"])
    impact = api.ok("GET", f"/api/contacts/{contact['id']}/delete-impact")
    assert impact == {"name": "Ada Park", "deals": 1, "activities": 1}
    assert client.delete(f"/api/contacts/{contact['id']}").status_code == 204
    assert api.ok("GET", f"/api/deals/{deal['id']}")["contact_id"] is None
    assert not activity_exists(own["id"])
    assert activity_exists(on_deal["id"])
