from datetime import date, datetime, timedelta

import pytest
from conftest import NOW
from sqlalchemy import insert

from accountable import db
from accountable.crm.tables import activities


def entries(api, path: str) -> list[dict]:
    return api.get(f"{path}/timeline").json()["entries"]


def descriptions(api, path: str) -> list[str]:
    return [entry["description"] for entry in entries(api, path)]


def test_deal_timeline_shows_its_activities_and_stage_changes(api, make):
    deal = make.deal()
    make.deal("Other")
    make.activity(deal_id=deal, description="First note", occurred_at=NOW - timedelta(days=2))
    api.post(f"/api/deals/{deal}/move", json={"stage": "qualified"})

    assert descriptions(api, f"/api/deals/{deal}") == ["Moved from New to Qualified", "First note"]


def test_contact_timeline_adds_the_deals_where_they_are_the_main_contact(api, make):
    contact = make.contact()
    theirs = make.deal(main_contact_id=contact)
    someone_elses = make.deal("Not theirs")
    make.activity(contact_id=contact, description="On the contact", occurred_at=NOW - timedelta(days=3))
    make.activity(deal_id=theirs, description="On their deal", occurred_at=NOW - timedelta(days=2))
    make.activity(deal_id=someone_elses, description="Not on theirs", occurred_at=NOW - timedelta(days=1))
    api.post(f"/api/deals/{theirs}/move", json={"stage": "proposal"})

    assert descriptions(api, f"/api/contacts/{contact}") == [
        "Moved from New to Proposal",
        "On their deal",
        "On the contact",
    ]


def test_organization_timeline_shows_everything_once(api, make):
    organization = make.organization()
    contact = make.contact(organization_id=organization)
    deal = make.deal(organization_id=organization, main_contact_id=contact)
    make.activity(contact_id=contact, description="On the contact")
    make.activity(deal_id=deal, description="On the deal, reached two ways")
    api.post(f"/api/deals/{deal}/move", json={"stage": "qualified"})

    found = descriptions(api, f"/api/organizations/{organization}")
    assert sorted(found) == ["Moved from New to Qualified", "On the contact", "On the deal, reached two ways"]


def test_organization_timeline_includes_a_contacts_deal_at_another_organization(api, make):
    organization = make.organization()
    contact = make.contact(organization_id=organization)
    deal = make.deal(main_contact_id=contact)
    make.activity(deal_id=deal, description="Their deal elsewhere")

    assert descriptions(api, f"/api/organizations/{organization}") == ["Their deal elsewhere"]


def test_timelines_are_newest_first(api, make):
    deal = make.deal()
    for days in (3, 1, 2):
        make.activity(deal_id=deal, description=f"{days} days ago", occurred_at=NOW - timedelta(days=days))
    assert descriptions(api, f"/api/deals/{deal}") == ["1 days ago", "2 days ago", "3 days ago"]


def test_paging_stays_stable_when_entries_share_a_time(api, make):
    deal = make.deal()
    made = [make.activity(deal_id=deal, occurred_at=NOW) for _ in range(25)]

    seen = []
    for offset in range(0, 25, 10):
        reply = api.get(f"/api/deals/{deal}/timeline", params={"limit": 10, "offset": offset}).json()
        assert reply["total"] == 25
        seen += [entry["id"] for entry in reply["entries"]]

    assert sorted(seen) == sorted(made)


def test_timelines_default_to_fifty_entries(api, make):
    deal = make.deal()
    for _ in range(55):
        make.activity(deal_id=deal)
    reply = api.get(f"/api/deals/{deal}/timeline").json()
    assert len(reply["entries"]) == 50
    assert reply["total"] == 55


def test_changing_a_deals_main_contact_moves_its_entries(api, make):
    first = make.contact("First")
    second = make.contact("Second")
    deal = make.deal(main_contact_id=first)
    make.activity(deal_id=deal, description="On the deal")

    assert descriptions(api, f"/api/contacts/{first}") == ["On the deal"]

    api.patch(f"/api/deals/{deal}", json={"main_contact_id": second})

    assert descriptions(api, f"/api/contacts/{first}") == []
    assert descriptions(api, f"/api/contacts/{second}") == ["On the deal"]


