"""TB22 to TB24: board moves."""

from conftest import TODAY


def column(api, stage):
    deals = api.ok("GET", f"/api/deals?stage={stage}")["items"]
    return [d["name"] for d in sorted(deals, key=lambda d: d["position"])]


# TB22
def test_move_to_won_applies_every_rule(api):
    org = api.org()
    contact = api.contact(organization_id=org["id"])
    deal = api.deal(
        org["id"],
        contact_id=contact["id"],
        stage="negotiation",
        close_date="2027-01-31",
    )
    moved = api.move(deal["id"], "won")
    assert moved["stage"] == "won"
    assert moved["probability"] == 100
    assert moved["close_date"] == TODAY.isoformat()
    assert api.ok("GET", f"/api/contacts/{contact['id']}")["status"] == "customer"
    texts = [e["text"] for e in api.ok("GET", f"/api/deals/{deal['id']}/timeline")["items"]]
    assert texts[0] == "Moved from Negotiation to Won"


def test_failed_move_changes_nothing(api, client):
    org = api.org()
    deal = api.deal(org["id"], stage="new")
    other = api.deal(org["id"], name="Other", stage="proposal")
    # The neighbor is in another column, so the move is refused as a whole.
    response = client.post(
        f"/api/deals/{deal['id']}/move",
        json={"stage": "qualified", "before_id": other["id"]},
    )
    assert response.status_code == 400
    assert api.ok("GET", f"/api/deals/{deal['id']}")["stage"] == "new"
    assert len(api.ok("GET", f"/api/deals/{deal['id']}/timeline")["items"]) == 1


# TB23
def test_move_within_column_changes_only_position(api):
    org = api.org()
    c = api.deal(org["id"], name="C", stage="proposal")
    b = api.deal(org["id"], name="B", stage="proposal")
    a = api.deal(org["id"], name="A", stage="proposal")
    api.ok("PATCH", f"/api/deals/{a['id']}", json={"probability": 60})
    assert column(api, "proposal") == ["A", "B", "C"]
    moved = api.move(a["id"], "proposal", after_id=c["id"])
    assert column(api, "proposal") == ["B", "C", "A"]
    assert moved["probability"] == 60
    assert len(api.ok("GET", f"/api/deals/{a['id']}/timeline")["items"]) == 1
    api.move(a["id"], "proposal", after_id=b["id"], before_id=c["id"])
    assert column(api, "proposal") == ["B", "A", "C"]


def test_drop_between_cards_in_another_column(api):
    org = api.org()
    y = api.deal(org["id"], name="Y", stage="qualified")
    x = api.deal(org["id"], name="X", stage="qualified")
    moving = api.deal(org["id"], name="M", stage="new")
    api.move(moving["id"], "qualified", after_id=x["id"], before_id=y["id"])
    assert column(api, "qualified") == ["X", "M", "Y"]


# TB24
def test_new_deal_goes_to_top_of_its_column(api):
    org = api.org()
    api.deal(org["id"], name="Old", stage="proposal")
    api.deal(org["id"], name="Newer", stage="proposal")
    api.deal(org["id"], name="Newest", stage="proposal")
    assert column(api, "proposal") == ["Newest", "Newer", "Old"]


def test_neighbours_in_the_wrong_order_are_refused(api, client):
    # A stale board (say, in another tab) can name neighbours that are reversed or
    # the same card. The move is refused with a field error, not a crash, and
    # nothing changes.
    org = api.org()
    a = api.deal(org["id"], name="A", stage="proposal")
    b = api.deal(org["id"], name="B", stage="proposal")
    moving = api.deal(org["id"], name="M", stage="new")
    assert column(api, "proposal") == ["B", "A"]
    for after_id, before_id in ((a["id"], b["id"]), (a["id"], a["id"])):
        body = {"stage": "proposal", "after_id": after_id, "before_id": before_id}
        response = client.post(f"/api/deals/{moving['id']}/move", json=body)
        assert response.status_code == 400
        assert response.json()["fields"] == {"before_id": "Choose where to put the deal."}
    assert api.ok("GET", f"/api/deals/{moving['id']}")["stage"] == "new"
    assert column(api, "proposal") == ["B", "A"]
