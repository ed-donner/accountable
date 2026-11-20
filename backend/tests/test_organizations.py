import pytest

from backend.tests.conftest import add_contact, add_deal, add_org, field_errors, ok


def test_add_list_and_get(client):
    org = add_org(client, "Bluefin Logistics", website="bluefin.example", industry="Logistics", notes="Line one\nLine two")
    assert org["name"] == "Bluefin Logistics"
    assert org["website"] == "bluefin.example"
    assert org["notes"] == "Line one\nLine two"
    assert org["created_at"] == "2026-11-19T15:00:00Z"

    rows = ok(client.get("/api/organizations"))
    assert [r["name"] for r in rows] == ["Bluefin Logistics"]
    assert rows[0]["contact_count"] == 0 and rows[0]["open_deal_count"] == 0 and rows[0]["open_pipeline"] == 0

    page = ok(client.get(f"/api/organizations/{org['id']}"))
    assert page["industry"] == "Logistics"
    assert page["contacts"] == [] and page["deals"] == []


def test_list_is_sorted_by_name_ignoring_capitals(client):
    for name in ["cedar Health", "Bluefin", "Alder & Co"]:
        add_org(client, name)
    assert [r["name"] for r in ok(client.get("/api/organizations"))] == ["Alder & Co", "Bluefin", "cedar Health"]


def test_change_only_the_fields_sent(client):
    org = add_org(client, "Bluefin", website="bluefin.example", industry="Logistics")
    changed = ok(client.patch(f"/api/organizations/{org['id']}", json={"industry": "Freight"}))
    assert changed["industry"] == "Freight"
    assert changed["website"] == "bluefin.example"

    # Sending null clears an optional field.
    cleared = ok(client.patch(f"/api/organizations/{org['id']}", json={"website": None}))
    assert cleared["website"] is None
    assert cleared["industry"] == "Freight"


@pytest.mark.parametrize("name", ["", "   ", None])
def test_name_is_required(client, name):
    assert field_errors(client.post("/api/organizations", json={"name": name})) == {"name": "Enter a name."}


def test_name_is_required_when_left_out(client):
    assert "name" in field_errors(client.post("/api/organizations", json={}))


def test_name_length(client):
    add_org(client, "x" * 120)
    errors = field_errors(client.post("/api/organizations", json={"name": "y" * 121}))
    assert errors == {"name": "Use 120 characters or fewer."}


def test_name_is_trimmed(client):
    assert add_org(client, "  Bluefin  ")["name"] == "Bluefin"


def test_names_are_unique_ignoring_capitals_on_add(client):
    add_org(client, "Bluefin Logistics")
    errors = field_errors(client.post("/api/organizations", json={"name": "BLUEFIN logistics"}))
    assert errors == {"name": "An organization called Bluefin Logistics already exists."}


def test_names_are_unique_ignoring_capitals_on_rename(client):
    add_org(client, "Bluefin Logistics")
    other = add_org(client, "Cedar Health")
    errors = field_errors(client.patch(f"/api/organizations/{other['id']}", json={"name": "bluefin logistics"}))
    assert errors == {"name": "An organization called Bluefin Logistics already exists."}


def test_renaming_to_the_same_name_in_other_capitals_is_fine(client):
    org = add_org(client, "Bluefin Logistics")
    assert ok(client.patch(f"/api/organizations/{org['id']}", json={"name": "BlueFin Logistics"}))["name"] == "BlueFin Logistics"


@pytest.mark.parametrize(("field", "limit"), [("website", 200), ("industry", 60), ("notes", 5000)])
def test_optional_field_lengths(client, field, limit):
    add_org(client, "Fits", **{field: "a" * limit})
    errors = field_errors(client.post("/api/organizations", json={"name": "Too long", field: "a" * (limit + 1)}))
    assert errors == {field: f"Use {limit:,} characters or fewer."}


def test_empty_optional_fields_are_stored_as_nothing(client):
    org = add_org(client, "Bluefin", website="  ", industry="")
    assert org["website"] is None and org["industry"] is None


def test_list_figures_count_only_open_deals(client):
    org = add_org(client, "Bluefin")
    add_contact(client, "Sarah Chen", organization_id=org["id"])
    add_contact(client, "Tom Reyes", organization_id=org["id"])
    add_deal(client, org["id"], "Open one", stage="proposal", value=10000)
    add_deal(client, org["id"], "Open two", stage="new", value=5000)
    add_deal(client, org["id"], "Won", stage="won", value=20000)
    add_deal(client, org["id"], "Lost", stage="lost", value=7000)
    other = add_org(client, "Other")
    add_deal(client, other["id"], "Elsewhere", stage="proposal", value=99999)

    row = next(r for r in ok(client.get("/api/organizations")) if r["id"] == org["id"])
    assert (row["contact_count"], row["open_deal_count"], row["open_pipeline"]) == (2, 2, 15000)


def test_page_shows_its_figures_contacts_and_deals(client):
    org = add_org(client, "Bluefin")
    add_contact(client, "Tom Reyes", organization_id=org["id"], status="customer", job_title="CFO")
    add_contact(client, "Sarah Chen", organization_id=org["id"], job_title="Head of Ops")
    add_contact(client, "Elsewhere")
    add_deal(client, org["id"], "Open", stage="negotiation", value=10000, close_date="2027-01-10")
    add_deal(client, org["id"], "Won before", stage="won", value=20000, close_date="2026-03-01")
    add_deal(client, org["id"], "Won now", stage="won", value=5000)

    page = ok(client.get(f"/api/organizations/{org['id']}"))
    assert page["open_pipeline"] == 10000
    assert page["revenue_won"] == 25000
    assert page["contacts"] == [
        {"id": page["contacts"][0]["id"], "name": "Sarah Chen", "status": "lead", "job_title": "Head of Ops"},
        {"id": page["contacts"][1]["id"], "name": "Tom Reyes", "status": "customer", "job_title": "CFO"},
    ]
    assert [d["name"] for d in page["deals"]] == ["Won before", "Won now", "Open"]
    assert {"stage", "value", "close_date", "is_late", "expected_value"} <= set(page["deals"][0])


def test_unknown_id_gives_404(client):
    for response in [
        client.get("/api/organizations/999"),
        client.patch("/api/organizations/999", json={"name": "X"}),
        client.get("/api/organizations/999/delete-impact"),
        client.delete("/api/organizations/999"),
    ]:
        assert response.status_code == 404
        assert response.json() == {"detail": "Organization not found"}


def test_unknown_fields_are_refused(client):
    assert client.post("/api/organizations", json={"name": "Bluefin", "colour": "blue"}).status_code == 422
