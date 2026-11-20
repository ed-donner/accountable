import pytest

from backend.tests.conftest import add_contact, add_deal, add_org, column, field_errors, ok, patch_deal

VALUE_MESSAGE = "Enter a whole number of dollars from $0 to $100,000,000."


@pytest.fixture
def org(client):
    return add_org(client, "Bluefin Logistics")


def test_a_deal_comes_back_in_the_spec_shape(client, org):
    sarah = add_contact(client, "Sarah Chen", organization_id=org["id"])
    deal = add_deal(client, org["id"], "Website redesign", stage="proposal", value=48500, main_contact_id=sarah["id"])
    assert deal == {
        "id": deal["id"],
        "name": "Website redesign",
        "organization": {"id": org["id"], "name": "Bluefin Logistics"},
        "main_contact": {"id": sarah["id"], "name": "Sarah Chen"},
        "stage": "proposal",
        "value": 48500,
        "probability": 50,
        "expected_value": 24250,
        "close_date": "2026-12-12",
        "is_late": False,
        "position": 0,
        "created_at": "2026-11-19T15:00:00Z",
        "updated_at": "2026-11-19T15:00:00Z",
    }


@pytest.mark.parametrize(
    ("stage", "probability"),
    [("new", 10), ("qualified", 25), ("proposal", 50), ("negotiation", 75), ("won", 100), ("lost", 0)],
)
def test_a_new_deal_takes_its_stages_probability(client, org, stage, probability):
    assert add_deal(client, org["id"], stage=stage)["probability"] == probability


def test_a_probability_sent_at_an_open_stage_is_kept(client, org):
    assert add_deal(client, org["id"], stage="qualified", probability=40)["probability"] == 40


@pytest.mark.parametrize(("stage", "probability"), [("won", 100), ("lost", 0)])
def test_won_and_lost_ignore_a_probability_sent(client, org, stage, probability):
    assert add_deal(client, org["id"], stage=stage, probability=55)["probability"] == probability


@pytest.mark.parametrize("stage", ["won", "lost"])
def test_won_or_lost_starts_with_today_as_the_close_date(client, org, stage):
    assert add_deal(client, org["id"], stage=stage)["close_date"] == "2026-11-19"
    assert add_deal(client, org["id"], stage=stage, close_date="2026-10-01")["close_date"] == "2026-10-01"


def test_an_open_deal_needs_a_close_date(client, org):
    body = {"name": "X", "organization_id": org["id"], "stage": "new", "value": 100}
    assert field_errors(client.post("/api/deals", json=body)) == {"close_date": "Enter a close date."}


def test_a_new_deal_goes_to_the_top_of_its_column(client, org):
    first = add_deal(client, org["id"], "First")
    second = add_deal(client, org["id"], "Second")
    assert column(client, "proposal") == [(second["id"], 0), (first["id"], 1)]
    # Another stage's column is left alone.
    other = add_deal(client, org["id"], "Elsewhere", stage="new")
    assert column(client, "new") == [(other["id"], 0)]
    assert column(client, "proposal") == [(second["id"], 0), (first["id"], 1)]


def test_the_organization_is_required_and_must_exist(client):
    assert "organization_id" in field_errors(
        client.post("/api/deals", json={"name": "X", "stage": "new", "value": 1, "close_date": "2026-12-01"})
    )
    errors = field_errors(
        client.post(
            "/api/deals", json={"name": "X", "organization_id": 999, "stage": "new", "value": 1, "close_date": "2026-12-01"}
        )
    )
    assert errors == {"organization_id": "Choose an organization from the list."}


@pytest.mark.parametrize("value", [-1, 100_000_001, 1.5, "lots", None])
def test_bad_values(client, org, value):
    body = {"name": "X", "organization_id": org["id"], "stage": "new", "value": value, "close_date": "2026-12-01"}
    assert field_errors(client.post("/api/deals", json=body)) == {"value": VALUE_MESSAGE}


@pytest.mark.parametrize("value", [0, 100_000_000])
def test_value_limits(client, org, value):
    assert add_deal(client, org["id"], value=value)["value"] == value


@pytest.mark.parametrize("probability", [-1, 101, 12.5])
def test_bad_probabilities(client, org, probability):
    body = {
        "name": "X",
        "organization_id": org["id"],
        "stage": "new",
        "value": 1,
        "probability": probability,
        "close_date": "2026-12-01",
    }
    assert field_errors(client.post("/api/deals", json=body)) == {"probability": "Enter a whole percent from 0 to 100."}


