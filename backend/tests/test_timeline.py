"""TB27 to TB29: timelines."""


def setup(api):
    org = api.org()
    contact = api.contact(organization_id=org["id"])
    deal = api.deal(org["id"], name="Renewal", contact_id=contact["id"])
    return org, contact, deal


# TB27
def test_contact_timeline(api):
    org, contact, deal = setup(api)
    api.activity("Own call", contact_id=contact["id"], occurred_on="2026-11-01")
    api.activity("Deal email", type="email", deal_id=deal["id"], occurred_on="2026-11-05")
    api.ok("PATCH", f"/api/deals/{deal['id']}", json={"stage": "qualified"})
    other = api.deal(org["id"], name="Not theirs")
    api.activity("Elsewhere", deal_id=other["id"])
    items = api.ok("GET", f"/api/contacts/{contact['id']}/timeline")["items"]
    assert [(e["text"], (e["deal"] or {}).get("name")) for e in items] == [
        ("Moved from New to Qualified", "Renewal"),
        ("Added in New", "Renewal"),
        ("Deal email", "Renewal"),
        ("Own call", None),
    ]


# TB28
def test_deal_timeline_newest_first(api):
    _, _, deal = setup(api)
    api.activity("Older", deal_id=deal["id"], occurred_on="2026-10-01")
    api.activity("Newer", deal_id=deal["id"], occurred_on="2026-11-10", follow_up_on="2026-11-18")
    api.ok("PATCH", f"/api/deals/{deal['id']}", json={"stage": "proposal"})
    items = api.ok("GET", f"/api/deals/{deal['id']}/timeline")["items"]
    assert [e["text"] for e in items] == [
        "Moved from New to Proposal",
        "Added in New",
        "Newer",
        "Older",
    ]
    newer = items[2]
    assert newer["follow_up_status"] == "upcoming"
    assert newer["deal"] is None


# TB29
def test_entries_follow_the_main_contact(api):
    org, first, deal = setup(api)
    second = api.contact("Bo", organization_id=org["id"])
    api.activity("On the deal", deal_id=deal["id"])
    api.ok("PATCH", f"/api/deals/{deal['id']}", json={"contact_id": second["id"]})
    assert api.ok("GET", f"/api/contacts/{first['id']}/timeline")["items"] == []
    texts = [e["text"] for e in api.ok("GET", f"/api/contacts/{second['id']}/timeline")["items"]]
    assert "On the deal" in texts


# TB28: the user's today can differ from the computer's clock (another time zone, or a
# fixed test date). Entries on the same day still show in the order they were made.
def test_same_day_order_when_today_is_not_the_clock_date(api):
    day = {"X-Local-Date": "2026-01-05"}
    contact = api.contact()
    deal_body = {
        "name": "Renewal",
        "value": 1000,
        "organization_id": api.org()["id"],
        "contact_id": contact["id"],
    }
    deal = api.ok("POST", "/api/deals", 201, headers=day, json=deal_body)
    email = {
        "type": "email",
        "description": "Sent an offer",
        "deal_id": deal["id"],
        "occurred_on": "2026-01-05",
    }
    api.ok("POST", "/api/activities", 201, headers=day, json=email)
    api.ok("PATCH", f"/api/deals/{deal['id']}", headers=day, json={"stage": "proposal"})
    expected = ["Moved from New to Proposal", "Sent an offer", "Added in New"]
    for url in (
        f"/api/deals/{deal['id']}/timeline",
        f"/api/contacts/{contact['id']}/timeline",
    ):
        assert [e["text"] for e in api.ok("GET", url, headers=day)["items"]] == expected, url
    recent = [r["text"] for r in api.ok("GET", "/api/dashboard", headers=day)["recent"]]
    assert recent.index("Moved from New to Proposal") < recent.index("Sent an offer")
