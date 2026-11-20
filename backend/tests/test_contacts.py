import pytest

from backend.tests.conftest import add_contact, add_deal, add_org, field_errors, ok, patch_deal

EMAIL_MESSAGE = "Enter an email address, such as sarah@bluefin.example"


def test_a_new_contact_starts_as_lead(client):
    contact = add_contact(client, "Sarah Chen")
    assert contact["status"] == "lead"
    assert contact["organization"] is None


@pytest.mark.parametrize("status", ["lead", "qualified", "customer"])
def test_the_three_statuses_are_accepted(client, status):
    assert add_contact(client, status=status)["status"] == status


def test_other_statuses_are_refused(client):
    assert "status" in field_errors(client.post("/api/contacts", json={"name": "Sarah", "status": "friend"}))


@pytest.mark.parametrize("email", ["sarah@bluefin.example", "s.chen+crm@mail.bluefin.example"])
def test_good_emails(client, email):
    assert add_contact(client, email=email)["email"] == email


@pytest.mark.parametrize("email", ["sarah", "sarah@bluefin", "@bluefin.example", "sarah chen@bluefin.example"])
def test_bad_emails(client, email):
    assert field_errors(client.post("/api/contacts", json={"name": "Sarah", "email": email})) == {
        "email": EMAIL_MESSAGE
    }


def test_an_empty_email_is_nothing(client):
    assert add_contact(client, email="")["email"] is None


def test_field_rules(client):
    assert field_errors(client.post("/api/contacts", json={"name": " "})) == {"name": "Enter a name."}
    assert "phone" in field_errors(client.post("/api/contacts", json={"name": "S", "phone": "1" * 41}))
    assert "job_title" in field_errors(client.post("/api/contacts", json={"name": "S", "job_title": "x" * 121}))


def test_the_organization_is_optional_but_must_exist(client):
    errors = field_errors(client.post("/api/contacts", json={"name": "Sarah", "organization_id": 999}))
    assert errors == {"organization_id": "Choose an organization from the list."}


def test_the_list_includes_the_organization_name(client):
    org = add_org(client, "Bluefin Logistics")
    add_contact(client, "Sarah Chen", organization_id=org["id"])
    add_contact(client, "adam Lone")
    rows = ok(client.get("/api/contacts"))
    assert [r["name"] for r in rows] == ["adam Lone", "Sarah Chen"]
    assert rows[1]["organization"] == {"id": org["id"], "name": "Bluefin Logistics"}


def test_the_page_lists_the_deals_where_they_are_the_main_contact(client):
    org = add_org(client)
    sarah = add_contact(client, "Sarah Chen", organization_id=org["id"])
    tom = add_contact(client, "Tom Reyes", organization_id=org["id"])
    add_deal(client, org["id"], "Website redesign", main_contact_id=sarah["id"])
    add_deal(client, org["id"], "Tom's deal", main_contact_id=tom["id"])
    page = ok(client.get(f"/api/contacts/{sarah['id']}"))
    assert [d["name"] for d in page["deals"]] == ["Website redesign"]
    assert page["organization"]["name"] == "Bluefin Logistics"


def test_change_a_status(client):
    contact = add_contact(client)
    saved = ok(client.patch(f"/api/contacts/{contact['id']}", json={"status": "qualified"}))
    assert saved["contact"]["status"] == "qualified"
    assert saved["unlinked_deals"] == []


def test_winning_a_deal_leaves_the_status_alone(client):
    org = add_org(client)
    sarah = add_contact(client, organization_id=org["id"])
    deal = add_deal(client, org["id"], main_contact_id=sarah["id"])
    patch_deal(client, deal["id"], stage="won")
    assert ok(client.get(f"/api/contacts/{sarah['id']}"))["status"] == "lead"


def test_changing_the_organization_unlinks_their_deals_there(client):
    bluefin = add_org(client, "Bluefin")
    cedar = add_org(client, "Cedar")
    sarah = add_contact(client, organization_id=bluefin["id"])
    deal = add_deal(client, bluefin["id"], "Website redesign", main_contact_id=sarah["id"])

    saved = ok(client.patch(f"/api/contacts/{sarah['id']}", json={"organization_id": cedar["id"]}))
    assert saved["unlinked_deals"] == [{"id": deal["id"], "name": "Website redesign"}]
    assert saved["contact"]["organization"]["name"] == "Cedar"
    assert ok(client.get(f"/api/deals/{deal['id']}"))["main_contact"] is None


def test_removing_the_organization_unlinks_their_deals_there(client):
    bluefin = add_org(client, "Bluefin")
    sarah = add_contact(client, organization_id=bluefin["id"])
    deal = add_deal(client, bluefin["id"], "Website redesign", main_contact_id=sarah["id"])

    saved = ok(client.patch(f"/api/contacts/{sarah['id']}", json={"organization_id": None}))
    assert saved["unlinked_deals"] == [{"id": deal["id"], "name": "Website redesign"}]
    assert saved["contact"]["organization"] is None
    assert ok(client.get(f"/api/deals/{deal['id']}"))["main_contact"] is None


def test_an_unchanged_organization_unlinks_nothing(client):
    bluefin = add_org(client, "Bluefin")
    sarah = add_contact(client, organization_id=bluefin["id"])
    deal = add_deal(client, bluefin["id"], main_contact_id=sarah["id"])

    saved = ok(client.patch(f"/api/contacts/{sarah['id']}", json={"organization_id": bluefin["id"], "name": "Sarah C"}))
    assert saved["unlinked_deals"] == []
    assert ok(client.get(f"/api/deals/{deal['id']}"))["main_contact"]["id"] == sarah["id"]


def test_unknown_id_gives_404(client):
    for response in [
        client.get("/api/contacts/999"),
        client.patch("/api/contacts/999", json={"name": "X"}),
        client.get("/api/contacts/999/timeline"),
        client.get("/api/contacts/999/delete-impact"),
        client.delete("/api/contacts/999"),
    ]:
        assert response.status_code == 404
        assert response.json() == {"detail": "Contact not found"}
