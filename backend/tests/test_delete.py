from datetime import date

import pytest
from accountable import db, holds, main
from accountable.crm.tables import activities, contacts, deals, organizations, stage_changes
from accountable.holds import Hold
from accountable.invoices.tables import invoices
from conftest import NOW, TODAY
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError


def count(table, *where) -> int:
    with db.reading() as conn:
        return conn.execute(select(func.count()).select_from(table).where(*where)).scalar_one()


def test_deleting_an_organization_keeps_its_contacts_and_deals(api, make, deal_row, contact_row):
    organization = make.organization()
    contacts = [make.contact(f"Contact {n}", organization_id=organization) for n in range(4)]
    deals = [make.deal(f"Deal {n}", organization_id=organization) for n in range(3)]

    impact = api.get(f"/api/organizations/{organization}/delete-impact").json()
    assert impact == {"contacts": 4, "deals": 3, "held_by": []}

    assert api.delete(f"/api/organizations/{organization}").status_code == 204

    assert api.get(f"/api/organizations/{organization}").status_code == 404
    assert len(contacts) == impact["contacts"]
    assert all(contact_row(contact).organization_id is None for contact in contacts)
    assert all(deal_row(deal).organization_id is None for deal in deals)


def test_deleting_a_contact_keeps_their_deals_and_removes_their_activities(api, make, deal_row):
    contact = make.contact()
    deals = [make.deal(f"Deal {n}", main_contact_id=contact) for n in range(2)]
    make.activity(contact_id=contact)
    make.activity(contact_id=contact)
    make.activity(contact_id=contact)

    impact = api.get(f"/api/contacts/{contact}/delete-impact").json()
    assert impact == {"deals": 2, "activities": 3}

    assert api.delete(f"/api/contacts/{contact}").status_code == 204

    assert all(deal_row(deal).main_contact_id is None for deal in deals)
    assert count(activities) == 0


def test_a_deals_activities_stay_when_its_main_contact_goes(api, make):
    contact = make.contact()
    deal = make.deal(main_contact_id=contact)
    make.activity(deal_id=deal)
    make.activity(contact_id=contact)

    api.delete(f"/api/contacts/{contact}")

    assert count(activities, activities.c.deal_id == deal) == 1
    assert count(activities) == 1


def test_deleting_a_deal_removes_its_activities_and_stage_changes(api, make):
    deal = make.deal()
    other = make.deal("Other")
    make.activity(deal_id=deal)
    make.activity(deal_id=deal)
    make.activity(deal_id=other)
    api.post(f"/api/deals/{deal}/move", json={"stage": "qualified"})

    impact = api.get(f"/api/deals/{deal}/delete-impact").json()
    assert impact == {"activities": 2, "stage_changes": 1, "won": False, "value": 10000, "held_by": []}

    assert api.delete(f"/api/deals/{deal}").status_code == 204

    assert count(activities) == 1
    assert count(stage_changes) == 0


def test_deleting_a_won_deal_says_so_and_its_revenue_leaves_the_dashboard(api, make):
    deal = make.deal(stage="won", value=7000, close_date=TODAY)
    assert api.get("/api/dashboard").json()["revenue_this_month"] == 7000

    impact = api.get(f"/api/deals/{deal}/delete-impact").json()
    assert impact["won"] is True
    assert impact["value"] == 7000

    api.delete(f"/api/deals/{deal}")
    assert api.get("/api/dashboard").json()["revenue_this_month"] == 0


def test_deleting_an_activity_removes_it_from_timelines_and_the_dashboard(api, make):
    contact = make.contact()
    deal = make.deal(main_contact_id=contact)
    activity = make.activity(deal_id=deal, follow_up_date=date(2026, 11, 5), occurred_at=NOW)

    assert api.get(f"/api/contacts/{contact}/timeline").json()["total"] == 1
    assert api.get("/api/dashboard").json()["follow_ups"]["upcoming"] == 1

    assert api.delete(f"/api/activities/{activity}").status_code == 204

    assert api.get(f"/api/contacts/{contact}/timeline").json()["total"] == 0
    assert api.get(f"/api/deals/{deal}/timeline").json()["total"] == 0
    dashboard = api.get("/api/dashboard").json()
    assert dashboard["follow_ups"]["upcoming"] == 0
    assert dashboard["recent"] == []


def test_a_won_deal_stays_counted_after_its_organization_and_contact_go(api, make):
    organization = make.organization()
    contact = make.contact(organization_id=organization)
    make.deal(
        stage="won",
        value=9000,
        close_date=TODAY,
        organization_id=organization,
        main_contact_id=contact,
    )

    api.delete(f"/api/organizations/{organization}")
    api.delete(f"/api/contacts/{contact}")

    dashboard = api.get("/api/dashboard").json()
    assert dashboard["revenue_this_month"] == 9000
    assert dashboard["deals_won_this_month"] == 1


# These stand in for a later area's records, such as a deal's invoices, so the CRM's own tests
# need no invoices: a deal's activities, and an organization's contacts and deals.
STAND_IN_HOLDS = [
    Hold(activities.c.deal_id, "activity"),
    Hold(contacts.c.organization_id, "contact"),
    Hold(deals.c.organization_id, "deal"),
]


@pytest.fixture
def held(local_app):
    local_app.dependency_overrides[holds.app_holds] = lambda: STAND_IN_HOLDS


