from backend.tests.conftest import add_contact, add_deal, add_org, log, ok, patch_deal


def descriptions(entries):
    return [e["description"] for e in entries]


def test_a_deals_timeline_is_newest_first(client):
    org = add_org(client)
    deal = add_deal(client, org["id"])
    log(client, "Oldest", deal_id=deal["id"], occurred_at="2026-11-01T10:00:00Z")
    log(client, "Newest", deal_id=deal["id"], occurred_at="2026-11-12T10:00:00Z")
    log(client, "Middle", deal_id=deal["id"], occurred_at="2026-11-05T10:00:00Z")
    assert descriptions(ok(client.get(f"/api/deals/{deal['id']}/timeline"))) == ["Newest", "Middle", "Oldest"]


def test_the_entry_added_last_comes_first_when_times_match(client):
    org = add_org(client)
    deal = add_deal(client, org["id"])
    log(client, "Added first", deal_id=deal["id"], occurred_at="2026-11-10T10:00:00Z")
    log(client, "Added second", deal_id=deal["id"], occurred_at="2026-11-10T10:00:00Z")
    assert descriptions(ok(client.get(f"/api/deals/{deal['id']}/timeline"))) == ["Added second", "Added first"]


def test_a_contacts_timeline_includes_their_main_contact_deals(client):
    org = add_org(client)
    sarah = add_contact(client, "Sarah Chen", organization_id=org["id"])
    tom = add_contact(client, "Tom Reyes", organization_id=org["id"])
    hers = add_deal(client, org["id"], "Website redesign", main_contact_id=sarah["id"])
    his = add_deal(client, org["id"], "Tom's deal", main_contact_id=tom["id"])
    log(client, "On Sarah", contact_id=sarah["id"], occurred_at="2026-11-10T10:00:00Z")
    log(client, "On her deal", deal_id=hers["id"], occurred_at="2026-11-11T10:00:00Z")
    log(client, "On Tom", contact_id=tom["id"], occurred_at="2026-11-12T10:00:00Z")
    log(client, "On his deal", deal_id=his["id"], occurred_at="2026-11-13T10:00:00Z")
    patch_deal(client, hers["id"], stage="negotiation")

    timeline = ok(client.get(f"/api/contacts/{sarah['id']}/timeline"))
    assert descriptions(timeline) == ["Moved from Proposal to Negotiation", "On her deal", "On Sarah"]
    # Entries from a deal name the deal.
    assert timeline[0]["deal"] == {"id": hers["id"], "name": "Website redesign"}
    assert timeline[1]["deal"] == {"id": hers["id"], "name": "Website redesign"}
    assert timeline[2]["contact"] == {"id": sarah["id"], "name": "Sarah Chen"}


def test_entries_follow_the_deals_current_main_contact(client):
    org = add_org(client)
    sarah = add_contact(client, "Sarah Chen", organization_id=org["id"])
    tom = add_contact(client, "Tom Reyes", organization_id=org["id"])
    deal = add_deal(client, org["id"], main_contact_id=sarah["id"])
    log(client, "Call with Sarah", deal_id=deal["id"])

    patch_deal(client, deal["id"], main_contact_id=tom["id"])
    assert descriptions(ok(client.get(f"/api/contacts/{sarah['id']}/timeline"))) == []
    assert descriptions(ok(client.get(f"/api/contacts/{tom['id']}/timeline"))) == ["Call with Sarah"]
