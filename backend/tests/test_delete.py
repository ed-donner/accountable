from datetime import date

from accountable import db
from accountable.crm.tables import activities, stage_changes
from conftest import NOW, TODAY
from sqlalchemy import func, select


def count(table, *where) -> int:
    with db.reading() as conn:
        return conn.execute(select(func.count()).select_from(table).where(*where)).scalar_one()


def test_deleting_an_organization_keeps_its_contacts_and_deals(api, make, deal_row, contact_row):
    organization = make.organization()
    contacts = [make.contact(f"Contact {n}", organization_id=organization) for n in range(4)]
    deals = [make.deal(f"Deal {n}", organization_id=organization) for n in range(3)]

    impact = api.get(f"/api/organizations/{organization}/delete-impact").json()
    assert impact == {"contacts": 4, "deals": 3}

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
    assert impact == {"activities": 2, "stage_changes": 1, "won": False, "value": 10000}

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