def test_invoices_hold_their_deal_and_the_organization_they_were_issued_to():
    given = [(hold.link, hold.noun) for area in main.AREAS for hold in area.holds]
    assert given == [(invoices.c.deal_id, "invoice"), (invoices.c.organization_id, "invoice")]
    assert [hold.held for hold in main.app.state.holds] == [deals, organizations]


def test_a_deal_with_only_a_draft_cant_be_deleted(api, make):
    deal = make.deal(stage="won")
    make.invoice(deal)
    make.invoice(deal)

    assert api.get(f"/api/deals/{deal}/delete-impact").json()["held_by"] == [{"noun": "invoice", "count": 2}]
    refused = api.delete(f"/api/deals/{deal}")
    assert (refused.status_code, refused.json()) == (
        409,
        {"detail": "This deal has 2 invoices, so it can't be deleted."},
    )
    assert count(invoices) == 2


def test_an_organization_with_an_issued_invoice_cant_be_deleted(api, make):
    organization = make.organization()
    deal = make.deal(stage="won")
    make.invoice(deal, status="issued", organization_id=organization, number="INV-0001")

    impact = api.get(f"/api/organizations/{organization}/delete-impact").json()
    assert impact["held_by"] == [{"noun": "invoice", "count": 1}]
    refused = api.delete(f"/api/organizations/{organization}")
    assert (refused.status_code, refused.json()) == (
        409,
        {"detail": "This organization has 1 invoice, so it can't be deleted."},
    )


def test_a_draft_doesnt_hold_its_deals_organization(api, make):
    """Only an issued invoice belongs to an organization (V11), so a draft holds its deal alone."""
    organization = make.organization()
    deal = make.deal(stage="won", organization_id=organization)
    make.invoice(deal)
    assert api.delete(f"/api/organizations/{organization}").status_code == 204
    assert api.get(f"/api/deals/{deal}").json()["organization_id"] is None


def test_the_database_refuses_a_held_delete_that_gets_past_the_route(make):
    deal = make.deal(stage="won")
    make.invoice(deal)
    with pytest.raises(IntegrityError), db.writing() as conn:
        conn.execute(delete(deals).where(deals.c.id == deal))


def test_a_hold_holds_the_table_its_link_points_at():
    assert [hold.held for hold in STAND_IN_HOLDS] == [deals, organizations, organizations]


def test_a_held_deal_says_what_holds_it_and_cant_be_deleted(api, make, held):
    deal = make.deal()
    make.activity(deal_id=deal)
    make.activity(deal_id=deal)

    assert api.get(f"/api/deals/{deal}/delete-impact").json()["held_by"] == [{"noun": "activity", "count": 2}]

    refused = api.delete(f"/api/deals/{deal}")
    assert (refused.status_code, refused.json()) == (
        409,
        {"detail": "This deal has 2 activities, so it can't be deleted."},
    )
    assert api.get(f"/api/deals/{deal}").status_code == 200
    assert count(activities) == 2


def test_a_held_organization_names_each_kind_that_holds_it(api, make, held):
    organization = make.organization()
    make.contact(organization_id=organization)
    make.deal("One", organization_id=organization)
    make.deal("Two", organization_id=organization)

    impact = api.get(f"/api/organizations/{organization}/delete-impact").json()
    assert impact["held_by"] == [{"noun": "contact", "count": 1}, {"noun": "deal", "count": 2}]

    refused = api.delete(f"/api/organizations/{organization}")
    assert refused.status_code == 409
    assert refused.json()["detail"] == "This organization has 1 contact and 2 deals, so it can't be deleted."
    assert api.get(f"/api/organizations/{organization}").status_code == 200


def test_only_what_points_at_a_record_holds_it(api, make, held):
    held_deal = make.deal("Held")
    free_deal = make.deal("Free")
    make.activity(deal_id=held_deal)
    organization = make.organization()

    assert api.get(f"/api/deals/{free_deal}/delete-impact").json()["held_by"] == []
    assert api.delete(f"/api/deals/{free_deal}").status_code == 204
    # A deal's hold is on deals only, so an organization with none of its own goes.
    assert api.delete(f"/api/organizations/{organization}").status_code == 204
    assert api.get(f"/api/deals/{held_deal}").status_code == 200


def test_a_missing_record_is_still_a_404_with_holds_given(api, held):
    assert api.delete("/api/deals/999").status_code == 404
    assert api.get("/api/organizations/999/delete-impact").status_code == 404


@pytest.mark.parametrize(
    ("items", "said"),
    [
        (["2 quotes"], "2 quotes"),
        (["2 quotes", "1 invoice"], "2 quotes and 1 invoice"),
        (["2 quotes", "1 invoice", "3 bills"], "2 quotes, 1 invoice and 3 bills"),
    ],
)
def test_what_holds_a_record_is_listed_as_a_sentence_says_it(items, said):
    assert holds.listed(items) == said


@pytest.mark.parametrize(
    ("count", "noun", "said"),
    [
        (1, "invoice", "1 invoice"),
        (3, "invoice", "3 invoices"),
        (1, "activity", "1 activity"),
        (2, "activity", "2 activities"),
    ],
)
def test_each_count_has_its_noun_in_the_plural_where_it_needs_one(count, noun, said):
    assert holds.plural(count, noun) == said