def test_the_main_contact_must_be_from_the_deals_organization(client, org):
    other = add_org(client, "Cedar Health")
    tom = add_contact(client, "Tom Reyes", organization_id=other["id"])
    loner = add_contact(client, "Lee Lone")
    for contact in (tom, loner):
        body = {
            "name": "X",
            "organization_id": org["id"],
            "main_contact_id": contact["id"],
            "stage": "new",
            "value": 1,
            "close_date": "2026-12-01",
        }
        errors = field_errors(client.post("/api/deals", json=body))
        assert errors == {"main_contact_id": "Choose a contact from Bluefin Logistics."}


def test_changing_the_organization_clears_the_main_contact(client, org):
    sarah = add_contact(client, organization_id=org["id"])
    other = add_org(client, "Cedar Health")
    deal = add_deal(client, org["id"], main_contact_id=sarah["id"])
    changed = patch_deal(client, deal["id"], organization_id=other["id"])
    assert changed["organization"]["name"] == "Cedar Health"
    assert changed["main_contact"] is None


def test_changing_the_organization_with_a_contact_from_it_keeps_that_contact(client, org):
    other = add_org(client, "Cedar Health")
    tom = add_contact(client, "Tom Reyes", organization_id=other["id"])
    deal = add_deal(client, org["id"])
    changed = patch_deal(client, deal["id"], organization_id=other["id"], main_contact_id=tom["id"])
    assert changed["main_contact"] == {"id": tom["id"], "name": "Tom Reyes"}


def test_a_patch_with_a_contact_from_elsewhere_is_refused(client, org):
    tom = add_contact(client, "Tom Reyes", organization_id=add_org(client, "Cedar")["id"])
    deal = add_deal(client, org["id"])
    assert field_errors(client.patch(f"/api/deals/{deal['id']}", json={"main_contact_id": tom["id"]})) == {
        "main_contact_id": "Choose a contact from Bluefin Logistics."
    }


def test_expected_value_and_late(client, org):
    late = add_deal(client, org["id"], stage="proposal", value=48500, close_date="2026-11-18")
    assert late["expected_value"] == 24250
    assert late["is_late"] is True
    assert add_deal(client, org["id"], stage="proposal", close_date="2026-11-19")["is_late"] is False
    assert add_deal(client, org["id"], stage="won", close_date="2026-11-18")["is_late"] is False


def test_the_list_includes_names_and_is_sorted_by_close_date(client, org):
    sarah = add_contact(client, "Sarah Chen", organization_id=org["id"])
    add_deal(client, org["id"], "Later", close_date="2027-02-01")
    add_deal(client, org["id"], "Sooner", close_date="2026-12-01", main_contact_id=sarah["id"])
    rows = ok(client.get("/api/deals"))
    assert [r["name"] for r in rows] == ["Sooner", "Later"]
    assert rows[0]["organization"]["name"] == "Bluefin Logistics"
    assert rows[0]["main_contact"]["name"] == "Sarah Chen"


def test_editing_fields(client, org):
    deal = add_deal(client, org["id"])
    changed = patch_deal(client, deal["id"], name="Bigger redesign", value=60000, close_date="2027-01-15")
    assert (changed["name"], changed["value"], changed["close_date"]) == ("Bigger redesign", 60000, "2027-01-15")
    assert changed["updated_at"] == "2026-11-19T15:00:00Z"


def test_required_fields_cant_be_cleared(client, org):
    deal = add_deal(client, org["id"])
    for field in ("name", "organization_id", "stage", "value", "close_date"):
        assert field in field_errors(client.patch(f"/api/deals/{deal['id']}", json={field: None}))


def test_unknown_id_gives_404(client):
    for response in [
        client.get("/api/deals/999"),
        client.patch("/api/deals/999", json={"name": "X"}),
        client.post("/api/deals/999/move", json={"stage": "new", "before_id": None}),
        client.get("/api/deals/999/timeline"),
        client.get("/api/deals/999/delete-impact"),
        client.delete("/api/deals/999"),
    ]:
        assert response.status_code == 404
        assert response.json() == {"detail": "Deal not found"}