def test_stage_change_entries_say_what_they_are_and_have_no_activity_route(api, make):
    deal = make.deal()
    api.post(f"/api/deals/{deal}/move", json={"stage": "qualified"})
    entry = entries(api, f"/api/deals/{deal}")[0]

    assert entry["kind"] == "stage_change"
    assert entry["type"] is None
    assert entry["about"] == {"kind": "deal", "id": deal, "name": "Annual support"}
    assert api.patch(f"/api/activities/{entry['id']}", json={"description": "Hacked"}).status_code == 404
    assert api.delete(f"/api/activities/{entry['id']}").status_code == 404


def test_the_stage_change_wording_is_the_specs(api, make):
    deal = make.deal(stage="proposal")
    api.post(f"/api/deals/{deal}/move", json={"stage": "negotiation"})
    assert descriptions(api, f"/api/deals/{deal}") == ["Moved from Proposal to Negotiation"]


def test_a_stage_change_shows_on_all_three_timelines(api, make):
    organization = make.organization()
    contact = make.contact(organization_id=organization)
    deal = make.deal(organization_id=organization, main_contact_id=contact)
    api.post(f"/api/deals/{deal}/move", json={"stage": "qualified"})
    wording = ["Moved from New to Qualified"]
    assert descriptions(api, f"/api/deals/{deal}") == wording
    assert descriptions(api, f"/api/contacts/{contact}") == wording
    assert descriptions(api, f"/api/organizations/{organization}") == wording


def test_done_follow_ups_stay_on_the_timeline(api, make):
    deal = make.deal()
    activity = make.activity(deal_id=deal, follow_up_date=date(2026, 11, 2))
    api.patch(f"/api/activities/{activity}", json={"follow_up_done": True})

    entry = entries(api, f"/api/deals/{deal}")[0]
    assert entry["follow_up_date"] == "2026-11-02"
    assert entry["follow_up_done"] is True


def test_each_entry_links_to_what_it_belongs_to(api, make):
    contact = make.contact()
    deal = make.deal(main_contact_id=contact)
    make.activity(contact_id=contact, description="On contact", occurred_at=NOW - timedelta(days=1))
    make.activity(deal_id=deal, description="On deal")

    found = {entry["description"]: entry["about"] for entry in entries(api, f"/api/contacts/{contact}")}
    assert found["On contact"] == {"kind": "contact", "id": contact, "name": "Sam Carter"}
    assert found["On deal"] == {"kind": "deal", "id": deal, "name": "Annual support"}


def test_an_entry_on_a_deal_keeps_the_deals_name_when_its_contact_is_a_main_contact_elsewhere(api, make):
    contact = make.contact()
    make.deal("A different deal", main_contact_id=contact)
    deal = make.deal("The right deal", main_contact_id=contact)
    make.activity(deal_id=deal)

    assert entries(api, f"/api/deals/{deal}")[0]["about"]["name"] == "The right deal"


def test_all_times_carry_a_z(api, make):
    deal = make.deal()
    make.activity(deal_id=deal, occurred_at=datetime(2026, 10, 1, 9, 30))
    api.post(f"/api/deals/{deal}/move", json={"stage": "qualified"})

    for entry in entries(api, f"/api/deals/{deal}"):
        assert entry["at"].endswith("Z")
        assert datetime.fromisoformat(entry["at"].replace("Z", "+00:00")).utcoffset() == timedelta(0)


@pytest.mark.parametrize("kind", ["deals", "contacts", "organizations"])
def test_a_timeline_can_be_read_to_the_end_however_long_it_is(api, make, kind):
    """Longer than the most one reply can hold, with every entry at the same moment."""
    organization = make.organization()
    contact = make.contact(organization_id=organization)
    deal = make.deal(organization_id=organization, main_contact_id=contact)
    rows = [
        {"type": "note", "deal_id": deal, "contact_id": None, "description": f"Entry {number}", "occurred_at": NOW}
        for number in range(620)
    ]
    with db.writing() as conn:
        conn.execute(insert(activities), rows)

    record = {"deals": deal, "contacts": contact, "organizations": organization}[kind]
    seen: list[int] = []
    while True:
        reply = api.get(f"/api/{kind}/{record}/timeline", params={"limit": 50, "offset": len(seen)}).json()
        if not reply["entries"]:
            break
        seen.extend(entry["id"] for entry in reply["entries"])
    assert reply["total"] == 620
    assert len(seen) == 620
    assert len(set(seen)) == 620
