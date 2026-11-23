"""TB17 to TB21: deals."""


# TB17
def test_create_with_defaults(api):
    org = api.org()
    deal = api.deal(org["id"], value=48200)
    assert deal["stage"] == "new"
    assert deal["probability"] == 10
    assert deal["expected_revenue"] == 4820
    assert deal["organization_name"] == "Acme Ltd"


def test_required_fields(client):
    response = client.post("/api/deals", json={})
    assert response.status_code == 400
    assert response.json()["fields"] == {
        "name": "Enter a name.",
        "organization_id": "Choose an organization.",
        "value": "Enter a value from 0 to 1,000,000,000, in whole dollars.",
    }


def test_value_zero_or_more_whole_dollars(api, client):
    org = api.org()
    assert api.deal(org["id"], value=0)["value"] == 0
    assert api.deal(org["id"], value=1_000_000_000)["value"] == 1_000_000_000
    # RV1: too large, or "inf"/"nan", is a field error, never a server error.
    for bad in (
        -1,
        10.5,
        "lots",
        1_000_000_001,
        "99999999999999999999",
        "inf",
        "-Infinity",
        "nan",
    ):
        response = client.post(
            "/api/deals", json={"name": "D", "organization_id": org["id"], "value": bad}
        )
        assert response.json()["fields"] == {
            "value": "Enter a value from 0 to 1,000,000,000, in whole dollars."
        }


def test_probability_range(api, client):
    org = api.org()
    response = client.post(
        "/api/deals",
        json={
            "name": "D",
            "organization_id": org["id"],
            "value": 1,
            "probability": 120,
        },
    )
    assert response.json()["fields"] == {"probability": "Enter a probability from 0 to 100."}


# TB18
def test_organization_required_on_create_but_may_stay_empty(api, client):
    org = api.org()
    other = api.org("Other")
    deal = api.deal(org["id"])
    response = client.patch(f"/api/deals/{deal['id']}", json={"organization_id": None})
    assert response.status_code == 400
    assert response.json()["fields"] == {"organization_id": "Choose an organization."}
    client.delete(f"/api/organizations/{org['id']}")
    updated = api.ok(
        "PATCH",
        f"/api/deals/{deal['id']}",
        json={"organization_id": None, "name": "Kept"},
    )
    assert updated["organization_id"] is None
    assert updated["name"] == "Kept"
    updated = api.ok("PATCH", f"/api/deals/{deal['id']}", json={"organization_id": other["id"]})
    assert updated["organization_name"] == "Other"


# TB19
def test_every_stage_change_records_an_entry(api):
    org = api.org()
    deal = api.deal(org["id"])
    for stage in ("qualified", "proposal", "proposal", "lost"):
        api.ok("PATCH", f"/api/deals/{deal['id']}", json={"stage": stage})
    texts = [e["text"] for e in api.ok("GET", f"/api/deals/{deal['id']}/timeline")["items"]]
    assert texts == [
        "Moved from Proposal to Lost",
        "Moved from Qualified to Proposal",
        "Moved from New to Qualified",
        "Added in New",
    ]


# TB20
def test_delete_removes_activities_and_stage_changes(api, client, activity_exists):
    org = api.org()
    contact = api.contact(organization_id=org["id"])
    deal = api.deal(org["id"], contact_id=contact["id"])
    api.ok("PATCH", f"/api/deals/{deal['id']}", json={"stage": "proposal"})
    activity = api.activity(deal_id=deal["id"])
    impact = api.ok("GET", f"/api/deals/{deal['id']}/delete-impact")
    assert impact == {"name": "Big deal", "activities": 1, "stage_changes": 2}
    assert client.delete(f"/api/deals/{deal['id']}").status_code == 204
    assert not activity_exists(activity["id"])
    assert api.ok("GET", f"/api/contacts/{contact['id']}/timeline")["items"] == []


# TB21
def test_list_has_names_expected_revenue_and_stage_filter(api):
    org = api.org()
    contact = api.contact(organization_id=org["id"])
    api.deal(org["id"], name="A", contact_id=contact["id"], value=1000, stage="proposal")
    api.deal(org["id"], name="B", value=2000)
    everything = api.ok("GET", "/api/deals")
    assert everything["total"] == 2
    first = everything["items"][0]
    assert (
        first["organization_name"],
        first["contact_name"],
        first["expected_revenue"],
    ) == ("Acme Ltd", "Ada Park", 500)
    proposals = api.ok("GET", "/api/deals?stage=proposal")
    assert [d["name"] for d in proposals["items"]] == ["A"]
